import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrivateEsiActor } from "./types";
import { PrivateEsiCredentialError } from "./types";

export const PRIVATE_ESI_OAUTH_PURPOSE = "connect-private-character-data";
export const PRIVATE_ESI_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type PrivateEsiOAuthStatePayload = {
  characterId: string;
  contextBinding: string;
  eveIdentityId: string;
  expiresAt: number;
  issuedAt: number;
  keyVersion: number;
  nonce: string;
  purpose: string;
  version: 1;
};

export function createPrivateEsiOAuthState(input: {
  actor: PrivateEsiActor;
  key: Buffer;
  keyVersion: number;
  nonce?: string;
  now?: number;
  purpose?: string;
}) {
  const now = input.now ?? Date.now();
  const nonce = input.nonce ?? randomBytes(32).toString("base64url");
  const payload: PrivateEsiOAuthStatePayload = {
    characterId: input.actor.characterId,
    contextBinding: createContextBinding(input.actor.contextKey, input.key),
    eveIdentityId: input.actor.eveIdentityId,
    expiresAt: now + PRIVATE_ESI_OAUTH_STATE_TTL_MS,
    issuedAt: now,
    keyVersion: input.keyVersion,
    nonce,
    purpose: input.purpose ?? PRIVATE_ESI_OAUTH_PURPOSE,
    version: 1
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = signState(encodedPayload, input.key);

  return { nonce, state: `${encodedPayload}.${signature}` };
}

export function inspectPrivateEsiOAuthStateKeyVersion(state: string) {
  const payload = decodePayload(state);

  return payload.keyVersion;
}

export function verifyPrivateEsiOAuthState(input: {
  actor: PrivateEsiActor;
  expectedNonce: string;
  key: Buffer;
  now?: number;
  state: string;
}) {
  const [encodedPayload, suppliedSignature] = input.state.split(".");

  if (!encodedPayload || !suppliedSignature) {
    throw stateError("MALFORMED_OAUTH_STATE", "Private ESI OAuth state is malformed.");
  }

  const expectedSignature = signState(encodedPayload, input.key);

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    throw stateError("OAUTH_STATE_INVALID", "Private ESI OAuth state signature is invalid.");
  }

  const payload = decodePayload(input.state);
  const now = input.now ?? Date.now();

  if (payload.purpose !== PRIVATE_ESI_OAUTH_PURPOSE || payload.version !== 1) {
    throw stateError("OAUTH_STATE_INVALID", "Private ESI OAuth state purpose is invalid.");
  }

  if (payload.expiresAt <= now || payload.issuedAt > now + 30_000) {
    throw stateError("OAUTH_STATE_EXPIRED", "Private ESI OAuth state has expired.");
  }

  const valid =
    safeEqual(payload.nonce, input.expectedNonce) &&
    safeEqual(payload.eveIdentityId, input.actor.eveIdentityId) &&
    safeEqual(payload.characterId, input.actor.characterId) &&
    safeEqual(
      payload.contextBinding,
      createContextBinding(input.actor.contextKey, input.key)
    );

  if (!valid) {
    throw stateError("OAUTH_STATE_INVALID", "Private ESI OAuth state context is invalid.");
  }

  return payload;
}

function decodePayload(state: string): PrivateEsiOAuthStatePayload {
  const encodedPayload = state.split(".")[0];

  if (!encodedPayload) {
    throw stateError("MALFORMED_OAUTH_STATE", "Private ESI OAuth state is malformed.");
  }

  try {
    const value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<PrivateEsiOAuthStatePayload>;

    if (
      value.version !== 1 ||
      typeof value.purpose !== "string" ||
      typeof value.eveIdentityId !== "string" ||
      typeof value.characterId !== "string" ||
      typeof value.contextBinding !== "string" ||
      typeof value.nonce !== "string" ||
      !Number.isSafeInteger(value.issuedAt) ||
      !Number.isSafeInteger(value.expiresAt) ||
      !Number.isSafeInteger(value.keyVersion) ||
      (value.keyVersion ?? 0) < 1
    ) {
      throw new Error("invalid payload");
    }

    return value as PrivateEsiOAuthStatePayload;
  } catch (error) {
    if (error instanceof PrivateEsiCredentialError) {
      throw error;
    }

    throw stateError("MALFORMED_OAUTH_STATE", "Private ESI OAuth state is malformed.");
  }
}

function createContextBinding(contextKey: string, key: Buffer) {
  return createHmac("sha256", deriveStateSigningKey(key))
    .update(`vyraj:eve-private-context:${contextKey}`)
    .digest("base64url");
}

function signState(encodedPayload: string, key: Buffer) {
  return createHmac("sha256", deriveStateSigningKey(key))
    .update(`vyraj:eve-private-oauth-state:${encodedPayload}`)
    .digest("base64url");
}

function deriveStateSigningKey(key: Buffer) {
  return createHmac("sha256", key)
    .update("vyraj:eve-private-state-signing-key:v1")
    .digest();
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function stateError(
  code: "MALFORMED_OAUTH_STATE" | "OAUTH_STATE_EXPIRED" | "OAUTH_STATE_INVALID",
  message: string
) {
  return new PrivateEsiCredentialError(code, message);
}
