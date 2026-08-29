import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { getPrivateEsiCredentialStatus } from "@/lib/eve-sso/private/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePrivateEsiActor();

    return Response.json(await getPrivateEsiCredentialStatus(actor));
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 401 }
    );
  }
}
