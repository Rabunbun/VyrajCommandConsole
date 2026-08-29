import "server-only";

import {
  EveEsiCredentialStatus,
  Prisma,
  type EveEsiCredential
} from "@prisma/client";
import { getDb } from "@/lib/db";
import type {
  PrivateEsiCredentialRepository,
  PrivateEsiCredentialWrite
} from "./credential-core";
import type { PrivateEsiCredentialRecord } from "./types";

const credentialSelect = {
  createdAt: true,
  encryptedRefreshToken: true,
  encryptionKeyVersion: true,
  eveIdentityId: true,
  grantedScopes: true,
  id: true,
  lastFailureAt: true,
  lastFailureCode: true,
  lastSuccessfulRefreshAt: true,
  refreshTokenAuthTag: true,
  refreshTokenIv: true,
  status: true,
  updatedAt: true
} satisfies Prisma.EveEsiCredentialSelect;

export function createPrivateEsiCredentialRepository(): PrivateEsiCredentialRepository {
  return {
    async deleteByEveIdentityId(eveIdentityId) {
      const result = await getDb().eveEsiCredential.deleteMany({
        where: { eveIdentityId }
      });

      return result.count === 1;
    },
    async findByEveIdentityId(eveIdentityId) {
      const record = await getDb().eveEsiCredential.findUnique({
        select: credentialSelect,
        where: { eveIdentityId }
      });

      return record ? mapCredential(record) : null;
    },
    async markStatus(input) {
      await getDb().eveEsiCredential.updateMany({
        data: {
          lastFailureAt: input.lastFailureAt,
          lastFailureCode: input.lastFailureCode,
          status: input.status as EveEsiCredentialStatus
        },
        where: { eveIdentityId: input.eveIdentityId }
      });
    },
    async upsertCredential(data) {
      await getDb().eveEsiCredential.upsert({
        create: mapWrite(data),
        update: mapWrite(data),
        where: { eveIdentityId: data.eveIdentityId }
      });
    }
  };
}

function mapCredential(
  record: Pick<
    EveEsiCredential,
    | "createdAt"
    | "encryptedRefreshToken"
    | "encryptionKeyVersion"
    | "eveIdentityId"
    | "grantedScopes"
    | "id"
    | "lastFailureAt"
    | "lastFailureCode"
    | "lastSuccessfulRefreshAt"
    | "refreshTokenAuthTag"
    | "refreshTokenIv"
    | "status"
    | "updatedAt"
  >
): PrivateEsiCredentialRecord {
  return {
    authTag: record.refreshTokenAuthTag,
    ciphertext: record.encryptedRefreshToken,
    createdAt: record.createdAt,
    eveIdentityId: record.eveIdentityId,
    grantedScopes: record.grantedScopes,
    id: record.id,
    iv: record.refreshTokenIv,
    keyVersion: record.encryptionKeyVersion,
    lastFailureAt: record.lastFailureAt,
    lastFailureCode: record.lastFailureCode,
    lastSuccessfulRefreshAt: record.lastSuccessfulRefreshAt,
    status: record.status,
    updatedAt: record.updatedAt
  };
}

function mapWrite(data: PrivateEsiCredentialWrite) {
  return {
    encryptedRefreshToken: data.ciphertext,
    encryptionKeyVersion: data.keyVersion,
    eveIdentityId: data.eveIdentityId,
    grantedScopes: data.grantedScopes,
    lastFailureAt: data.lastFailureAt,
    lastFailureCode: data.lastFailureCode,
    lastSuccessfulRefreshAt: data.lastSuccessfulRefreshAt,
    refreshTokenAuthTag: data.authTag,
    refreshTokenIv: data.iv,
    status: data.status as EveEsiCredentialStatus
  };
}
