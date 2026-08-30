import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import {
  getCurrentCharacterSkillSnapshot,
  refreshCharacterSkillSnapshot
} from "@/lib/eve-sso/private/skills/service";
import { PrivateEsiCredentialError } from "@/lib/eve-sso/private/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePrivateEsiActor();
    const result = await getCurrentCharacterSkillSnapshot(actor);

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      { status: "unavailable" },
      {
        headers: { "Cache-Control": "no-store" },
        status: isAuthorizationFailure(error) ? 401 : 503
      }
    );
  }
}

export async function POST() {
  try {
    const actor = await requirePrivateEsiActor();
    const result = await refreshCharacterSkillSnapshot(actor, { force: true });

    return Response.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      { status: "unavailable" },
      {
        headers: { "Cache-Control": "no-store" },
        status: isAuthorizationFailure(error) ? 401 : 503
      }
    );
  }
}

function isAuthorizationFailure(error: unknown) {
  return (
    error instanceof PrivateEsiCredentialError &&
    error.code === "AUTHORIZATION_REQUIRED"
  );
}
