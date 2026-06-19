import "server-only";
import { createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { cookies } from "next/headers";
import { LoginProvider, OfficerRole, OfficerStatus, Prisma } from "@prisma/client";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { createOfficerSession, getSessionDurationHours } from "@/lib/session";
import { getEveSsoServerConfig } from "@/lib/eve-sso/config";
import { sanitizeProtectedReturnTo } from "@/lib/route-policy";

const oauthStateCookieName = "vyraj_eve_oauth_state";
const oauthReturnToCookieName = "vyraj_eve_oauth_return_to";
const unlinkedIdentityCookieName = "vyraj_eve_unlinked_identity";
const oauthStateMaxAgeSeconds = 10 * 60;
const unlinkedIdentityMaxAgeSeconds = Math.round(getSessionDurationHours() * 60 * 60);
const acceptedIssuers = new Set([
  "login.eveonline.com",
  "https://login.eveonline.com",
  "https://login.eveonline.com/"
]);

type EveTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

type EveJwtClaims = {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  name?: string;
  sub?: string;
};

type EveCharacterPublicData = {
  alliance_id?: number;
  corporation_id?: number;
  name?: string;
};

type EveCorporationPublicData = {
  alliance_id?: number;
  name?: string;
};

type EveAlliancePublicData = {
  name?: string;
};

type EveIdentityEnrichment = {
  characterName: string;
  corporationId: bigint | null;
  corporationName: string;
  allianceId: bigint | null;
  allianceName: string;
  memberCorpId?: string | null;
  matchedCorp: {
    id: string;
    slug: string;
    name: string;
    ticker: string;
  } | null;
};

type EveEnrichmentStage = "character" | "corporation" | "alliance" | "match" | "save";

class EveEnrichmentError extends Error {
  constructor(
    message: string,
    readonly stage: EveEnrichmentStage,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "EveEnrichmentError";
  }
}

type Jwks = {
  keys?: Array<JsonWebKey & { kid?: string; alg?: string }>;
};

type JwksMetadata = {
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  issuer?: string;
};

let cachedMetadata: JwksMetadata | null = null;
let cachedMetadataExpiresAt = 0;
let cachedJwks: Jwks | null = null;
let cachedJwksExpiresAt = 0;

export function isEveSsoConfiguredForLogin() {
  return getEveSsoServerConfig().eveLoginEnabled;
}

export async function buildEveAuthorizeUrl(returnTo?: string) {
  const config = getEveSsoServerConfig();

  if (!config.eveLoginEnabled) {
    throw new Error(`EVE SSO is not configured. Missing: ${config.missingVariables.join(", ")}.`);
  }

  const metadata = await getSsoMetadata(config.ssoBaseUrl);
  const authorizationEndpoint =
    metadata.authorization_endpoint ||
    `${config.ssoBaseUrl.replace(/\/$/, "")}/v2/oauth/authorize`;
  const state = createOAuthState();
  await setOAuthStateCookie(state);

  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  await setOAuthReturnToCookie(returnTo);

  return url;
}

export async function verifyAndConsumeOAuthState(returnedState: string) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(oauthStateCookieName)?.value || "";
  cookieStore.delete(oauthStateCookieName);

  if (!returnedState || !storedState) {
    cookieStore.delete(oauthReturnToCookieName);
    return false;
  }

  const returned = Buffer.from(returnedState);
  const stored = Buffer.from(storedState);

  return returned.length === stored.length && timingSafeEqual(returned, stored);
}

export async function clearOAuthStateCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(oauthStateCookieName);
  cookieStore.delete(oauthReturnToCookieName);
}

export async function clearEveSsoLocalCookies() {
  const cookieStore = await cookies();

  // Local EVE SSO cookies:
  // - vyraj_eve_oauth_state protects the in-flight OAuth redirect.
  // - vyraj_eve_oauth_return_to preserves a safe member-module destination.
  // - vyraj_eve_unlinked_identity stores the verified member checkpoint identity.
  // App logout should clear both. Neither cookie stores EVE tokens.
  cookieStore.delete(oauthStateCookieName);
  cookieStore.delete(oauthReturnToCookieName);
  cookieStore.delete(unlinkedIdentityCookieName);
}

