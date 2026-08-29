import "server-only";

import {
  decryptPrivateEsiSecret,
  encryptPrivateEsiSecret
} from "./encryption-core";
import { requirePrivateEsiEncryptionKey } from "./config";
import type { EncryptedPrivateEsiSecret } from "./types";
import { PrivateEsiCredentialError } from "./types";

export function encryptPrivateEsiRefreshToken(refreshToken: string) {
  const { key, keyVersion } = requirePrivateEsiEncryptionKey();

  return encryptPrivateEsiSecret(refreshToken, key, keyVersion);
}

export function decryptPrivateEsiRefreshToken(
  encrypted: EncryptedPrivateEsiSecret
) {
  try {
    const { key } = requirePrivateEsiEncryptionKey(encrypted.keyVersion);

    return decryptPrivateEsiSecret(encrypted, key);
  } catch (error) {
    if (error instanceof PrivateEsiCredentialError) {
      throw error;
    }

    throw new PrivateEsiCredentialError(
      "CREDENTIAL_DECRYPT_FAILED",
      "The private ESI credential could not be decrypted."
    );
  }
}
