import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    return Response.json({
      authenticated: false
    });
  }

  return Response.json({
    authenticated: true,
    officer: {
      officerName: session.officer.officerName,
      role: session.officer.role
    },
    expiresAt: session.expiresAt,
    assignedCorps: session.assignedCorps,
    permissions: session.permissions
  });
}
