import "server-only";

import { getDb } from "@/lib/db";
import { getPrivateEsiConfigurationStatus } from "./config";
import {
  completePrivateEsiAuthorization,
  getPrivateEsiSafeStatus,
  refreshPrivateEsiAccessToken
} from "./credential-core";
import {
  decryptPrivateEsiRefreshToken,
  encryptPrivateEsiRefreshToken
} from "./encryption";
import {
  exchangePrivateEsiAuthorizationCode,
  exchangePrivateEsiRefreshToken,
  validatePrivateEsiAccessToken
} from "./oauth-client";
import { createPrivateEsiCredentialRepository } from "./repository";
import type { PrivateEsiActor } from "./types";

export async function connectPrivateEsiCredential(
  actor: PrivateEsiActor,
  code: string
) {
  return completePrivateEsiAuthorization(
    { actor, code },
    {
      encrypt: encryptPrivateEsiRefreshToken,
      exchangeCode: exchangePrivateEsiAuthorizationCode,
      repository: createPrivateEsiCredentialRepository(),
      validateAccessToken: validatePrivateEsiAccessToken
    }
  );
}

export async function getPrivateEsiCredentialStatus(actor: PrivateEsiActor) {
  return getPrivateEsiSafeStatus(
    actor,
    createPrivateEsiCredentialRepository(),
    getPrivateEsiConfigurationStatus().configured
  );
}

/** Returns an access token only to its server-side caller. */
export async function getFreshPrivateEsiAccessToken(actor: PrivateEsiActor) {
  return refreshPrivateEsiAccessToken(actor, {
    decrypt: decryptPrivateEsiRefreshToken,
    encrypt: encryptPrivateEsiRefreshToken,
    exchangeRefreshToken: exchangePrivateEsiRefreshToken,
    now: () => new Date(),
    repository: createPrivateEsiCredentialRepository(),
    validateAccessToken: validatePrivateEsiAccessToken
  });
}

export async function disconnectPrivateEsi(actor: PrivateEsiActor) {
  const [, credential] = await getDb().$transaction([
    getDb().eveCharacterSkillSnapshot.deleteMany({
      where: { eveIdentityId: actor.eveIdentityId }
    }),
    getDb().eveEsiCredential.deleteMany({
      where: { eveIdentityId: actor.eveIdentityId }
    })
  ]);

  return credential.count === 1;
}
