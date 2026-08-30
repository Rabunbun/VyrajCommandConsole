import type { CharacterProfile } from "@/lib/fitting/skills/types";
import type { PrivateEsiActor } from "../types";
import type { CharacterSkillSnapshotSafeResult } from "./types";

export function projectLinkedCharacterProfile(
  actor: PrivateEsiActor,
  result: CharacterSkillSnapshotSafeResult
): CharacterProfile {
  if (
    result.eveIdentityId !== actor.eveIdentityId ||
    result.characterId !== actor.characterId ||
    !result.snapshot
  ) {
    return {
      boosters: { kind: "none" },
      implants: { kind: "none" },
      skillSource: {
        kind: "unavailable",
        reason: unavailableReason(result.status)
      }
    };
  }

  return {
    boosters: { kind: "none" },
    implants: { kind: "none" },
    skillSource: {
      characterId: actor.characterId,
      characterName: actor.characterName,
      eveIdentityId: actor.eveIdentityId,
      kind: "linked-character",
      snapshot: {
        capturedAt: result.fetchedAt,
        complete: true,
        skills: result.snapshot.skills.map((skill) => ({
          activeLevel: skill.activeLevel,
          trainedLevel: skill.trainedLevel,
          typeId: skill.skillTypeId
        })),
        stale: result.snapshot.stale
      }
    }
  };
}

function unavailableReason(
  status: CharacterSkillSnapshotSafeResult["status"]
) {
  if (status === "reauthorization-required") {
    return "Private ESI authorization is missing required skill scopes.";
  }

  if (status === "revoked") {
    return "Private ESI authorization has been revoked.";
  }

  return "No complete linked-character skill snapshot is available.";
}

