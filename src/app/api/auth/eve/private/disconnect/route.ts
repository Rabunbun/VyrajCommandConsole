import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { disconnectPrivateEsi } from "@/lib/eve-sso/private/service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actor = await requirePrivateEsiActor();
    const disconnected = await disconnectPrivateEsi(actor);

    return Response.json({ disconnected, success: true });
  } catch {
    return Response.json(
      { success: false },
      { status: 401 }
    );
  }
}