export async function consumeEveSsoReturnTo() {
  const cookieStore = await cookies();
  const returnTo = cookieStore.get(oauthReturnToCookieName)?.value || "";
  cookieStore.delete(oauthReturnToCookieName);

  return sanitizeProtectedReturnTo(returnTo);
}

export async function exchangeCodeForEveTokens(code: string) {
  const config = getEveSsoServerConfig();

  if (!config.eveLoginEnabled) {
    throw new Error("EVE SSO is not configured.");
  }

  const metadata = await getSsoMetadata(config.ssoBaseUrl);
  const tokenEndpoint =
    metadata.token_endpoint ||
    `${config.ssoBaseUrl.replace(/\/$/, "")}/v2/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl
  });
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`EVE SSO token exchange failed with status ${response.status}.`);
  }

  const tokenResponse = await response.json() as EveTokenResponse;

  if (!tokenResponse.access_token) {
    throw new Error("EVE SSO token exchange did not return an access token.");
  }

  return tokenResponse;
}

export async function validateEveAccessToken(accessToken: string) {
  const config = getEveSsoServerConfig();
  const metadata = await getSsoMetadata(config.ssoBaseUrl);
  const jwks = await getJwks(config.ssoBaseUrl, metadata);
  const header = decodeJwtSegment(accessToken, 0) as { alg?: string; kid?: string };

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("EVE SSO token uses an unsupported JWT header.");
  }

  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.alg === header.alg);

  if (!jwk) {
    throw new Error("EVE SSO signing key was not found.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = accessToken.split(".");

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("EVE SSO token is malformed.");
  }

  const publicKey = createPublicKey({
    key: jwk,
    format: "jwk"
  } as Parameters<typeof createPublicKey>[0]);
  const validSignature = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    base64UrlToBuffer(encodedSignature)
  );

  if (!validSignature) {
    throw new Error("EVE SSO token signature is invalid.");
  }

  const claims = decodeJwtSegment(accessToken, 1) as EveJwtClaims;
  validateEveClaims(claims, config.clientId);

  const characterId = extractCharacterId(claims.sub);
  const characterName = typeof claims.name === "string" ? claims.name.trim() : "";

  if (!characterName) {
    throw new Error("EVE SSO token did not include a character name.");
  }

  return {
    characterId,
    characterName,
    claims
  };
}

export async function upsertEveIdentity(input: {
  characterId: bigint;
  characterName: string;
  enrichment?: EveIdentityEnrichment | null;
}) {
  const now = new Date();
  const existing = await getDb().eveIdentity.findUnique({
    where: { characterId: input.characterId },
    select: {
      id: true,
      characterId: true,
      characterName: true,
      corporationId: true,
      corporationName: true,
      allianceId: true,
      allianceName: true,
      memberCorpId: true,
      memberLandingSeenAt: true
    }
  });
  const enriched = input.enrichment ?? null;
  const updateData = {
    characterName: enriched?.characterName || input.characterName,
    provider: LoginProvider.EVE_SSO,
    lastEveLoginAt: now,
    lastIdentityRefreshAt: now
  };
  const enrichedData = enriched
    ? {
        corporationId: enriched.corporationId,
        corporationName: enriched.corporationName,
        allianceId: enriched.allianceId,
        allianceName: enriched.allianceName,
        ...(enriched.memberCorpId !== undefined
          ? { memberCorpId: enriched.memberCorpId }
          : {})
      }
    : {};
  let identity;

  try {
    identity = await getDb().eveIdentity.upsert({
      where: { characterId: input.characterId },
      update: {
        ...updateData,
        ...enrichedData
      },
      create: {
        characterId: input.characterId,
        ...updateData,
        ...enrichedData
      },
      include: {
        officer: true
      }
    });
  } catch (error) {
    logEveEnrichmentWarning({
      characterId: input.characterId,
      stage: "save",
      message: error instanceof Error ? error.message : "EveIdentity save failed."
    });

    throw error;
  }

  if (enriched) {
    await logEveIdentityEnrichmentIfChanged({
      before: existing,
      after: {
        id: identity.id,
        characterId: identity.characterId,
        characterName: identity.characterName,
        corporationId: identity.corporationId,
        corporationName: identity.corporationName,
        allianceId: identity.allianceId,
        allianceName: identity.allianceName,
        memberCorpId: identity.memberCorpId
      },
      matchedCorp: enriched.matchedCorp
    });
  }

  return identity;
}

export async function createLinkedOfficerSession(identity: Awaited<ReturnType<typeof upsertEveIdentity>>) {
  const officer = identity.officer;

  if (!officer || officer.status !== OfficerStatus.ACTIVE) {
    return null;
  }

  await createOfficerSession(officer.id);
  await getDb().officer.update({
    where: { id: officer.id },
    data: { lastLoginAt: new Date() }
  });
  await logOfficerAudit({
    officerId: officer.id,
    officerName: officer.officerName,
    officerRole: officer.role,
    module: "Auth",
    action: "EVE SSO Login",
    targetType: "EveIdentity",
    targetId: identity.id,
    targetName: identity.characterName,
    summary: `Officer ${officer.officerName} logged in with linked EVE identity ${identity.characterName}.`,
    details: {
      characterId: identity.characterId.toString()
    }
  });

  return officer;
}

export async function setUnlinkedIdentityCookie(identityId: string) {
  const cookieStore = await cookies();
  cookieStore.set(unlinkedIdentityCookieName, identityId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: unlinkedIdentityMaxAgeSeconds
  });
}

export async function getUnlinkedIdentityFromCookie() {
  const cookieStore = await cookies();
  const identityId = cookieStore.get(unlinkedIdentityCookieName)?.value;

  if (!identityId) {
    return null;
  }

  const identity = await getDb().eveIdentity.findUnique({
    where: { id: identityId },
    select: {
      id: true,
      characterName: true,
      characterId: true,
      corporationId: true,
      corporationName: true,
      allianceId: true,
      allianceName: true,
      memberCorp: {
        select: {
          id: true,
          slug: true,
          name: true,
          ticker: true
        }
      },
      memberLandingSeenAt: true,
      lastEveLoginAt: true,
      lastIdentityRefreshAt: true,
      officer: {
        select: {
          status: true
        }
      }
    }
  });

  return identity;
}

export async function enrichEveIdentityFromPublicEsi(input: {
  characterId: bigint;
  characterName: string;
}): Promise<
  | {
      status: "enriched";
      enrichment: EveIdentityEnrichment;
    }
  | {
      status: "failed";
      stage: EveEnrichmentStage;
      httpStatus?: number;
      message: string;
    }
> {
  try {
    const config = getEveSsoServerConfig();
    const characterData = await fetchEsiJson<EveCharacterPublicData>(
      `/latest/characters/${input.characterId.toString()}/`,
      config,
      "character"
    );
    const corporationId = characterData.corporation_id
      ? BigInt(characterData.corporation_id)
      : null;
    const characterName = cleanEveText(characterData.name) || input.characterName;
    let corporationName = "";
    let allianceId = characterData.alliance_id
      ? BigInt(characterData.alliance_id)
      : null;
    let allianceName = "";

    if (corporationId) {
      const corporationData = await fetchOptionalEsiJson<EveCorporationPublicData>(
        `/latest/corporations/${corporationId.toString()}/`,
        config,
        "corporation",
        input.characterId
      );
      corporationName = cleanEveText(corporationData?.name);

      if (!allianceId && corporationData?.alliance_id) {
        allianceId = BigInt(corporationData.alliance_id);
      }
    }

    if (allianceId) {
      const allianceData = await fetchOptionalEsiJson<EveAlliancePublicData>(
        `/latest/alliances/${allianceId.toString()}/`,
        config,
        "alliance",
        input.characterId
      );
      allianceName = cleanEveText(allianceData?.name);
    }

    let matchedCorp:
      | {
          corp: {
            id: string;
            slug: string;
            name: string;
            ticker: string;
          };
        }
      | null
      | undefined = null;

    try {
      matchedCorp = corporationId
        ? await getDb().corpEveIdentityConfig.findUnique({
            where: { eveCorporationId: corporationId },
            select: {
              corp: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  ticker: true
                }
              }
            }
          })
        : null;
    } catch (error) {
      logEveEnrichmentWarning({
        characterId: input.characterId,
        stage: "match",
        message:
          error instanceof Error
            ? error.message
            : "Configured corp match failed."
      });
      matchedCorp = undefined;
    }

    return {
      status: "enriched",
      enrichment: {
        characterName,
        corporationId,
        corporationName,
        allianceId,
        allianceName,
        memberCorpId:
          matchedCorp === undefined ? undefined : matchedCorp?.corp.id ?? null,
        matchedCorp: matchedCorp?.corp ?? null
      }
    };
  } catch (error) {
    const stage = error instanceof EveEnrichmentError ? error.stage : "character";
    const httpStatus = error instanceof EveEnrichmentError ? error.httpStatus : undefined;
    const message =
      error instanceof Error
        ? error.message
        : "EVE identity enrichment failed.";

    logEveEnrichmentWarning({
      characterId: input.characterId,
      stage,
      httpStatus,
      message
    });

    return {
      status: "failed",
      stage,
      httpStatus,
      message
    };
  }
}

export async function logEveSsoResult(input: {
  action: string;
  characterId?: bigint;
  characterName?: string;
  summary: string;
  details?: Prisma.InputJsonObject;
}) {
  await logOfficerAudit({
    module: "Auth",
    action: input.action,
    targetType: input.characterName ? "EveIdentity" : "EVE SSO",
    targetId: input.characterId ? input.characterId.toString() : "",
    targetName: input.characterName || "",
    summary: input.summary,
    details: input.details ?? {}
  });
}

export function getPostLoginRedirectForOfficer(officer: {
  role: OfficerRole;
}) {
  return officer.role === OfficerRole.SUPER_ADMIN ? "/admin/super" : "/";
}

function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

async function setOAuthStateCookie(state: string) {
  const cookieStore = await cookies();
  cookieStore.set(oauthStateCookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: oauthStateMaxAgeSeconds
  });
}

async function setOAuthReturnToCookie(returnTo?: string) {
  const cookieStore = await cookies();
  const safeReturnTo = sanitizeProtectedReturnTo(returnTo);

  if (!safeReturnTo) {
    cookieStore.delete(oauthReturnToCookieName);
    return;
  }

  cookieStore.set(oauthReturnToCookieName, safeReturnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: oauthStateMaxAgeSeconds
  });
}

async function getSsoMetadata(ssoBaseUrl: string) {
  if (cachedMetadata && cachedMetadataExpiresAt > Date.now()) {
    return cachedMetadata;
  }

  const metadataUrl = `${ssoBaseUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
  const response = await fetch(metadataUrl, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`EVE SSO metadata fetch failed with status ${response.status}.`);
  }

  cachedMetadata = await response.json() as JwksMetadata;
  cachedMetadataExpiresAt = Date.now() + 5 * 60 * 1000;

  return cachedMetadata;
}

