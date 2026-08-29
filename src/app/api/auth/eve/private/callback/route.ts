import { NextRequest, NextResponse } from "next/server";
import { logEveSsoResult } from "@/lib/eve-sso/oauth";
import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { connectPrivateEsiCredential } from "@/lib/eve-sso/private/service";
import {
  clearPrivateEsiOAuthState,
  verifyAndConsumePrivateEsiOAuthState
} from "@/lib/eve-sso/private/state";
import { PrivateEsiCredentialError } from "@/lib/eve-sso/private/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const oauthError = request.nextUrl.searchParams.get("error");

  try {
    const actor = await requirePrivateEsiActor();
    await verifyAndConsumePrivateEsiOAuthState(actor, state);

    if (oauthError || !code) {
      throw new PrivateEsiCredentialError(
        "TOKEN_EXCHANGE_FAILED",
        "Private ESI authorization was not completed."
      );
    }

    await connectPrivateEsiCredential(actor, code);
    await logEveSsoResult({
      action: "Private ESI Credential Connected",
      characterId: BigInt(actor.characterId),
      characterName: actor.characterName,
      summary: `Private ESI character data was connected for ${actor.characterName}.`
    });

    return redirectToFitting(request, "connected");
  } catch (error) {
    await clearPrivateEsiOAuthState();
    const codeValue =
      error instanceof PrivateEsiCredentialError
        ? error.code
        : "TOKEN_EXCHANGE_FAILED";
    await logEveSsoResult({
      action: "Private ESI Authorization Failed",
      summary: `Private ESI opt-in authorization failed (${codeValue}).`
    });

    return redirectToFitting(request, codeValue.toLowerCase());
  }
}

function redirectToFitting(request: Request, result: string) {
  const url = new URL("/fitting", request.url);
  url.searchParams.set("privateEsi", result);

  return NextResponse.redirect(url);
}
