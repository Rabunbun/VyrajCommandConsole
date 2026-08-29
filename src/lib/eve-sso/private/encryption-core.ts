import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";
import {
  PrivateEsiCredentialError,
  type EncryptedPrivateEsiSecret
} from "./types";

const algorithm = "aes-256-gcm";
const ivLength = 12;

export function encryptPrivateEsiSecret(
  plaintext: string,
  key: Buffer,
  keyVersion: number,
  createIv: (size: number) => Buffer = randomBytes
): EncryptedPrivateEsiSecret {
  validateEncryptionInputs(plaintext, key, keyVersion);
  const iv = createIv(ivLength);

  if (iv.length !== ivLength) {
    throw new Error(`AES-GCM IV must contain exactly ${ivLength} bytes.`);
  }

  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(getAdditionalAuthenticatedData(keyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    keyVersion
  };
}

export function decryptPrivateEsiSecret(
  encrypted: EncryptedPrivateEsiSecret,
  key: Buffer
) {
  if (key.length !== 32) {
    throw new Error("Private ESI encryption key must contain exactly 32 bytes.");
  }

  try {
    const decipher = createDecipheriv(
      algorithm,
      key,
      Buffer.from(encrypted.iv, "base64")
    );
    decipher.setAAD(getAdditionalAuthenticatedData(encrypted.keyVersion));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new PrivateEsiCredentialError(
      "CREDENTIAL_DECRYPT_FAILED",
      "Private ESI credential decryption failed."
    );
  }
}

function validateEncryptionInputs(
  plaintext: string,
  key: Buffer,
  keyVersion: number
) {
  if (!plaintext) {
    throw new Error("A private ESI refresh token is required.");
  }

  if (key.length !== 32) {
    throw new Error("Private ESI encryption key must contain exactly 32 bytes.");
  }

  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error("Private ESI encryption key version must be a positive integer.");
  }
}

function getAdditionalAuthenticatedData(keyVersion: number) {
  return Buffer.from(`vyraj:eve-private-refresh-token:v${keyVersion}`, "utf8");
}