async function getJwks(ssoBaseUrl: string, metadata: JwksMetadata) {
  if (cachedJwks && cachedJwksExpiresAt > Date.now()) {
    return cachedJwks;
  }

  const jwksUrl = metadata.jwks_uri || `${ssoBaseUrl.replace(/\/$/, "")}/oauth/jwks`;
  const response = await fetch(jwksUrl, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`EVE SSO JWKS fetch failed with status ${response.status}.`);
  }

  cachedJwks = await response.json() as Jwks;
  cachedJwksExpiresAt = Date.now() + 5 * 60 * 1000;

  return cachedJwks;
}

function validateEveClaims(claims: EveJwtClaims, clientId: string) {
  if (!claims.iss || !acceptedIssuers.has(claims.iss)) {
    throw new Error("EVE SSO token issuer is invalid.");
  }

  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    throw new Error("EVE SSO token is expired.");
  }

  const audience = Array.isArray(claims.aud)
    ? claims.aud
    : claims.aud
      ? [claims.aud]
      : [];

  if (!audience.includes(clientId) || !audience.includes("EVE Online")) {
    throw new Error("EVE SSO token audience is invalid.");
  }
}

function extractCharacterId(subject: string | undefined) {
  const match = subject?.match(/^CHARACTER:EVE:(\d+)$/);

  if (!match?.[1]) {
    throw new Error("EVE SSO token subject did not contain a character ID.");
  }

  return BigInt(match[1]);
}

