import { checkDatabaseConnection } from "@/lib/db";
import { getAuthConfigurationStatus } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();

  return Response.json({
    ok: database.status !== "error",
    app: "Vyraj Alliance Command Console v2",
    phase: "database_foundation",
    database,
    auth: getAuthConfigurationStatus(),
    timestamp: new Date().toISOString()
  });
}
