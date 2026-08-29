import {
  getMissingPrivateEsiScopes,
  normalizeScopes,
  PrivateEsiCredentialError,
  type EncryptedPrivateEsiSecret,
  type PrivateEsiActor,
  type PrivateEsiCredentialRecord,
  type PrivateEsiCredentialSafeStatus,
  type PrivateEsiCredentialState,
  type PrivateEsiTokenResponse,
  type ValidatedPrivateEsiAccess
} from "./types";

export type PrivateEsiCredentialWrite = EncryptedPrivateEsiSecret & {
  eveIdentityId: string;
  grantedScopes: string[];
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  lastSuccessfulRefreshAt: Date | null;
  status: PrivateEsiCredentialState;
};

export type PrivateEsiCredentialRepository = {
  deleteByEveIdentityId(eveIdentityId: string): Promise<boolean>;
  findByEveIdentityId(
    eveIdentityId: string
  ): Promise<PrivateEsiCredentialRecord | null>;
  markStatus(input: {
    eveIdentityId: string;
    lastFailureAt: Date;
    lastFailureCode: string;
    status: Exclude<PrivateEsiCredentialState, "USABLE">;
  }): Promise<void>;
  upsertCredential(data: PrivateEsiCredentialWrite): Promise<void>;
};

type AuthorizationDependencies = {
  encrypt(refreshToken: string): EncryptedPrivateEsiSecret;
  exchangeCode(code: string): Promise<PrivateEsiTokenResponse>;
  repository: PrivateEsiCredentialRepository;
  validateAccessToken(accessToken: string): Promise<ValidatedPrivateEsiAccess>;
};

type RefreshDependencies = {
  decrypt(encrypted: EncryptedPrivateEsiSecret): string;
  encrypt(refreshToken: string): EncryptedPrivateEsiSecret;
  exchangeRefreshToken(refreshToken: string): Promise<PrivateEsiTokenResponse>;
  now(): Date;
  repository: PrivateEsiCredentialRepository;
  validateAccessToken(accessToken: string): Promise<ValidatedPrivateEsiAccess>;
};

export async function completePrivateEsiAuthorization(
  input: { actor: PrivateEsiActor; code: string },
  dependencies: AuthorizationDependencies
) {
  const token = await dependencies.exchangeCode(input.code);
  const validated = await dependencies.validateAccessToken(token.accessToken);
  assertMatchingCharacter(input.actor, validated);
  assertRequiredScopes(validated.scopes);

  if (!token.refreshToken) {
    throw new PrivateEsiCredentialError(
      "MISSING_REFRESH_TOKEN",
      "Private ESI authorization returned no refresh token."
    );
  }

  const encrypted = dependencies.encrypt(token.refreshToken);
  await dependencies.repository.upsertCredential({
    ...encrypted,
    eveIdentityId: input.actor.eveIdentityId,
    grantedScopes: normalizeScopes(validated.scopes),
    lastFailureAt: null,
    lastFailureCode: null,
    lastSuccessfulRefreshAt: null,
    status: "USABLE"
  });
}