function decodeJwtSegment(token: string, segmentIndex: number): unknown {
  const segment = token.split(".")[segmentIndex];

  if (!segment) {
    throw new Error("EVE SSO token is malformed.");
  }

  return JSON.parse(base64UrlToBuffer(segment).toString("utf8")) as unknown;
}

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");

  return Buffer.from(padded, "base64");
}

async function fetchEsiJson<T>(
  path: string,
  config: ReturnType<typeof getEveSsoServerConfig>,
  stage: EveEnrichmentStage
) {
  const response = await fetchEsi(path, config, stage);

  if (!response.ok) {
    throw new EveEnrichmentError(
      `Public ESI ${stage} request failed with status ${response.status}.`,
      stage,
      response.status
    );
  }

  return await response.json() as T;
}

async function fetchOptionalEsiJson<T>(
  path: string,
  config: ReturnType<typeof getEveSsoServerConfig>,
  stage: EveEnrichmentStage,
  characterId: bigint
) {
  let response;

  try {
    response = await fetchEsi(path, config, stage);
  } catch (error) {
    logEveEnrichmentWarning({
      characterId,
      stage,
      httpStatus:
        error instanceof EveEnrichmentError ? error.httpStatus : undefined,
      message:
        error instanceof Error
          ? error.message
          : `Optional public ESI ${stage} lookup failed.`
    });

    return null;
  }

  if (!response.ok) {
    logEveEnrichmentWarning({
      characterId,
      stage,
      httpStatus: response.status,
      message: `Optional public ESI ${stage} lookup failed.`
    });

    return null;
  }

  return await response.json() as T;
}

