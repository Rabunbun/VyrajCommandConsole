import "server-only";
import { CorpStatus } from "@prisma/client";
import { getDb } from "@/lib/db";

export const publicRoutePolicy = [
  "/",
  "/join",
  "/login",
  "/member",
  "/eve-sso/unlinked",
  "/access-denied",
  "/api/auth/eve/start",
  "/api/auth/eve/callback",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/dev-health",
  "/favicon.ico"
] as const;

export const memberProtectedRoutePolicy = [
  "/corp/[corpId]",
  "/corp/[corpId]/attendance",
  "/corp/[corpId]/doctrine",
  "/corp/[corpId]/srp"
] as const;

export const officerProtectedRoutePolicy = [
  "/corp/[corpId]/recruitment",
  "/corp/[corpId]/loot-splits",
  "/corp/[corpId]/dashboard"
] as const;

export const adminProtectedRoutePolicy = ["/admin/*"] as const;

const memberReturnPathPattern =
  /^\/corp\/([^/?#]+)(?:\/(attendance|doctrine|srp))?$/;

export function sanitizeProtectedReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  let pathname: string;

  try {
    pathname = new URL(value, "https://vyraj.invalid").pathname;
  } catch {
    return "";
  }

  return memberReturnPathPattern.test(pathname) ? pathname : "";
}

export function buildLoginPath(returnTo: string) {
  const safeReturnTo = sanitizeProtectedReturnTo(returnTo);

  return safeReturnTo
    ? `/login?returnTo=${encodeURIComponent(safeReturnTo)}`
    : "/login";
}

export async function resolveVerifiedMemberReturnTo(input: {
  returnTo: string;
  corporationId: bigint | null;
}) {
  const safeReturnTo = sanitizeProtectedReturnTo(input.returnTo);
  const match = safeReturnTo.match(memberReturnPathPattern);

  if (!safeReturnTo || !match?.[1] || !input.corporationId) {
    return "";
  }

  const corpSlug = decodeURIComponent(match[1]);
  const corp = await getDb().corp.findFirst({
    where: {
      slug: corpSlug,
      status: {
        in: [CorpStatus.ACTIVE, CorpStatus.TRIAL]
      },
      eveIdentityConfig: {
        is: {
          eveCorporationId: input.corporationId
        }
      }
    },
    select: {
      id: true
    }
  });

  return corp ? safeReturnTo : "";
}
