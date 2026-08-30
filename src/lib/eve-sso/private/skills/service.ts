import "server-only";

import type { FitState } from "@/lib/fitting/fit-state";
import { analyzeFitSkillRequirements } from "@/lib/fitting/skills/static";
import type { PrivateEsiActor } from "../types";
import { getFreshPrivateEsiAccessToken } from "../service";
import {
  getCurrentCharacterSkillSnapshotCore,
  refreshCharacterSkillSnapshotCore
} from "./cache-core";
import {
  fetchCharacterSkillQueue,
  fetchCharacterSkills
} from "./esi-client";
import { projectLinkedCharacterProfile } from "./profile";
import { createCharacterSkillSnapshotRepository } from "./repository";

export async function getCurrentCharacterSkillSnapshot(actor: PrivateEsiActor) {
  return getCurrentCharacterSkillSnapshotCore({
    actor,
    now: new Date(),
    repository: createCharacterSkillSnapshotRepository()
  });
}

export async function refreshCharacterSkillSnapshot(
  actor: PrivateEsiActor,
  options: { force?: boolean } = {}
) {
  return refreshCharacterSkillSnapshotCore(
    { actor, force: options.force ?? false },
    {
      fetchQueue: fetchCharacterSkillQueue,
      fetchSkills: fetchCharacterSkills,
      getAccessToken: getFreshPrivateEsiAccessToken,
      now: () => new Date(),
      repository: createCharacterSkillSnapshotRepository()
    }
  );
}

export async function buildLinkedCharacterProfile(actor: PrivateEsiActor) {
  const result = await getCurrentCharacterSkillSnapshot(actor);
  return projectLinkedCharacterProfile(actor, result);
}

export async function analyzeLinkedCharacterFitSkills(
  actor: PrivateEsiActor,
  fitState: FitState
) {
  const profile = await buildLinkedCharacterProfile(actor);
  return analyzeFitSkillRequirements(fitState, profile);
}