async function fetchEsi(
  path: string,
  config: ReturnType<typeof getEveSsoServerConfig>,
  stage: EveEnrichmentStage
) {
  const baseUrl = config.esiBaseUrl.replace(/\/$/, "");
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("datasource", "tranquility");
  url.searchParams.set("language", "en");

  if (config.esiCompatibilityDate) {
    url.searchParams.set("compatibility_date", config.esiCompatibilityDate);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "VyrajCommandConsoleV2 EVE SSO identity enrichment"
  };

  if (config.esiCompatibilityDate) {
    headers["X-Compatibility-Date"] = config.esiCompatibilityDate;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    return await fetch(url, {
      cache: "no-store",
      headers,
      signal: controller.signal
    });
  } catch (error) {
    throw new EveEnrichmentError(
      error instanceof Error ? error.message : "Public ESI request failed.",
      stage
    );
  } finally {
    clearTimeout(timeout);
  }
}

function logEveEnrichmentWarning(input: {
  characterId: bigint;
  stage: EveEnrichmentStage;
  httpStatus?: number;
  message: string;
}) {
  console.warn("[eve-sso] identity enrichment warning", {
    characterId: input.characterId.toString(),
    stage: input.stage,
    httpStatus: input.httpStatus ?? null,
    message: input.message
  });
}

async function logEveIdentityEnrichmentIfChanged(input: {
  before: {
    id: string;
    characterId: bigint;
    characterName: string;
    corporationId: bigint | null;
    corporationName: string;
    allianceId: bigint | null;
    allianceName: string;
    memberCorpId: string | null;
  } | null;
  after: {
    id: string;
    characterId: bigint;
    characterName: string;
    corporationId: bigint | null;
    corporationName: string;
    allianceId: bigint | null;
    allianceName: string;
    memberCorpId: string | null;
  };
  matchedCorp: EveIdentityEnrichment["matchedCorp"];
}) {
  const before = serializeIdentityEnrichment(input.before);
  const after = serializeIdentityEnrichment(input.after);

  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  await logOfficerAudit({
    module: "EVE SSO",
    action: "EveIdentity Enriched",
    targetType: "EveIdentity",
    targetId: input.after.id,
    targetName: input.after.characterName,
    summary: `Refreshed EVE identity enrichment for ${input.after.characterName}.`,
    details: {
      characterId: input.after.characterId.toString(),
      before,
      after,
      matchedConfiguredCorp: input.matchedCorp
    }
  });
}

function serializeIdentityEnrichment(input: {
  characterId: bigint;
  characterName: string;
  corporationId: bigint | null;
  corporationName: string;
  allianceId: bigint | null;
  allianceName: string;
  memberCorpId: string | null;
} | null) {
  if (!input) {
    return null;
  }

  return {
    characterId: input.characterId.toString(),
    characterName: input.characterName,
    corporationId: input.corporationId?.toString() ?? null,
    corporationName: input.corporationName,
    allianceId: input.allianceId?.toString() ?? null,
    allianceName: input.allianceName,
    memberCorpId: input.memberCorpId
  };
}

function cleanEveText(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
