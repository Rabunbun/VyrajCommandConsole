import "server-only";

import { cookies } from "next/headers";
import { requirePrivateEsiEncryptionKey } from "./config";
import {
  createPrivateEsiOAuthState,
  inspectPrivateEsiOAuthStateKeyVersion,
  PRIVATE_ESI_OAUTH_STATE_TTL_MS,
  verifyPrivateEsiOAuthState
} from "./state-core";
import type { PrivateEsiActor } from "./types";
import { PrivateEsiCredentialError } from "./types";

const privateOauthStateCookieName = "vyraj_eve_private_oauth_state";
const privateOauthCookiePath = "/api/auth/eve/private";

export async function createAndStorePrivateEsiOAuthState(
  actor: PrivateEsiActor
) {
  const { key, keyVersion } = requirePrivateEsiEncryptionKey();
  const created = createPrivateEsiOAuthState({ actor, key, keyVersion });
  const cookieStore = await cookies();
  cookieStore.set(privateOauthStateCookieName, created.nonce, {
    httpOnly: true,
    maxAge: Math.round(PRIVATE_ESI_OAUTH_STATE_TTL_MS / 1000),
    path: privateOauthCookiePath,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return created.state;
}

export async function verifyAndConsumePrivateEsiOAuthState(
  actor: PrivateEsiActor,
  state: string
) {
  const cookieStore = await cookies();
  const expectedNonce =
    cookieStore.get(privateOauthStateCookieName)?.value ?? "";
  deletePrivateEsiStateCookie(cookieStore);

  if (!expectedNonce || !state) {
    throw new PrivateEsiCredentialError(
      "OAUTH_STATE_INVALID",
      "Private ESI OAuth state is missing or was already consumed."
    );
  }

  const keyVersion = inspectPrivateEsiOAuthStateKeyVersion(state);
  const { key } = requirePrivateEsiEncryptionKey(keyVersion);

  return verifyPrivateEsiOAuthState({
    actor,
    expectedNonce,
    key,
    state
  });
}

export async function clearPrivateEsiOAuthState() {
  const cookieStore = await cookies();
  deletePrivateEsiStateCookie(cookieStore);
}

function deletePrivateEsiStateCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  cookieStore.set(privateOauthStateCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: privateOauthCookiePath,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}
