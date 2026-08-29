import { NextResponse } from "next/server";
import { logEveSsoResult } from "@/lib/eve-sso/oauth";
import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { buildPrivateEsiAuthorizeUrl } from "@/lib/eve-sso/private/oauth-client";
import {
  clearPrivateEsiOAuthState,
  createAndStorePrivateEsiOAuthState
} from "@/lib/eve-sso/private/state";
import { PrivateEsiCredentialError } from "@/lib/eve-sso/private/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requirePrivateEsiActor();
    const state = await createAndStorePrivateEsiOAuthState(actor);
    const authorizeUrl = await buildPrivateEsiAuthorizeUrl(state);

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    await clearPrivateEsiOAuthState();
    await logEveSsoResult({
      action: "Private ESI Authorization Start Failed",
      summary: "Private ESI opt-in authorization could not be started."
    });

    return redirectToFitting(
      request,
      error instanceof PrivateEsiCredentialError
        ? error.code.toLowerCase()
        : "start-failed"
    );
  }
}

function redirectToFitting(request: Request, result: string) {
  const url = new URL("/fitting", request.url);
  url.searchParams.set("privateEsi", result);

  return NextResponse.redirect(url);
}
