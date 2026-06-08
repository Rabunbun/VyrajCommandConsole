import "server-only";
import { createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { cookies } from "next/headers";
import { LoginProvider, OfficerRole, OfficerStatus } from "@prisma/client";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { createOfficerSession } from "@/lib/session";
import { getEveSsoServerConfig } from "@/lib/eve-sso/config";

const oauthStateCookieName = "vyraj_eve_oauth_state";
const unlinkedIdentityCookieName = "vyraj_eve_unlinked_identity";
const oauthStateMaxAgeSeconds = 10 * 60;
const unlinkedIdentityMaxAgeSeconds = 10 * 60;
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

export async function buildEveAuthorizeUrl() {
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

  return url;
}

export async function verifyAndConsumeOAuthState(returnedState: string) {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(oauthStateCookieName)?.value || "";
  cookieStore.delete(oauthStateCookieName);

  if (!returnedState || !storedState) {
    return false;
  }

  const returned = Buffer.from(returnedState);
  const stored = Buffer.from(storedState);

  return returned.length === stored.length && timingSafeEqual(returned, stored);
}

export async function clearOAuthStateCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(oauthStateCookieName);
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
}) {
  return getDb().eveIdentity.upsert({
    where: { characterId: input.characterId },
    update: {
      characterName: input.characterName,
      provider: LoginProvider.EVE_SSO,
      lastEveLoginAt: new Date(),
      lastIdentityRefreshAt: new Date()
    },
    create: {
      characterId: input.characterId,
      characterName: input.characterName,
      provider: LoginProvider.EVE_SSO,
      lastEveLoginAt: new Date(),
      lastIdentityRefreshAt: new Date()
    },
    include: {
      officer: true
    }
  });
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
      characterName: true,
      lastEveLoginAt: true,
      officer: {
        select: {
          status: true
        }
      }
    }
  });

  return identity;
}

export async function logEveSsoResult(input: {
  action: string;
  characterId?: bigint;
  characterName?: string;
  summary: string;
}) {
  await logOfficerAudit({
    module: "Auth",
    action: input.action,
    targetType: input.characterName ? "EveIdentity" : "EVE SSO",
    targetId: input.characterId ? input.characterId.toString() : "",
    targetName: input.characterName || "",
    summary: input.summary
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
