import "server-only";
import { OfficerRole, OfficerStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { logOfficerAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/password";
import {
  createOfficerSession,
  getAuthConfigurationStatus,
  getAuthCookieName,
  getCurrentOfficerSession,
  revokeCurrentOfficerSession,
  type CurrentOfficerSession
} from "@/lib/session";
import { clearEveSsoLocalCookies } from "@/lib/eve-sso/oauth";

const genericLoginError = "Officer name or password is incorrect.";

export async function loginOfficer(officerName: string, password: string) {
  const cleanOfficerName = officerName.trim();

  if (!cleanOfficerName || !password) {
    return {
      success: false as const,
      message: genericLoginError
    };
  }

  const officer = await getDb().officer.findFirst({
    where: {
      officerName: {
        equals: cleanOfficerName,
        mode: "insensitive"
      }
    }
  });

  const validPassword = officer
    ? await verifyPassword(password, officer.passwordHash)
    : false;

  debugAuth("login_attempt", {
    authConfigured: getAuthConfigurationStatus().configured,
    officerFound: Boolean(officer),
    passwordVerified: validPassword,
    cookieName: getAuthCookieName()
  });

  if (!officer || !validPassword || officer.status !== OfficerStatus.ACTIVE) {
    await logOfficerAudit({
      officerName: cleanOfficerName,
      module: "Auth",
      action: "Failed Login",
      targetType: "Officer",
      targetName: cleanOfficerName,
      summary: "Officer login failed.",
      details: { reason: "invalid_credentials_or_disabled" }
    });

    return {
      success: false as const,
      message: genericLoginError
    };
  }

  const session = await createOfficerSession(officer.id);
  await clearEveSsoLocalCookies();

  debugAuth("session_created", {
    officerFound: true,
    sessionCreated: true,
    cookieName: getAuthCookieName()
  });

  await getDb().officer.update({
    where: { id: officer.id },
    data: { lastLoginAt: new Date() }
  });

  await logOfficerAudit({
    officerId: officer.id,
    officerName: officer.officerName,
    officerRole: officer.role,
    module: "Auth",
    action: "Successful Login",
    targetType: "Officer",
    targetId: officer.id,
    targetName: officer.officerName,
    summary: `Officer ${officer.officerName} logged in.`,
    details: { expiresAt: session.expiresAt.toISOString() }
  });

  return {
    success: true as const,
    officerRole: officer.role
  };
}

function debugAuth(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info("[auth]", event, details);
}

export async function logoutOfficer() {
  const session = await getCurrentOfficerSession();

  await revokeCurrentOfficerSession();
  await clearEveSsoLocalCookies();

  if (session) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Auth",
      action: "Logout",
      targetType: "Officer",
      targetId: session.officer.id,
      targetName: session.officer.officerName,
      summary: `Officer ${session.officer.officerName} logged out.`
    });
  }
}

export async function requireOfficerSession(): Promise<CurrentOfficerSession> {
  const session = await getCurrentOfficerSession();

  if (!session) {
    throw new Error("Officer session required.");
  }

  return session;
}

export async function requireSuperAdmin(): Promise<CurrentOfficerSession> {
  const session = await requireOfficerSession();

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Auth",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/super",
      summary: "Non-super-admin officer attempted to access Super Admin Console."
    });

    throw new Error("Super Admin access required.");
  }

  return session;
}
