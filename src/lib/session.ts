import "server-only";
import { randomBytes, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { OfficerRole, OfficerStatus } from "@prisma/client";
import { getDb } from "@/lib/db";

export type CurrentOfficerSession = {
  sessionId: string;
  expiresAt: string;
  officer: {
    id: string;
    officerName: string;
    role: OfficerRole;
    status: OfficerStatus;
  };
  permissions: Array<{
    permissionKey: string;
    corpId: string | null;
  }>;
  assignedCorps: Array<{
    corpId: string;
    corpSlug: string;
    corpName: string;
  }>;
};

export function getAuthCookieName() {
  return process.env.AUTH_COOKIE_NAME?.trim() || "vyraj_officer_session";
}

export function getAuthConfigurationStatus() {
  const secretLength = process.env.AUTH_SESSION_SECRET?.trim().length || 0;

  return {
    configured: secretLength >= 32,
    cookieName: getAuthCookieName(),
    sessionDurationHours: getSessionDurationHours()
  };
}

export function getSessionDurationHours() {
  const value = Number(process.env.SESSION_DURATION_HOURS || 6);
  return Number.isFinite(value) && value > 0 ? value : 6;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be set to at least 32 characters.");
  }

  return createHmac("sha256", secret).update(token).digest("hex");
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();

  cookieStore.set(getAuthCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentOfficerSession(): Promise<CurrentOfficerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAuthCookieName())?.value;

  if (!token) {
    return null;
  }

  let tokenHash: string;

  try {
    tokenHash = hashSessionToken(token);
  } catch {
    return null;
  }

  const session = await getDb().officerSession.findUnique({
    where: { tokenHash },
    include: {
      officer: {
        include: {
          permissions: true,
          corpAssignments: {
            include: {
              corp: {
                select: {
                  id: true,
                  slug: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (session.officer.status !== OfficerStatus.ACTIVE) {
    return null;
  }

  await getDb().officerSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
    officer: {
      id: session.officer.id,
      officerName: session.officer.officerName,
      role: session.officer.role,
      status: session.officer.status
    },
    permissions: session.officer.permissions.map((permission) => ({
      permissionKey: permission.permissionKey,
      corpId: permission.corpId
    })),
    assignedCorps: session.officer.corpAssignments.map((assignment) => ({
      corpId: assignment.corp.id,
      corpSlug: assignment.corp.slug,
      corpName: assignment.corp.name
    }))
  };
}

export async function createOfficerSession(officerId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + getSessionDurationHours() * 60 * 60 * 1000);

  await getDb().officerSession.create({
    data: {
      officerId,
      tokenHash,
      expiresAt
    }
  });

  await setSessionCookie(token, expiresAt);

  return { token, expiresAt };
}

export async function revokeCurrentOfficerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAuthCookieName())?.value;

  if (token) {
    try {
      const tokenHash = hashSessionToken(token);
      await getDb().officerSession.updateMany({
        where: {
          tokenHash,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
    } catch {
      // Missing/invalid auth configuration should not block cookie clearing.
    }
  }

  await clearSessionCookie();
}

export function isSuperAdminSession(session: CurrentOfficerSession | null) {
  return session?.officer.role === OfficerRole.SUPER_ADMIN;
}
