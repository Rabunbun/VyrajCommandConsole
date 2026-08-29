CREATE TYPE "EveEsiCredentialStatus" AS ENUM (
    'USABLE',
    'REAUTHORIZATION_REQUIRED',
    'REVOKED',
    'UNAVAILABLE'
);

CREATE TABLE "EveEsiCredential" (
    "id" UUID NOT NULL,
    "eveIdentityId" UUID NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "refreshTokenIv" TEXT NOT NULL,
    "refreshTokenAuthTag" TEXT NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL,
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "EveEsiCredentialStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "lastSuccessfulRefreshAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EveEsiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EveEsiCredential_eveIdentityId_key"
ON "EveEsiCredential"("eveIdentityId");

CREATE INDEX "EveEsiCredential_status_idx"
ON "EveEsiCredential"("status");

CREATE INDEX "EveEsiCredential_lastSuccessfulRefreshAt_idx"
ON "EveEsiCredential"("lastSuccessfulRefreshAt");

ALTER TABLE "EveEsiCredential"
ADD CONSTRAINT "EveEsiCredential_eveIdentityId_fkey"
FOREIGN KEY ("eveIdentityId") REFERENCES "EveIdentity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
