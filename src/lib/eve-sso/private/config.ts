import "server-only";

import { getEveSsoServerConfig } from "@/lib/eve-sso/config";
import { PrivateEsiCredentialError } from "./types";

const defaultActiveKeyVersion = 1;

export type PrivateEsiConfigurationStatus = {
  configured: boolean;
  encryptionConfigured: boolean;
  encryptionKeyVersion: number | null;
  missingVariables: string[];
  oauthConfigured: boolean;
};

export function getPrivateEsiConfigurationStatus(): PrivateEsiConfigurationStatus {
  const activeVersion = parseActiveKeyVersion();
  const activeKeyVariable = activeVersion
    ? getEncryptionKeyVariableName(activeVersion)
    : getEncryptionKeyVariableName(defaultActiveKeyVersion);
  const missingVariables = [
    "EVE_SSO_CLIENT_ID",
    "EVE_SSO_CLIENT_SECRET",
    "EVE_PRIVATE_SSO_CALLBACK_URL"
  ].filter((variableName) => !process.env[variableName]?.trim());

  if (!activeVersion) {
    missingVariables.push("EVE_ESI_TOKEN_ENCRYPTION_KEY_VERSION");
  }

  if (!readEncryptionKey(activeKeyVariable)) {
    missingVariables.push(activeKeyVariable);
  }
  const oauthConfigured = [
    "EVE_SSO_CLIENT_ID",
    "EVE_SSO_CLIENT_SECRET",
    "EVE_PRIVATE_SSO_CALLBACK_URL"
  ].every((variableName) => Boolean(process.env[variableName]?.trim()));
  const encryptionConfigured = Boolean(
    activeVersion && readEncryptionKey(activeKeyVariable)
  );

  return {
    configured: oauthConfigured && encryptionConfigured,
    encryptionConfigured,
    encryptionKeyVersion: activeVersion,
    missingVariables: Array.from(new Set(missingVariables)),
    oauthConfigured
  };
}

export function requirePrivateEsiOAuthConfig() {
  const status = getPrivateEsiConfigurationStatus();

  if (!status.oauthConfigured) {
    throw new PrivateEsiCredentialError(
      "CONFIGURATION_UNAVAILABLE",
      "Private ESI OAuth is not configured."
    );
  }

  const shared = getEveSsoServerConfig();

  return {
    callbackUrl: process.env.EVE_PRIVATE_SSO_CALLBACK_URL!.trim(),
    clientId: shared.clientId,
    clientSecret: shared.clientSecret,
    ssoBaseUrl: shared.ssoBaseUrl
  };
}

export function requirePrivateEsiEncryptionKey(version?: number) {
  const keyVersion = version ?? parseActiveKeyVersion();

  if (!keyVersion) {
    throw new PrivateEsiCredentialError(
      "CONFIGURATION_UNAVAILABLE",
      "Private ESI encryption key version is not configured."
    );
  }

  const variableName = getEncryptionKeyVariableName(keyVersion);
  const key = readEncryptionKey(variableName);

  if (!key) {
    throw new PrivateEsiCredentialError(
      "CONFIGURATION_UNAVAILABLE",
      `Private ESI encryption key version ${keyVersion} is unavailable.`
    );
  }

  return { key, keyVersion };
}

function parseActiveKeyVersion() {
  const raw = process.env.EVE_ESI_TOKEN_ENCRYPTION_KEY_VERSION?.trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getEncryptionKeyVariableName(version: number) {
  return `EVE_ESI_TOKEN_ENCRYPTION_KEY_V${version}`;
}

function readEncryptionKey(variableName: string) {
  const raw = process.env[variableName]?.trim();

  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return null;
  }

  const key = Buffer.from(raw, "base64");

  return key.length === 32 && key.toString("base64") === raw ? key : null;
}
