import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  consumeEveSsoReturnTo,
  createLinkedOfficerSession,
  enrichEveIdentityFromPublicEsi,
  exchangeCodeForEveTokens,
  getPostLoginRedirectForOfficer,
  logEveSsoResult,
  setUnlinkedIdentityCookie,
  upsertEveIdentity,
  validateEveAccessToken,
  verifyAndConsumeOAuthState
} from "@/lib/eve-sso/oauth";
import { resolveVerifiedMemberReturnTo } from "@/lib/route-policy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (oauthError) {
    await clearOAuthStateCookie();
    await logEveSsoResult({
      action: "EVE SSO OAuth Error",
      summary: "EVE SSO returned an OAuth error response."
    });

    return redirectWithLoginError(origin, "EVE SSO authorization was not completed.");
  }

  if (!code) {
    await clearOAuthStateCookie();
    await logEveSsoResult({
      action: "EVE SSO Missing Code",
      summary: "EVE SSO callback did not include an authorization code."
    });

    return redirectWithLoginError(origin, "EVE SSO callback was missing an authorization code.");
  }

  const validState = await verifyAndConsumeOAuthState(state || "");

  if (!validState) {
    await logEveSsoResult({
      action: "EVE SSO Invalid State",
      summary: "EVE SSO callback state validation failed."
    });

    return redirectWithLoginError(origin, "EVE SSO state validation failed. Please try again.");
  }

  const returnTo = await consumeEveSsoReturnTo();

  try {
    const tokenResponse = await exchangeCodeForEveTokens(code);
    const identityClaims = await validateEveAccessToken(tokenResponse.access_token || "");
    const enrichment = await enrichEveIdentityFromPublicEsi({
      characterId: identityClaims.characterId,
      characterName: identityClaims.characterName
    });

    if (enrichment.status === "failed") {
      await logEveSsoResult({
        action: "EVE Identity Enrichment Failed",
        characterId: identityClaims.characterId,
        characterName: identityClaims.characterName,
        summary: `EVE identity was verified, but public corp/alliance enrichment failed at ${enrichment.stage}.`,
        details: {
          characterId: identityClaims.characterId.toString(),
          characterName: identityClaims.characterName,
          stage: enrichment.stage,
          httpStatus: enrichment.httpStatus ?? null,
          message: enrichment.message
        }
      });
    }

    const identity = await upsertEveIdentity({
      characterId: identityClaims.characterId,
      characterName: identityClaims.characterName,
      enrichment: enrichment.status === "enriched" ? enrichment.enrichment : null
    });
    const officer = await createLinkedOfficerSession(identity);

    if (officer) {
      return NextResponse.redirect(new URL(getPostLoginRedirectForOfficer(officer), origin));
    }

    const shouldShowMemberLanding = !identity.memberLandingSeenAt;

    await setUnlinkedIdentityCookie(identity.id);
    await logEveSsoResult({
      action: "EVE SSO Identity Verified",
      characterId: identity.characterId,
      characterName: identity.characterName,
      summary: `EVE identity ${identity.characterName} verified without linked active officer access.`
    });

    const authorizedReturnTo = await resolveVerifiedMemberReturnTo({
      returnTo,
      corporationId: identity.corporationId
    });

    return NextResponse.redirect(
      new URL(
        authorizedReturnTo ||
          (returnTo || shouldShowMemberLanding ? "/member" : "/"),
        origin
      )
    );
  } catch (error) {
    await logEveSsoResult({
      action: "EVE SSO Callback Failed",
      summary: error instanceof Error ? error.message : "EVE SSO callback failed."
    });

    return redirectWithLoginError(
      origin,
      "EVE SSO login failed. Please try again or use manual officer login.",
      returnTo
    );
  }
}

function redirectWithLoginError(origin: string, message: string, returnTo = "") {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", message);
  if (returnTo) {
    loginUrl.searchParams.set("returnTo", returnTo);
  }

  return NextResponse.redirect(loginUrl);
}
