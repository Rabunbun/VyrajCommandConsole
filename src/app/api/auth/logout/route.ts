import { logoutOfficer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await logoutOfficer();

  return Response.json({
    success: true
  });
}
