import {
  CharacterSkillSyncError,
  type CharacterSkillLevel,
  type StoredCharacterSkill
} from "./types";

type ParsedQueueEntry = {
  finishDate: Date | null;
  finishedLevel: Exclude<CharacterSkillLevel, 0>;
  queuePosition: number;
  skillTypeId: number;
};

export function parseCharacterSkillsResponse(
  payload: unknown
): StoredCharacterSkill[] {
  if (!isObject(payload) || !Array.isArray(payload.skills)) {
    throw invalidSkills("The ESI skills response is not an object with a skills array.");
  }

  if (!isNonNegativeSafeInteger(payload.total_sp)) {
    throw invalidSkills("The ESI skills response has an invalid total_sp value.");
  }

  const seen = new Set<number>();
  const skills = payload.skills.map((entry, index) => {
    if (!isObject(entry)) {
      throw invalidSkills(`Skill entry ${index} is not an object.`);
    }

    const skillTypeId = entry.skill_id;
    const activeLevel = entry.active_skill_level;
    const trainedLevel = entry.trained_skill_level;
    const skillpoints = entry.skillpoints_in_skill;

    if (!isPositiveSafeInteger(skillTypeId)) {
      throw invalidSkills(`Skill entry ${index} has an invalid skill_id.`);
    }

    if (seen.has(skillTypeId)) {
      throw invalidSkills(`Skill type ${skillTypeId} appears more than once.`);
    }

    if (!isSkillLevel(activeLevel) || !isSkillLevel(trainedLevel)) {
      throw invalidSkills(`Skill type ${skillTypeId} has an invalid level.`);
    }

    if (!isNonNegativeSafeInteger(skillpoints)) {
      throw invalidSkills(`Skill type ${skillTypeId} has invalid skillpoints.`);
    }

    seen.add(skillTypeId);

    return {
      activeLevel,
      skillTypeId,
      skillpoints,
      trainedLevel,
      trainedLevelSource: "skills" as const
    };
  });

  return skills.toSorted((left, right) => left.skillTypeId - right.skillTypeId);
}

export function parseCharacterSkillQueueResponse(
  payload: unknown
): ParsedQueueEntry[] {
  if (!Array.isArray(payload)) {
    throw invalidQueue("The ESI skillqueue response is not an array.");
  }

  const positions = new Set<number>();

  return payload.map((entry, index) => {
    if (!isObject(entry)) {
      throw invalidQueue(`Skillqueue entry ${index} is not an object.`);
    }

    const skillTypeId = entry.skill_id;
    const finishedLevel = entry.finished_level;
    const queuePosition = entry.queue_position;

    if (!isPositiveSafeInteger(skillTypeId)) {
      throw invalidQueue(`Skillqueue entry ${index} has an invalid skill_id.`);
    }

    if (!isCompletedSkillLevel(finishedLevel)) {
      throw invalidQueue(`Skillqueue entry ${index} has an invalid finished_level.`);
    }

    if (!isNonNegativeSafeInteger(queuePosition)) {
      throw invalidQueue(`Skillqueue entry ${index} has an invalid queue_position.`);
    }

    if (positions.has(queuePosition)) {
      throw invalidQueue(`Skillqueue position ${queuePosition} appears more than once.`);
    }

    const finishDate = parseOptionalDate(entry.finish_date);

    if (entry.finish_date !== undefined && entry.finish_date !== null && !finishDate) {
      throw invalidQueue(`Skillqueue entry ${index} has an invalid finish_date.`);
    }

    positions.add(queuePosition);

    return { finishDate, finishedLevel, queuePosition, skillTypeId };
  });
}

export function applyCompletedSkillQueueCorrections(input: {
  now: Date;
  queue: ParsedQueueEntry[];
  skills: StoredCharacterSkill[];
}) {
  const skills = new Map(
    input.skills.map((skill) => [skill.skillTypeId, { ...skill }])
  );

  for (const entry of input.queue) {
    if (!entry.finishDate || entry.finishDate.getTime() > input.now.getTime()) {
      continue;
    }

    const current = skills.get(entry.skillTypeId);

    if (current && current.trainedLevel >= entry.finishedLevel) {
      continue;
    }

    skills.set(entry.skillTypeId, {
      activeLevel: current?.activeLevel ?? 0,
      skillTypeId: entry.skillTypeId,
      skillpoints: current?.skillpoints ?? null,
      trainedLevel: entry.finishedLevel,
      trainedLevelSource: "completed-queue"
    });
  }

  return Array.from(skills.values()).toSorted(
    (left, right) => left.skillTypeId - right.skillTypeId
  );
}

export function parseStoredCharacterSkills(
  payload: unknown
): StoredCharacterSkill[] | null {
  if (payload === null) {
    return null;
  }

  if (!Array.isArray(payload)) {
    return null;
  }

  const seen = new Set<number>();
  const parsed: StoredCharacterSkill[] = [];

  for (const entry of payload) {
    if (
      !isObject(entry) ||
      !isPositiveSafeInteger(entry.skillTypeId) ||
      !isSkillLevel(entry.activeLevel) ||
      !isSkillLevel(entry.trainedLevel) ||
      !(
        entry.skillpoints === null ||
        isNonNegativeSafeInteger(entry.skillpoints)
      ) ||
      !["skills", "completed-queue"].includes(
        typeof entry.trainedLevelSource === "string"
          ? entry.trainedLevelSource
          : ""
      ) ||
      seen.has(entry.skillTypeId)
    ) {
      return null;
    }

    seen.add(entry.skillTypeId);
    parsed.push({
      activeLevel: entry.activeLevel,
      skillTypeId: entry.skillTypeId,
      skillpoints: entry.skillpoints,
      trainedLevel: entry.trainedLevel,
      trainedLevelSource: entry.trainedLevelSource as
        | "skills"
        | "completed-queue"
    });
  }

  return parsed.toSorted((left, right) => left.skillTypeId - right.skillTypeId);
}

function invalidSkills(message: string) {
  return new CharacterSkillSyncError("INVALID_SKILLS_RESPONSE", message);
}

function invalidQueue(message: string) {
  return new CharacterSkillSyncError("INVALID_QUEUE_RESPONSE", message);
}

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSkillLevel(value: unknown): value is CharacterSkillLevel {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5;
}

function isCompletedSkillLevel(
  value: unknown
): value is Exclude<CharacterSkillLevel, 0> {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

