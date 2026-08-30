import { PrivateEsiCredentialError, type PrivateEsiActor } from "../types";
import {
  applyCompletedSkillQueueCorrections,
  parseCharacterSkillQueueResponse,
  parseCharacterSkillsResponse
} from "./parser";
import {
  CharacterSkillSyncError,
  type CharacterSkillCacheMetadata,
  type CharacterSkillSnapshotDiagnostic,
  type CharacterSkillSnapshotRecord,
  type CharacterSkillSnapshotSafeResult,
  type CharacterSkillSnapshotStatus,
  type CharacterSkillSnapshotWrite,
  type CharacterSkillSyncDependencies
} from "./types";

const fallbackRefreshIntervalMs = 5 * 60 * 1000;

export async function getCurrentCharacterSkillSnapshotCore(input: {
  actor: PrivateEsiActor;
  now: Date;
  repository: CharacterSkillSyncDependencies["repository"];
}): Promise<CharacterSkillSnapshotSafeResult> {
  const record = await input.repository.findByEveIdentityId(
    input.actor.eveIdentityId
  );

  return toSafeResult(input.actor, record, input.now);
}

export async function refreshCharacterSkillSnapshotCore(
  input: { actor: PrivateEsiActor; force: boolean },
  dependencies: CharacterSkillSyncDependencies
): Promise<CharacterSkillSnapshotSafeResult> {
  const refreshStartedAt = dependencies.now();
  const current = await dependencies.repository.findByEveIdentityId(
    input.actor.eveIdentityId
  );

  if (!input.force && isFreshSuccessfulSnapshot(current, refreshStartedAt)) {
    return toSafeResult(input.actor, current, refreshStartedAt);
  }

  const reservation = await dependencies.repository.beginRefresh(
    input.actor.eveIdentityId
  );

  try {
    const accessToken = await dependencies.getAccessToken(input.actor);
    const skillsResponse = await dependencies.fetchSkills({
      accessToken,
      actor: input.actor,
      validators: reservation.skills ? reservation.skillsMetadata : null
    });
    const baseSkills =
      skillsResponse.kind === "modified"
        ? parseCharacterSkillsResponse(skillsResponse.payload)
        : requireExistingSkills(reservation);

    // If /skills changed, queue is fetched unconditionally. This prevents a
    // separately cached 304 queue response from being combined with a new
    // authoritative skills body (important after skill extraction).
    const queueResponse = await dependencies.fetchQueue({
      accessToken,
      actor: input.actor,
      validators:
        skillsResponse.kind === "not-modified" && reservation.skills
          ? reservation.queueMetadata
          : null
    });

    if (
      queueResponse.kind === "not-modified" &&
      skillsResponse.kind === "modified"
    ) {
      throw new CharacterSkillSyncError(
        "NOT_MODIFIED_WITHOUT_SNAPSHOT",
        "ESI returned an unconditioned 304 for the skillqueue endpoint."
      );
    }

    const checkedAt = dependencies.now();
    const skills =
      queueResponse.kind === "modified"
        ? applyCompletedSkillQueueCorrections({
            now: checkedAt,
            queue: parseCharacterSkillQueueResponse(queueResponse.payload),
            skills: baseSkills
          })
        : requireExistingSkills(reservation);
    const skillsMetadata = mergeMetadata(
      reservation.skillsMetadata,
      skillsResponse.metadata
    );
    const queueMetadata = mergeMetadata(
      reservation.queueMetadata,
      queueResponse.metadata
    );
    const changed =
      skillsResponse.kind === "modified" || queueResponse.kind === "modified";
    const snapshot: CharacterSkillSnapshotWrite = {
      checkedAt,
      fetchedAt: changed ? checkedAt : reservation.fetchedAt,
      lastErrorAt: null,
      lastErrorCode: null,
      queueMetadata,
      refreshAfter: earliestDate(
        calculateRefreshAfter(checkedAt, skillsMetadata),
        calculateRefreshAfter(checkedAt, queueMetadata)
      ),
      skills,
      skillsMetadata,
      source: "ESI",
      status: "AVAILABLE"
    };
    const committed = await dependencies.repository.commitSuccess({
      eveIdentityId: input.actor.eveIdentityId,
      refreshVersion: reservation.refreshVersion,
      snapshot
    });

    if (!committed) {
      return latestAfterSupersededRefresh(input.actor, dependencies, checkedAt);
    }

    return toSafeResult(
      input.actor,
      {
        ...snapshot,
        eveIdentityId: input.actor.eveIdentityId,
        refreshVersion: reservation.refreshVersion
      },
      checkedAt
    );
  } catch (error) {
    const failureAt = dependencies.now();
    const failure = classifyFailure(error, Boolean(reservation.skills));
    const committed = await dependencies.repository.commitFailure({
      eveIdentityId: input.actor.eveIdentityId,
      lastErrorAt: failureAt,
      lastErrorCode: failure.code,
      refreshVersion: reservation.refreshVersion,
      status: failure.status
    });

    if (!committed) {
      return latestAfterSupersededRefresh(input.actor, dependencies, failureAt);
    }

    return toSafeResult(
      input.actor,
      {
        ...reservation,
        lastErrorAt: failureAt,
        lastErrorCode: failure.code,
        status: failure.status
      },
      failureAt
    );
  }
}

export function calculateRefreshAfter(
  checkedAt: Date,
  metadata: CharacterSkillCacheMetadata
) {
  const cacheControl = metadata.cacheControl?.toLocaleLowerCase("en-US") ?? "";

  if (/(?:^|,)\s*(?:no-cache|no-store)\b/.test(cacheControl)) {
    return new Date(checkedAt);
  }

  const maxAge = readCacheSeconds(cacheControl, "max-age") ??
    readCacheSeconds(cacheControl, "s-maxage");

  return new Date(
    checkedAt.getTime() +
      (maxAge === null ? fallbackRefreshIntervalMs : maxAge * 1000)
  );
}

