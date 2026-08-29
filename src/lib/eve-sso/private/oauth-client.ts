import "server-only";

import { validateEveAccessToken } from "@/lib/eve-sso/oauth";
import { requirePrivateEsiOAuthConfig } from "./config";
import {
  PRIVATE_ESI_REQUIRED_SCOPES,
  normalizeScopes,
  PrivateEsiCredentialError,
  type PrivateEsiTokenResponse,
  type ValidatedPrivateEsiAccess
} from "./types";

type OAuthMetadata = {
  authorization_endpoint?: string;
  token_endpoint?: string;
};

type OAuthTokenPayload = {
  access_token?: string;
  error?: string;
  refresh_token?: string;
};

export async function buildPrivateEsiAuthorizeUrl(state: string) {
  const config = requirePrivateEsiOAuthConfig();
  const metadata = await fetchOAuthMetadata(config.ssoBaseUrl);
  const endpoint =
    metadata.authorization_endpoint ||
    `${config.ssoBaseUrl.replace(/\/$/, "")}/v2/oauth/authorize`;
  const url = new URL(endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set(
    "scope",
    PRIVATE_ESI_REQUIRED_SCOPES.join(" ")
  );
  url.searchParams.set("state", state);

  return url;
}

export async function exchangePrivateEsiAuthorizationCode(
  code: string
): Promise<PrivateEsiTokenResponse> {
  const config = requirePrivateEsiOAuthConfig();

  return exchangePrivateEsiToken({
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: config.callbackUrl
    }),
    config
  });
}

export async function exchangePrivateEsiRefreshToken(
  refreshToken: string
): Promise<PrivateEsiTokenResponse> {
  const config = requirePrivateEsiOAuthConfig();

  return exchangePrivateEsiToken({
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    config
  });
}

export async function validatePrivateEsiAccessToken(
  accessToken: string
): Promise<ValidatedPrivateEsiAccess> {
  const result = await validateEveAccessToken(accessToken);

  return {
    characterId: result.characterId.toString(),
    characterName: result.characterName,
    scopes: normalizeScopes(result.scopes)
  };
}

async function exchangePrivateEsiToken(input: {
  body: URLSearchParams;
  config: ReturnType<typeof requirePrivateEsiOAuthConfig>;
}) {
  const metadata = await fetchOAuthMetadata(input.config.ssoBaseUrl);
  const endpoint =
    metadata.token_endpoint ||
    `${input.config.ssoBaseUrl.replace(/\/$/, "")}/v2/oauth/token`;
  const basicAuth = Buffer.from(
    `${input.config.clientId}:${input.config.clientSecret}`
  ).toString("base64");
  const response = await fetch(endpoint, {
    body: input.body,
    cache: "no-store",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as OAuthTokenPayload;

  if (!response.ok) {
    throw new PrivateEsiCredentialError(
      payload.error === "invalid_grant" ? "INVALID_GRANT" : "TOKEN_EXCHANGE_FAILED",
      payload.error === "invalid_grant"
        ? "The private ESI authorization is no longer valid."
        : `Private ESI token exchange failed with status ${response.status}.`
    );
  }

  if (!payload.access_token) {
    throw new PrivateEsiCredentialError(
      "TOKEN_EXCHANGE_FAILED",
      "Private ESI token exchange returned no access token."
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token?.trim() || null
  };
}

async function fetchOAuthMetadata(ssoBaseUrl: string) {
  const url = `${ssoBaseUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new PrivateEsiCredentialError(
      "TOKEN_EXCHANGE_FAILED",
      `Private ESI OAuth metadata request failed with status ${response.status}.`
    );
  }

  return (await response.json()) as OAuthMetadata;
}
