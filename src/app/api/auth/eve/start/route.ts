import { NextResponse } from "next/server";
import { buildEveAuthorizeUrl, logEveSsoResult } from "@/lib/eve-sso/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authorizeUrl = await buildEveAuthorizeUrl();

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    await logEveSsoResult({
      action: "EVE SSO Start Failed",
      summary: error instanceof Error ? error.message : "EVE SSO start failed."
    });

    const url = new URL("/login", getAppBaseUrl());
    url.searchParams.set("error", "EVE SSO is not configured yet.");

    return NextResponse.redirect(url);
  }
}

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ||
    process.env.EVE_SSO_CALLBACK_URL?.replace(/\/api\/auth\/eve\/callback\/?$/, "") ||
    "http://localhost:3000";
}
