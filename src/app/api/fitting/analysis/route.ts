import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { buildLinkedCharacterProfile } from "@/lib/eve-sso/private/skills/service";
import { PrivateEsiCredentialError } from "@/lib/eve-sso/private/types";
import { analyzeFittingEffectiveResources } from "@/lib/fitting/dogma/effective-resources-static";
import { parseFittingSkillSources } from "@/lib/fitting/skills/request";
import {
  analyzeFittingSkillSources,
  resolveFittingSkillSourceNames
} from "@/lib/fitting/skills/static";
import {
  createAllVCharacterProfile,
  type CharacterProfile
} from "@/lib/fitting/skills/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400 });
  }

  if (!isObject(body)) {
    return Response.json({ error: "Invalid fitting-analysis request." }, { status: 400 });
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
    const profile = await resolveProfile(profileMode);
    const [analysis, effectiveAnalysis, sourceNames] = await Promise.all([
      analyzeFittingSkillSources(itemSources, profile),
      analyzeFittingEffectiveResources(itemSources, profile),
      resolveFittingSkillSourceNames(itemSources)
    ]);

    return Response.json(
      { analysis, effectiveAnalysis, sourceNames },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.warn("Fitting simulation analysis is temporarily unavailable.");
    return Response.json(
      { error: "Fitting simulation analysis is temporarily unavailable." },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}

async function resolveProfile(
  profileMode: "all-v" | "linked-character"
): Promise<CharacterProfile> {
  if (profileMode === "all-v") return createAllVCharacterProfile();

  try {
    return await buildLinkedCharacterProfile(await requirePrivateEsiActor());
  } catch (error) {
    if (
      error instanceof PrivateEsiCredentialError &&
      error.code === "AUTHORIZATION_REQUIRED"
    ) {
      return {
        boosters: { kind: "none" },
        implants: { kind: "none" },
        skillSource: {
          kind: "unavailable",
          reason: "Linked character data requires login."
        }
      };
    }
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