export function toSafeResult(
  actor: PrivateEsiActor,
  record: CharacterSkillSnapshotRecord | null,
  now: Date,
  refreshSuperseded = false
): CharacterSkillSnapshotSafeResult {
  const hasSnapshot = Boolean(record?.skills);
  const due =
    !record?.refreshAfter || record.refreshAfter.getTime() <= now.getTime();
  const stale = hasSnapshot && (record?.status !== "AVAILABLE" || due);
  const diagnostics: CharacterSkillSnapshotDiagnostic[] = (record?.skills ?? [])
    .filter(
      (skill) =>
        skill.trainedLevelSource === "completed-queue" &&
        skill.trainedLevel > skill.activeLevel
    )
    .map((skill) => ({
      code: "QUEUE_TRAINED_LEVEL_EXCEEDS_ACTIVE" as const,
      message: `Completed queue training raised trained level for skill ${skill.skillTypeId} above its authoritative active level.`,
      skillTypeId: skill.skillTypeId
    }));

  if (refreshSuperseded) {
    diagnostics.push({
      code: "REFRESH_SUPERSEDED",
      message: "A newer synchronization request superseded this refresh."
    });
  }

  return {
    characterId: actor.characterId,
    characterName: actor.characterName,
    checkedAt: record?.checkedAt?.toISOString() ?? null,
    diagnostics,
    eveIdentityId: actor.eveIdentityId,
    fetchedAt: record?.fetchedAt?.toISOString() ?? null,
    lastErrorAt: record?.lastErrorAt?.toISOString() ?? null,
    lastErrorCode: record?.lastErrorCode ?? null,
    refreshAfter: record?.refreshAfter?.toISOString() ?? null,
    snapshot: record?.skills
      ? {
          complete: true,
          skills: record.skills.map((skill) => ({
            activeLevel: skill.activeLevel,
            skillTypeId: skill.skillTypeId,
            skillpoints: skill.skillpoints,
            trainedLevel: skill.trainedLevel
          })),
          stale
        }
      : null,
    source: "esi",
    status: resolveSafeStatus(record?.status ?? "UNAVAILABLE", hasSnapshot, due)
  };
}

function isFreshSuccessfulSnapshot(
  record: CharacterSkillSnapshotRecord | null,
  now: Date
) {
  return Boolean(
    record?.skills &&
      record.status === "AVAILABLE" &&
      record.refreshAfter &&
      record.refreshAfter.getTime() > now.getTime()
  );
}

function requireExistingSkills(record: CharacterSkillSnapshotRecord) {
  if (!record.skills) {
    throw new CharacterSkillSyncError(
      "NOT_MODIFIED_WITHOUT_SNAPSHOT",
      "ESI returned 304 but no complete skill snapshot exists."
    );
  }

  return record.skills.map((skill) => ({ ...skill }));
}

function mergeMetadata(
  previous: CharacterSkillCacheMetadata,
  current: CharacterSkillCacheMetadata
): CharacterSkillCacheMetadata {
  return {
    cacheControl: current.cacheControl ?? previous.cacheControl,
    etag: current.etag ?? previous.etag,
    lastModified: current.lastModified ?? previous.lastModified
  };
}

function readCacheSeconds(cacheControl: string, directive: string) {
  const match = cacheControl.match(
    new RegExp(`(?:^|,)\\s*${directive}\\s*=\\s*"?(\\d+)"?`, "i")
  );

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function earliestDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function resolveSafeStatus(
  status: CharacterSkillSnapshotStatus,
  hasSnapshot: boolean,
  due: boolean
): CharacterSkillSnapshotSafeResult["status"] {
  if (status === "REAUTHORIZATION_REQUIRED") {
    return "reauthorization-required";
  }

  if (status === "REVOKED") {
    return "revoked";
  }

  if (hasSnapshot && (status === "STALE" || due)) {
    return "stale";
  }

  if (hasSnapshot && status === "AVAILABLE") {
    return "available";
  }

  return "unavailable";
}

function classifyFailure(error: unknown, hasSnapshot: boolean): {
  code: string;
  status: Exclude<CharacterSkillSnapshotStatus, "AVAILABLE">;
} {
  if (error instanceof PrivateEsiCredentialError) {
    if (error.code === "MISSING_REQUIRED_SCOPES") {
      return { code: error.code, status: "REAUTHORIZATION_REQUIRED" };
    }

    if (
      error.code === "CREDENTIAL_REVOKED" ||
      error.code === "INVALID_GRANT" ||
      error.code === "IDENTITY_MISMATCH"
    ) {
      return { code: error.code, status: "REVOKED" };
    }

    return {
      code: error.code,
      status: hasSnapshot ? "STALE" : "UNAVAILABLE"
    };
  }

  if (error instanceof CharacterSkillSyncError) {
    if (error.httpStatus === 403) {
      return { code: error.code, status: "REAUTHORIZATION_REQUIRED" };
    }

    return {
      code: error.code,
      status: hasSnapshot ? "STALE" : "UNAVAILABLE"
    };
  }

  return {
    code: "SKILL_SYNCHRONIZATION_FAILED",
    status: hasSnapshot ? "STALE" : "UNAVAILABLE"
  };
}

async function latestAfterSupersededRefresh(
  actor: PrivateEsiActor,
  dependencies: CharacterSkillSyncDependencies,
  now: Date
) {
  const latest = await dependencies.repository.findByEveIdentityId(
    actor.eveIdentityId
  );

  return toSafeResult(actor, latest, now, true);
}
