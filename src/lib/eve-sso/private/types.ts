export const PRIVATE_ESI_REQUIRED_SCOPES = [
  "esi-skills.read_skills.v1",
  "esi-skills.read_skillqueue.v1"
] as const;

export type PrivateEsiRequiredScope =
  (typeof PRIVATE_ESI_REQUIRED_SCOPES)[number];

declare const privateEsiActorBrand: unique symbol;

export type PrivateEsiActor = {
  characterId: string;
  characterName: string;
  contextKey: string;
  eveIdentityId: string;
  readonly [privateEsiActorBrand]: true;
};

export type EncryptedPrivateEsiSecret = {
  authTag: string;
  ciphertext: string;
  iv: string;
  keyVersion: number;
};

export type PrivateEsiCredentialState =
  | "USABLE"
  | "REAUTHORIZATION_REQUIRED"
  | "REVOKED"
  | "UNAVAILABLE";

export type PrivateEsiCredentialRecord = EncryptedPrivateEsiSecret & {
  createdAt: Date;
  eveIdentityId: string;
  grantedScopes: string[];
  id: string;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  lastSuccessfulRefreshAt: Date | null;
  status: PrivateEsiCredentialState;
  updatedAt: Date;
};

export type PrivateEsiCredentialSafeStatus = {
  characterId: string;
  characterName: string;
  eveIdentityId: string;
  grantedScopes: string[];
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  lastSuccessfulRefreshAt: string | null;
  status:
    | "not-connected"
    | "connected"
    | "reauthorization-required"
    | "revoked"
    | "unavailable";
};

export type PrivateEsiTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
};

export type ValidatedPrivateEsiAccess = {
  characterId: string;
  characterName: string;
  scopes: string[];
};

export type PrivateEsiCredentialErrorCode =
  | "AUTHORIZATION_REQUIRED"
  | "CONFIGURATION_UNAVAILABLE"
  | "CREDENTIAL_DECRYPT_FAILED"
  | "CREDENTIAL_NOT_CONNECTED"
  | "CREDENTIAL_REVOKED"
  | "IDENTITY_MISMATCH"
  | "INVALID_GRANT"
  | "MALFORMED_OAUTH_STATE"
  | "MISSING_REFRESH_TOKEN"
  | "MISSING_REQUIRED_SCOPES"
  | "OAUTH_STATE_EXPIRED"
  | "OAUTH_STATE_INVALID"
  | "TOKEN_EXCHANGE_FAILED";

export class PrivateEsiCredentialError extends Error {
  constructor(
    readonly code: PrivateEsiCredentialErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PrivateEsiCredentialError";
  }
}

export function normalizeScopes(scopes: readonly string[]) {
  return Array.from(
    new Set(scopes.map((scope) => scope.trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, "en-US"));
}

export function getMissingPrivateEsiScopes(scopes: readonly string[]) {
  const granted = new Set(normalizeScopes(scopes));

  return PRIVATE_ESI_REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
}
