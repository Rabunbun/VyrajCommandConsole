import "server-only";

const defaultSsoBaseUrl = "https://login.eveonline.com";
const defaultEsiBaseUrl = "https://esi.evetech.net";

const requiredEveSsoVariables = [
  "EVE_SSO_CLIENT_ID",
  "EVE_SSO_CLIENT_SECRET",
  "EVE_SSO_CALLBACK_URL"
] as const;

const optionalEveSsoVariables = [
  "EVE_SSO_SCOPES",
  "EVE_SSO_BASE_URL",
  "EVE_ESI_BASE_URL",
  "EVE_ESI_COMPATIBILITY_DATE"
] as const;

export type EveSsoVariableStatus = {
  name: string;
  required: boolean;
  present: boolean;
};

export type EveSsoConfigStatus = {
  configured: boolean;
  variables: EveSsoVariableStatus[];
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
  oauthRoutesImplemented: true;
  esiSyncEnabled: false;
  eveLoginEnabled: boolean;
};

export function getEveSsoConfigStatus(): EveSsoConfigStatus {
  const missingVariables = requiredEveSsoVariables.filter(
    (variableName) => !hasEnvValue(variableName)
  );
  const variables = [
    ...requiredEveSsoVariables.map((variableName) => ({
      name: variableName,
      required: true,
      present: hasEnvValue(variableName)
    })),
    ...optionalEveSsoVariables.map((variableName) => ({
      name: variableName,
      required: false,
      present: hasEnvValue(variableName)
    }))
  ];
  const scopes = parseScopes(process.env.EVE_SSO_SCOPES);
  const ssoBaseUrlConfigured = hasEnvValue("EVE_SSO_BASE_URL");
  const esiBaseUrlConfigured = hasEnvValue("EVE_ESI_BASE_URL");

  return {
    configured: missingVariables.length === 0,
    variables,
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
    oauthRoutesImplemented: true,
    esiSyncEnabled: false,
    eveLoginEnabled: missingVariables.length === 0
  };
}

export function getEveSsoServerConfig() {
  const status = getEveSsoConfigStatus();

  return {
    ...status,
    clientId: process.env.EVE_SSO_CLIENT_ID?.trim() || "",
    clientSecret: process.env.EVE_SSO_CLIENT_SECRET?.trim() || "",
    callbackUrl: process.env.EVE_SSO_CALLBACK_URL?.trim() || "",
    ssoBaseUrl: process.env.EVE_SSO_BASE_URL?.trim() || defaultSsoBaseUrl,
    esiBaseUrl: process.env.EVE_ESI_BASE_URL?.trim() || defaultEsiBaseUrl
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
