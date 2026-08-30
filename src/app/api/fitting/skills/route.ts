import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { buildLinkedCharacterProfile } from "@/lib/eve-sso/private/skills/service";
import { PrivateEsiCredentialError } from "@/lib/eve-sso/private/types";
import { parseFittingSkillSources } from "@/lib/fitting/skills/request";
import {
  analyzeFittingSkillSources,
  resolveFittingSkillSourceNames
} from "@/lib/fitting/skills/static";
import { createAllVCharacterProfile } from "@/lib/fitting/skills/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400 });
  }

  if (!isObject(body)) {
    return Response.json({ error: "Invalid skill-analysis request." }, { status: 400 });
  }

  const profileMode = body.profileMode;
  const itemSources = parseFittingSkillSources(body.itemSources);

  if (
    (profileMode !== "all-v" && profileMode !== "linked-character") ||
    !itemSources
  ) {
    return Response.json(
      { error: "A valid profile mode and fitting source list are required." },
      { status: 400 }
    );
  }

  try {
    const profile =
      profileMode === "all-v"
        ? createAllVCharacterProfile()
        : await buildLinkedCharacterProfile(await requirePrivateEsiActor());
    const [analysis, sourceNames] = await Promise.all([
      analyzeFittingSkillSources(itemSources, profile),
      resolveFittingSkillSourceNames(itemSources)
    ]);

    return Response.json(
      { analysis, sourceNames },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const unauthorized =
      error instanceof PrivateEsiCredentialError &&
      error.code === "AUTHORIZATION_REQUIRED";

    return Response.json(
      { error: unauthorized ? "Linked character data requires login." : "Skill analysis is temporarily unavailable." },
      {
        headers: { "Cache-Control": "no-store" },
        status: unauthorized ? 401 : 503
      }
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