export async function refreshPrivateEsiAccessToken(
  actor: PrivateEsiActor,
  dependencies: RefreshDependencies
) {
  const credential = await dependencies.repository.findByEveIdentityId(
    actor.eveIdentityId
  );

  if (!credential) {
    throw new PrivateEsiCredentialError(
      "CREDENTIAL_NOT_CONNECTED",
      "Private ESI character data is not connected."
    );
  }

  if (credential.status === "REVOKED") {
    throw new PrivateEsiCredentialError(
      "CREDENTIAL_REVOKED",
      "Private ESI authorization has been revoked and must be reconnected."
    );
  }

  if (getMissingPrivateEsiScopes(credential.grantedScopes).length) {
    await markFailure(
      actor,
      dependencies,
      "REAUTHORIZATION_REQUIRED",
      "MISSING_REQUIRED_SCOPES"
    );
    throw missingScopesError();
  }

  let refreshToken: string;

  try {
    refreshToken = dependencies.decrypt(credential);
  } catch (error) {
    await markFailure(
      actor,
      dependencies,
      "UNAVAILABLE",
      error instanceof PrivateEsiCredentialError
        ? error.code
        : "CREDENTIAL_DECRYPT_FAILED"
    );
    throw error;
  }

  let token: PrivateEsiTokenResponse;

  try {
    token = await dependencies.exchangeRefreshToken(refreshToken);
  } catch (error) {
    const invalidGrant =
      error instanceof PrivateEsiCredentialError &&
      error.code === "INVALID_GRANT";
    await markFailure(
      actor,
      dependencies,
      invalidGrant ? "REVOKED" : "UNAVAILABLE",
      invalidGrant ? "INVALID_GRANT" : "TOKEN_REFRESH_FAILED"
    );
    throw error;
  }

  let validated: ValidatedPrivateEsiAccess;

  try {
    validated = await dependencies.validateAccessToken(token.accessToken);
  } catch (error) {
    await markFailure(
      actor,
      dependencies,
      "UNAVAILABLE",
      "ACCESS_TOKEN_VALIDATION_FAILED"
    );
    throw error;
  }

  try {
    assertMatchingCharacter(actor, validated);
  } catch (error) {
    await markFailure(
      actor,
      dependencies,
      "REVOKED",
      "IDENTITY_MISMATCH"
    );
    throw error;
  }

  try {
    assertRequiredScopes(validated.scopes);
  } catch (error) {
    await markFailure(
      actor,
      dependencies,
      "REAUTHORIZATION_REQUIRED",
      "MISSING_REQUIRED_SCOPES"
    );
    throw error;
  }

  const encrypted = dependencies.encrypt(token.refreshToken || refreshToken);
  await dependencies.repository.upsertCredential({
    ...encrypted,
    eveIdentityId: actor.eveIdentityId,
    grantedScopes: normalizeScopes(validated.scopes),
    lastFailureAt: null,
    lastFailureCode: null,
    lastSuccessfulRefreshAt: dependencies.now(),
    status: "USABLE"
  });

  return token.accessToken;
}

export async function disconnectPrivateEsiCredential(
  actor: PrivateEsiActor,
  repository: PrivateEsiCredentialRepository
) {
  return repository.deleteByEveIdentityId(actor.eveIdentityId);
}

export async function getPrivateEsiSafeStatus(
  actor: PrivateEsiActor,
  repository: PrivateEsiCredentialRepository,
  configurationAvailable: boolean
): Promise<PrivateEsiCredentialSafeStatus> {
  const credential = await repository.findByEveIdentityId(actor.eveIdentityId);
  const base = {
    characterId: actor.characterId,
    characterName: actor.characterName,
    eveIdentityId: actor.eveIdentityId,
    grantedScopes: credential ? normalizeScopes(credential.grantedScopes) : [],
    lastFailureAt: credential?.lastFailureAt?.toISOString() ?? null,
    lastFailureCode: credential?.lastFailureCode ?? null,
    lastSuccessfulRefreshAt:
      credential?.lastSuccessfulRefreshAt?.toISOString() ?? null
  };

  if (!configurationAvailable) {
    return { ...base, status: "unavailable" };
  }

  if (!credential) {
    return { ...base, status: "not-connected" };
  }

  if (
    credential.status === "REAUTHORIZATION_REQUIRED" ||
    getMissingPrivateEsiScopes(credential.grantedScopes).length
  ) {
    return { ...base, status: "reauthorization-required" };
  }

  if (credential.status === "REVOKED") {
    return { ...base, status: "revoked" };
  }

  return {
    ...base,
    status: credential.status === "USABLE" ? "connected" : "unavailable"
  };
}

function assertMatchingCharacter(
  actor: PrivateEsiActor,
  validated: ValidatedPrivateEsiAccess
) {
  if (validated.characterId !== actor.characterId) {
    throw new PrivateEsiCredentialError(
      "IDENTITY_MISMATCH",
      "The authorized EVE character does not match the connected identity."
    );
  }
}

function assertRequiredScopes(scopes: readonly string[]) {
  const missing = getMissingPrivateEsiScopes(scopes);

  if (missing.length) {
    throw missingScopesError();
  }
}

function missingScopesError() {
  return new PrivateEsiCredentialError(
    "MISSING_REQUIRED_SCOPES",
    "Private ESI authorization is missing required skills scopes."
  );
}

async function markFailure(
  actor: PrivateEsiActor,
  dependencies: Pick<RefreshDependencies, "now" | "repository">,
  status: Exclude<PrivateEsiCredentialState, "USABLE">,
  lastFailureCode: string
) {
  await dependencies.repository.markStatus({
    eveIdentityId: actor.eveIdentityId,
    lastFailureAt: dependencies.now(),
    lastFailureCode,
    status
  });
}
