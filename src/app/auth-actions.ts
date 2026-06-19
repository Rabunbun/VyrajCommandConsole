"use server";

import { OfficerRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { loginOfficer, logoutOfficer } from "@/lib/auth";
import { getCorpPortalAccessContext } from "@/lib/corp-portal-access";
import { sanitizeProtectedReturnTo } from "@/lib/route-policy";
import { getCurrentOfficerSession } from "@/lib/session";

export async function loginAction(formData: FormData) {
  const officerName = String(formData.get("officerName") || "");
  const password = String(formData.get("password") || "");
  const returnTo = sanitizeProtectedReturnTo(
    String(formData.get("returnTo") || "")
  );
  let result: Awaited<ReturnType<typeof loginOfficer>>;

  try {
    result = await loginOfficer(officerName, password);
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("AUTH_SESSION_SECRET")
        ? "Officer auth is not configured. Set AUTH_SESSION_SECRET."
        : "Officer login is temporarily unavailable.";

    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  if (!result.success) {
    redirect(`/login?error=${encodeURIComponent(result.message)}`);
  }

  if (returnTo) {
    const session = await getCurrentOfficerSession();
    const corpSlug = getCorpSlugFromReturnTo(returnTo);
    const access = session && corpSlug
      ? await getCorpPortalAccessContext(corpSlug, { session })
      : null;

    if (access?.allowed) {
      redirect(returnTo);
    }
  }

  if (result.officerRole === OfficerRole.SUPER_ADMIN) {
    redirect("/admin/super");
  }

  redirect("/");
}

export async function logoutAction() {
  await logoutOfficer();
  redirect("/login?loggedOut=1");
}

function getCorpSlugFromReturnTo(returnTo: string) {
  const match = returnTo.match(/^\/corp\/([^/]+)(?:\/|$)/);

  return match?.[1] ? decodeURIComponent(match[1]) : "";
}
