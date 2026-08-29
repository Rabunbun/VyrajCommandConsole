import assert from "node:assert/strict";
import test from "node:test";

import { resolvePrivateEsiActor } from "./authorization-core";
import {
  completePrivateEsiAuthorization,
  disconnectPrivateEsiCredential,
  getPrivateEsiSafeStatus,
  refreshPrivateEsiAccessToken,
  type PrivateEsiCredentialRepository,
  type PrivateEsiCredentialWrite
} from "./credential-core";
import {
  decryptPrivateEsiSecret,
  encryptPrivateEsiSecret
} from "./encryption-core";
import {
  createPrivateEsiOAuthState,
  PRIVATE_ESI_OAUTH_STATE_TTL_MS,
  verifyPrivateEsiOAuthState
} from "./state-core";
import {
  PRIVATE_ESI_REQUIRED_SCOPES,
  PrivateEsiCredentialError,
  type PrivateEsiActor,
  type PrivateEsiCredentialRecord,
  type PrivateEsiTokenResponse,
  type ValidatedPrivateEsiAccess
} from "./types";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const key = Buffer.alloc(32, 7);
const wrongKey = Buffer.alloc(32, 8);
const refreshToken = "private-refresh-token-value";
const requiredScopes = [...PRIVATE_ESI_REQUIRED_SCOPES];

function actor(
  eveIdentityId = ownerA,
  characterId = "90000001"
): PrivateEsiActor {
  return resolvePrivateEsiActor({
    checkpointEveIdentityId: eveIdentityId,
    identities: [
      {
        characterId,
        characterName: eveIdentityId === ownerA ? "Pilot A" : "Pilot B",
        id: eveIdentityId
      }
    ],
    linkedEveIdentityIds: [],
    officerId: null,
    sessionContextId: eveIdentityId
  });
}

function expectCredentialError(
  operation: () => unknown,
  code: PrivateEsiCredentialError["code"]
) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof PrivateEsiCredentialError);
    assert.equal(error.code, code);
    return true;
  });
}

async function expectAsyncCredentialError(
  operation: () => Promise<unknown>,
  code: PrivateEsiCredentialError["code"]
) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof PrivateEsiCredentialError);
    assert.equal(error.code, code);
    return true;
  });
}

test("AES-GCM round trips without serializing plaintext and preserves key version", () => {
  const encrypted = encryptPrivateEsiSecret(
    refreshToken,
    key,
    3,
    () => Buffer.alloc(12, 4)
  );

  assert.equal(encrypted.keyVersion, 3);
  assert.notEqual(encrypted.ciphertext, refreshToken);
  assert.ok(!JSON.stringify(encrypted).includes(refreshToken));
  assert.equal(decryptPrivateEsiSecret(encrypted, key), refreshToken);
});

