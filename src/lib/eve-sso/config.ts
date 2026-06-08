import "server-only";

const defaultSsoBaseUrl = "https://login.eveonline.com";
const defaultEsiBaseUrl = "https://esi.evetech.net";

const requiredEveSsoVariables = [
  "EVE_SSO_CLIENT_ID",
  "EVE_SSO_CLIENT_SECRET",
  "EVE_SSO_CALLBACK_URL"
] as const;

export type EveSsoConfigStatus = {
  configured: boolean;
  missingVariables: string[];
  callbackConfigured: boolean;
  scopesConfigured: boolean;
  scopes: string[];
  ssoBaseUrlConfigured: boolean;
  ssoBaseUrlStatus: "configured" | "defaulted";
  esiBaseUrlConfigured: boolean;
  esiBaseUrlStatus: "configured" | "defaulted";
  compatibilityDateConfigured: boolean;
  tokenStorageEnabled: false;
  oauthRoutesImplemented: false;
};

export function getEveSsoConfigStatus(): EveSsoConfigStatus {
  const missingVariables = requiredEveSsoVariables.filter(
    (variableName) => !hasEnvValue(variableName)
  );
  const scopes = parseScopes(process.env.EVE_SSO_SCOPES);
  const ssoBaseUrlConfigured = hasEnvValue("EVE_SSO_BASE_URL");
  const esiBaseUrlConfigured = hasEnvValue("EVE_ESI_BASE_URL");

  return {
    configured: missingVariables.length === 0,
    missingVariables,
    callbackConfigured: hasEnvValue("EVE_SSO_CALLBACK_URL"),
    scopesConfigured: scopes.length > 0,
    scopes,
    ssoBaseUrlConfigured,
    ssoBaseUrlStatus: ssoBaseUrlConfigured ? "configured" : "defaulted",
    esiBaseUrlConfigured,
    esiBaseUrlStatus: esiBaseUrlConfigured ? "configured" : "defaulted",
    compatibilityDateConfigured: hasEnvValue("EVE_ESI_COMPATIBILITY_DATE"),
    tokenStorageEnabled: false,
    oauthRoutesImplemented: false
  };
}

export function getEveSsoSafeDefaults() {
  return {
    ssoBaseUrl: defaultSsoBaseUrl,
    esiBaseUrl: defaultEsiBaseUrl
  };
}

function hasEnvValue(variableName: string) {
  return Boolean(process.env[variableName]?.trim());
}

function parseScopes(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