test("AES-GCM rejects wrong keys and tampered ciphertext or authentication data", () => {
  const encrypted = encryptPrivateEsiSecret(refreshToken, key, 1);

  assert.throws(() => decryptPrivateEsiSecret(encrypted, wrongKey));
  assert.throws(() =>
    decryptPrivateEsiSecret(
      { ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") },
      key
    )
  );
  assert.throws(() =>
    decryptPrivateEsiSecret(
      { ...encrypted, authTag: Buffer.alloc(16, 1).toString("base64") },
      key
    )
  );
});

test("private OAuth state validates its purpose, owner, context, nonce, and expiry", () => {
  const currentActor = actor();
  const now = Date.parse("2026-08-29T12:00:00.000Z");
  const created = createPrivateEsiOAuthState({
    actor: currentActor,
    key,
    keyVersion: 1,
    nonce: "one-time-nonce",
    now
  });

  assert.equal(
    verifyPrivateEsiOAuthState({
      actor: currentActor,
      expectedNonce: created.nonce,
      key,
      now: now + 1,
      state: created.state
    }).eveIdentityId,
    ownerA
  );

  expectCredentialError(
    () =>
      verifyPrivateEsiOAuthState({
        actor: actor(ownerB, "90000002"),
        expectedNonce: created.nonce,
        key,
        now: now + 1,
        state: created.state
      }),
    "OAUTH_STATE_INVALID"
  );
  expectCredentialError(
    () =>
      verifyPrivateEsiOAuthState({
        actor: currentActor,
        expectedNonce: "swapped-nonce",
        key,
        now: now + 1,
        state: created.state
      }),
    "OAUTH_STATE_INVALID"
  );
  expectCredentialError(
    () =>
      verifyPrivateEsiOAuthState({
        actor: currentActor,
        expectedNonce: created.nonce,
        key,
        now: now + PRIVATE_ESI_OAUTH_STATE_TTL_MS,
        state: created.state
      }),
    "OAUTH_STATE_EXPIRED"
  );
});

test("private OAuth state rejects wrong purpose and malformed content", () => {
  const currentActor = actor();
  const wrongPurpose = createPrivateEsiOAuthState({
    actor: currentActor,
    key,
    keyVersion: 1,
    nonce: "nonce",
    now: 1000,
    purpose: "normal-login"
  });

  expectCredentialError(
    () =>
      verifyPrivateEsiOAuthState({
        actor: currentActor,
        expectedNonce: wrongPurpose.nonce,
        key,
        now: 1001,
        state: wrongPurpose.state
      }),
    "OAUTH_STATE_INVALID"
  );
  expectCredentialError(
    () =>
      verifyPrivateEsiOAuthState({
        actor: currentActor,
        expectedNonce: "nonce",
        key,
        state: "not-a-valid-state"
      }),
    "MALFORMED_OAUTH_STATE"
  );
});

test("authorization binds the correct character and encrypts before storage", async () => {
  const repository = createRepository();
  let encryptedPlaintext = "";

  await completePrivateEsiAuthorization(
    { actor: actor(), code: "authorization-code" },
    {
      encrypt(value) {
        encryptedPlaintext = value;
        return encryptPrivateEsiSecret(value, key, 1);
      },
      exchangeCode: async () => tokenResponse(),
      repository,
      validateAccessToken: async () => validatedAccess()
    }
  );

  const stored = await repository.findByEveIdentityId(ownerA);
  assert.equal(encryptedPlaintext, refreshToken);
  assert.ok(stored);
  assert.equal(stored.status, "USABLE");
  assert.ok(!JSON.stringify(stored).includes(refreshToken));
  assert.equal(decryptPrivateEsiSecret(stored, key), refreshToken);
});

test("authorization rejects a wrong character, missing scope, or missing refresh token", async () => {
  const repository = createRepository();
  const dependencies = {
    encrypt: (value: string) => encryptPrivateEsiSecret(value, key, 1),
    exchangeCode: async () => tokenResponse(),
    repository,
    validateAccessToken: async () => validatedAccess()
  };

  await expectAsyncCredentialError(
    () =>
      completePrivateEsiAuthorization(
        { actor: actor(), code: "code" },
        {
          ...dependencies,
          validateAccessToken: async () =>
            validatedAccess({ characterId: "90000002" })
        }
      ),
    "IDENTITY_MISMATCH"
  );
  await expectAsyncCredentialError(
    () =>
      completePrivateEsiAuthorization(
        { actor: actor(), code: "code" },
        {
          ...dependencies,
          validateAccessToken: async () =>
            validatedAccess({ scopes: [requiredScopes[0]] })
        }
      ),
    "MISSING_REQUIRED_SCOPES"
  );
  await expectAsyncCredentialError(
    () =>
      completePrivateEsiAuthorization(
        { actor: actor(), code: "code" },
        {
          ...dependencies,
          exchangeCode: async () => ({
            accessToken: "access-token",
            refreshToken: null
          })
        }
      ),
    "MISSING_REFRESH_TOKEN"
  );
  assert.equal(await repository.findByEveIdentityId(ownerA), null);
});

test("refresh returns only a transient access token and replaces a rotated refresh token", async () => {
  const repository = createRepository();
  await seedCredential(repository);
  const rotatedToken = "rotated-refresh-token";
  const accessToken = await refreshPrivateEsiAccessToken(actor(), {
    decrypt: (encrypted) => decryptPrivateEsiSecret(encrypted, key),
    encrypt: (value) => encryptPrivateEsiSecret(value, key, 2),
    exchangeRefreshToken: async (value) => {
      assert.equal(value, refreshToken);
      return { accessToken: "short-lived-access", refreshToken: rotatedToken };
    },
    now: () => new Date("2026-08-29T13:00:00.000Z"),
    repository,
    validateAccessToken: async () => validatedAccess()
  });
  const stored = await repository.findByEveIdentityId(ownerA);

  assert.equal(accessToken, "short-lived-access");
  assert.ok(stored);
  assert.equal(stored.keyVersion, 2);
  assert.equal(decryptPrivateEsiSecret(stored, key), rotatedToken);
  assert.ok(!JSON.stringify(stored).includes("short-lived-access"));
});

test("refresh blocks wrong characters and missing scopes with durable status", async () => {
  const wrongCharacterRepository = createRepository();
  await seedCredential(wrongCharacterRepository);
  await expectAsyncCredentialError(
    () =>
      refreshPrivateEsiAccessToken(actor(), {
        decrypt: (encrypted) => decryptPrivateEsiSecret(encrypted, key),
        encrypt: (value) => encryptPrivateEsiSecret(value, key, 1),
        exchangeRefreshToken: async () => tokenResponse(),
        now: () => new Date(),
        repository: wrongCharacterRepository,
        validateAccessToken: async () =>
          validatedAccess({ characterId: "90000002" })
      }),
    "IDENTITY_MISMATCH"
  );
  assert.equal(
    (await wrongCharacterRepository.findByEveIdentityId(ownerA))?.status,
    "REVOKED"
  );

  const scopeRepository = createRepository();
  await seedCredential(scopeRepository);
  await expectAsyncCredentialError(
    () =>
      refreshPrivateEsiAccessToken(actor(), {
        decrypt: (encrypted) => decryptPrivateEsiSecret(encrypted, key),
        encrypt: (value) => encryptPrivateEsiSecret(value, key, 1),
        exchangeRefreshToken: async () => tokenResponse(),
        now: () => new Date(),
        repository: scopeRepository,
        validateAccessToken: async () =>
          validatedAccess({ scopes: [requiredScopes[0]] })
      }),
    "MISSING_REQUIRED_SCOPES"
  );
  assert.equal(
    (await scopeRepository.findByEveIdentityId(ownerA))?.status,
    "REAUTHORIZATION_REQUIRED"
  );
});

test("invalid_grant revokes once and prevents repeated blind refresh", async () => {
  const repository = createRepository();
  await seedCredential(repository);
  let calls = 0;
  const dependencies = {
    decrypt: (encrypted: Parameters<typeof decryptPrivateEsiSecret>[0]) =>
      decryptPrivateEsiSecret(encrypted, key),
    encrypt: (value: string) => encryptPrivateEsiSecret(value, key, 1),
    exchangeRefreshToken: async () => {
      calls += 1;
      throw new PrivateEsiCredentialError(
        "INVALID_GRANT",
        "Authorization revoked."
      );
    },
    now: () => new Date(),
    repository,
    validateAccessToken: async () => validatedAccess()
  };

  await expectAsyncCredentialError(
    () => refreshPrivateEsiAccessToken(actor(), dependencies),
    "INVALID_GRANT"
  );
  await expectAsyncCredentialError(
    () => refreshPrivateEsiAccessToken(actor(), dependencies),
    "CREDENTIAL_REVOKED"
  );
  assert.equal(calls, 1);
});

test("credential access and disconnect remain scoped to the authorized actor", async () => {
  const repository = createRepository();
  await seedCredential(repository);
  const safeA = await getPrivateEsiSafeStatus(actor(), repository, true);
  const safeB = await getPrivateEsiSafeStatus(
    actor(ownerB, "90000002"),
    repository,
    true
  );

  assert.equal(safeA.status, "connected");
  assert.equal(safeB.status, "not-connected");
  assert.equal(
    await disconnectPrivateEsiCredential(
      actor(ownerB, "90000002"),
      repository
    ),
    false
  );
  assert.ok(await repository.findByEveIdentityId(ownerA));
  assert.equal(await disconnectPrivateEsiCredential(actor(), repository), true);
  assert.equal(await repository.findByEveIdentityId(ownerA), null);
});

test("client identity spoofing cannot change the authoritative target", () => {
  const input = {
    checkpointEveIdentityId: ownerA,
    clientEveIdentityId: ownerB,
    identities: [
      { characterId: "90000001", characterName: "Pilot A", id: ownerA }
    ],
    linkedEveIdentityIds: [],
    officerId: null,
    sessionContextId: ownerA
  };

  assert.equal(resolvePrivateEsiActor(input).eveIdentityId, ownerA);
});

test("safe status never serializes credential material or refresh-token plaintext", async () => {
  const repository = createRepository();
  await seedCredential(repository);
  const status = await getPrivateEsiSafeStatus(actor(), repository, true);
  const serialized = JSON.stringify(status);

  assert.equal(status.status, "connected");
  assert.ok(!serialized.includes(refreshToken));
  assert.ok(!serialized.includes("ciphertext"));
  assert.ok(!serialized.includes("authTag"));
  assert.ok(!serialized.includes("iv"));
  assert.equal(
    (await getPrivateEsiSafeStatus(actor(), repository, false)).status,
    "unavailable"
  );
});

function tokenResponse(
  overrides: Partial<PrivateEsiTokenResponse> = {}
): PrivateEsiTokenResponse {
  return {
    accessToken: "short-lived-access-token",
    refreshToken,
    ...overrides
  };
}

function validatedAccess(
  overrides: Partial<ValidatedPrivateEsiAccess> = {}
): ValidatedPrivateEsiAccess {
  return {
    characterId: "90000001",
    characterName: "Pilot A",
    scopes: requiredScopes,
    ...overrides
  };
}

async function seedCredential(repository: PrivateEsiCredentialRepository) {
  await repository.upsertCredential({
    ...encryptPrivateEsiSecret(refreshToken, key, 1),
    eveIdentityId: ownerA,
    grantedScopes: requiredScopes,
    lastFailureAt: null,
    lastFailureCode: null,
    lastSuccessfulRefreshAt: new Date("2026-08-29T11:00:00.000Z"),
    status: "USABLE"
  });
}

function createRepository(): PrivateEsiCredentialRepository {
  const records = new Map<string, PrivateEsiCredentialRecord>();

  return {
    async deleteByEveIdentityId(eveIdentityId) {
      return records.delete(eveIdentityId);
    },
    async findByEveIdentityId(eveIdentityId) {
      return records.has(eveIdentityId)
        ? structuredClone(records.get(eveIdentityId)!)
        : null;
    },
    async markStatus(input) {
      const current = records.get(input.eveIdentityId);
      if (current) {
        records.set(input.eveIdentityId, {
          ...current,
          lastFailureAt: input.lastFailureAt,
          lastFailureCode: input.lastFailureCode,
          status: input.status,
          updatedAt: input.lastFailureAt
        });
      }
    },
    async upsertCredential(data: PrivateEsiCredentialWrite) {
      const current = records.get(data.eveIdentityId);
      const now = data.lastSuccessfulRefreshAt ?? new Date();
      records.set(data.eveIdentityId, {
        ...data,
        createdAt: current?.createdAt ?? now,
        id: current?.id ?? `credential-${data.eveIdentityId}`,
        updatedAt: now
      });
    }
  };
}
