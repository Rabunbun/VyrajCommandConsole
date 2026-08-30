import assert from "node:assert/strict";
import test from "node:test";

import type { FitState } from "@/lib/fitting/fit-state";
import {
  analyzeSkillRequirements,
  collectFitSkillSources
} from "@/lib/fitting/skills/analysis";
import { PrivateEsiCredentialError, type PrivateEsiActor } from "../types";
import {
  calculateRefreshAfter,
  refreshCharacterSkillSnapshotCore,
  toSafeResult
} from "./cache-core";
import {
  applyCompletedSkillQueueCorrections,
  parseCharacterSkillQueueResponse,
  parseCharacterSkillsResponse
} from "./parser";
import { projectLinkedCharacterProfile } from "./profile";
import {
  CharacterSkillSyncError,
  type CharacterSkillCacheMetadata,
  type CharacterSkillSnapshotRecord,
  type CharacterSkillSnapshotRepository,
  type CharacterSkillSnapshotWrite,
  type CharacterSkillSyncDependencies
} from "./types";

const actor = {
  characterId: "90000001",
  characterName: "Vyraj Pilot",
  contextKey: "officer:session",
  eveIdentityId: "00000000-0000-4000-8000-000000000001"
} as PrivateEsiActor;
const emptyMetadata: CharacterSkillCacheMetadata = {
  cacheControl: null,
  etag: null,
  lastModified: null
};
const firstCheck = new Date("2026-08-30T12:00:00.000Z");

test("skills parser preserves trained 5 / active 4 and skillpoints", () => {
  const skills = parseCharacterSkillsResponse(
    skillsPayload([
      {
        active_skill_level: 4,
        skill_id: 3300,
        skillpoints_in_skill: 1_280_000,
        trained_skill_level: 5
      }
    ])
  );

  assert.deepEqual(skills, [
    {
      activeLevel: 4,
      skillTypeId: 3300,
      skillpoints: 1_280_000,
      trainedLevel: 5,
      trainedLevelSource: "skills"
    }
  ]);
});

test("skills parser rejects duplicate, invalid, and out-of-range skill data", () => {
  assert.throws(
    () =>
      parseCharacterSkillsResponse(
        skillsPayload([
          skillRow(3300, 1, 1),
          skillRow(3300, 2, 2)
        ])
      ),
    (error) =>
      error instanceof CharacterSkillSyncError &&
      error.code === "INVALID_SKILLS_RESPONSE"
  );
  assert.throws(
    () =>
      parseCharacterSkillsResponse(
        skillsPayload([skillRow(-1, 1, 1)])
      ),
    CharacterSkillSyncError
  );
  assert.throws(
    () =>
      parseCharacterSkillsResponse(
        skillsPayload([skillRow(3300, 6, 5)])
      ),
    CharacterSkillSyncError
  );
});

test("completed queue entries update trained level without fabricating active level", () => {
  const skills = parseCharacterSkillsResponse(
    skillsPayload([skillRow(3300, 3, 3)])
  );
  const queue = parseCharacterSkillQueueResponse([
    queueRow(0, 3300, 4, "2026-08-30T11:59:00.000Z"),
    queueRow(1, 3301, 2, "2026-08-30T11:58:00.000Z"),
    queueRow(2, 3302, 5, "2026-08-30T12:01:00.000Z")
  ]);
  const corrected = applyCompletedSkillQueueCorrections({
    now: firstCheck,
    queue,
    skills
  });

  assert.deepEqual(
    corrected.map((skill) => [
      skill.skillTypeId,
      skill.trainedLevel,
      skill.activeLevel,
      skill.trainedLevelSource
    ]),
    [
      [3300, 4, 3, "completed-queue"],
      [3301, 2, 0, "completed-queue"]
    ]
  );
});

test("normal synchronization persists complete data and response cache metadata", async () => {
  const repository = createMemoryRepository();
  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    dependencies(repository, {
      now: firstCheck,
      queue: modified(
        [queueRow(0, 3300, 4, "2026-08-30T11:59:00.000Z")],
        metadata("queue-v1", "public, max-age=90", "Sun, 30 Aug 2026 12:00:00 GMT")
      ),
      skills: modified(
        skillsPayload([skillRow(3300, 3, 3)]),
        metadata("skills-v1", "public, max-age=120", "Sun, 30 Aug 2026 12:00:00 GMT")
      )
    })
  );

  assert.equal(result.status, "available");
  assert.equal(result.snapshot?.skills[0].trainedLevel, 4);
  assert.equal(result.snapshot?.skills[0].activeLevel, 3);
  assert.equal(result.refreshAfter, "2026-08-30T12:01:30.000Z");
  assert.equal(repository.state?.skillsMetadata.etag, "skills-v1");
  assert.equal(
    repository.state?.skillsMetadata.lastModified,
    "Sun, 30 Aug 2026 12:00:00 GMT"
  );
  assert.equal(repository.state?.queueMetadata.etag, "queue-v1");
  assert.equal(result.diagnostics[0].code, "QUEUE_TRAINED_LEVEL_EXCEEDS_ACTIVE");
});

test("304 checks reuse the snapshot, preserve fetchedAt, and advance checkedAt", async () => {
  const repository = createMemoryRepository();
  await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    dependencies(repository, {
      now: firstCheck,
      queue: modified([], metadata("queue-v1", "max-age=120")),
      skills: modified(
        skillsPayload([skillRow(3300, 4, 4)]),
        metadata("skills-v1", "max-age=120")
      )
    })
  );
  const seen: Array<[string, CharacterSkillCacheMetadata | null]> = [];
  const secondCheck = new Date("2026-08-30T12:03:00.000Z");
  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    {
      ...dependencies(repository, {
        now: secondCheck,
        queue: notModified(metadata(null, "max-age=180")),
        skills: notModified(metadata(null, "max-age=180"))
      }),
      async fetchQueue(input) {
        seen.push(["queue", input.validators]);
        return notModified(metadata(null, "max-age=180"));
      },
      async fetchSkills(input) {
        seen.push(["skills", input.validators]);
        return notModified(metadata(null, "max-age=180"));
      }
    }
  );

  assert.equal(result.fetchedAt, firstCheck.toISOString());
  assert.equal(result.checkedAt, secondCheck.toISOString());
  assert.equal(result.refreshAfter, "2026-08-30T12:06:00.000Z");
  assert.deepEqual(
    seen.map(([endpoint, validators]) => [endpoint, validators?.etag]),
    [
      ["skills", "skills-v1"],
      ["queue", "queue-v1"]
    ]
  );
});

test("fresh cache skips credential and ESI work unless explicitly refreshed", async () => {
  const repository = createMemoryRepository(
    snapshotRecord({ refreshAfter: new Date("2026-08-30T12:05:00.000Z") })
  );
  let calls = 0;
  const deps = dependencies(repository, { now: firstCheck });
  deps.getAccessToken = async () => {
    calls += 1;
    return "server-token";
  };

  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: false },
    deps
  );

  assert.equal(result.status, "available");
  assert.equal(calls, 0);
});

test("temporary failure serves a stale last-known snapshot without changing checkedAt", async () => {
  const previous = snapshotRecord();
  const repository = createMemoryRepository(previous);
  const deps = dependencies(repository, { now: firstCheck });
  deps.fetchSkills = async () => {
    throw new CharacterSkillSyncError(
      "ESI_SKILLS_REQUEST_FAILED",
      "temporary",
      503
    );
  };

  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    deps
  );

  assert.equal(result.status, "stale");
  assert.equal(result.snapshot?.skills[0].activeLevel, 4);
  assert.equal(result.checkedAt, previous.checkedAt?.toISOString());
  assert.equal(result.lastErrorCode, "ESI_SKILLS_REQUEST_FAILED");
});

test("failure without a previous snapshot remains unavailable and never synthesizes zero skills", async () => {
  const repository = createMemoryRepository();
  const deps = dependencies(repository, { now: firstCheck });
  deps.fetchSkills = async () => {
    throw new CharacterSkillSyncError(
      "ESI_SKILLS_REQUEST_FAILED",
      "temporary",
      503
    );
  };

  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    deps
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.snapshot, null);
  assert.equal(result.checkedAt, null);
});

test("missing scopes and revoked credentials propagate safe snapshot status", async () => {
  for (const expected of [
    {
      code: "MISSING_REQUIRED_SCOPES" as const,
      status: "reauthorization-required"
    },
    { code: "CREDENTIAL_REVOKED" as const, status: "revoked" }
  ]) {
    const repository = createMemoryRepository();
    const deps = dependencies(repository, { now: firstCheck });
    deps.getAccessToken = async () => {
      throw new PrivateEsiCredentialError(expected.code, "credential failure");
    };

    const result = await refreshCharacterSkillSnapshotCore(
      { actor, force: true },
      deps
    );

    assert.equal(result.status, expected.status);
    assert.equal(result.snapshot, null);
    assert.equal(result.lastErrorCode, expected.code);
  }
});

test("partial endpoint failure does not publish the newly fetched skills body", async () => {
  const repository = createMemoryRepository(snapshotRecord());
  const deps = dependencies(repository, {
    now: firstCheck,
    skills: modified(skillsPayload([skillRow(3300, 5, 5)]))
  });
  deps.fetchQueue = async () => {
    throw new CharacterSkillSyncError(
      "ESI_QUEUE_REQUEST_FAILED",
      "temporary",
      503
    );
  };

  const result = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    deps
  );

  assert.equal(result.status, "stale");
  assert.equal(result.snapshot?.skills[0].trainedLevel, 4);
  assert.equal(repository.state?.skills?.[0].trainedLevel, 4);
});

test("linked CharacterProfile is pure, complete, and keeps implants/boosters empty", () => {
  const record = snapshotRecord();
  const result = toSafeResult(actor, record, firstCheck);
  const before = structuredClone(result);
  const profile = projectLinkedCharacterProfile(actor, result);

  assert.equal(profile.skillSource.kind, "linked-character");
  assert.deepEqual(profile.implants, { kind: "none" });
  assert.deepEqual(profile.boosters, { kind: "none" });
  assert.deepEqual(result, before);
  if (profile.skillSource.kind === "linked-character") {
    assert.equal(profile.skillSource.snapshot.complete, true);
    assert.equal(profile.skillSource.snapshot.skills[0].typeId, 3300);
  }
});

test("complete linked profiles analyze Merlin, Vexor, a Tech II weapon, and Hobgoblin II without mutating FitState", () => {
  const state: FitState = {
    cargo: [],
    drones: [{ quantity: 5, typeId: 2456 }],
    hullTypeId: 626,
    slots: {
      high: [
        {
          index: 0,
          module: { charge: null, instanceId: "weapon", typeId: 3170 }
        }
      ],
      low: [],
      mid: [],
      rig: [],
      subsystem: []
    }
  };
  const before = structuredClone(state);
  const profile = projectLinkedCharacterProfile(
    actor,
    toSafeResult(
      actor,
      snapshotRecord({
        skills: [
          storedSkill(3327, 3, 3),
          storedSkill(3436, 4, 4),
          storedSkill(3437, 4, 4)
        ]
      }),
      firstCheck
    )
  );
  const itemSources = collectFitSkillSources(state);
  itemSources.push({ kind: "hull", typeId: 603 });
  const analysis = analyzeSkillRequirements({
    itemSources,
    profile,
    requirementEdges: [
      { ordinal: 1, requiredLevel: 3, skillTypeId: 3327, typeId: 603 },
      { ordinal: 1, requiredLevel: 3, skillTypeId: 3327, typeId: 626 },
      { ordinal: 1, requiredLevel: 5, skillTypeId: 3327, typeId: 3170 },
      { ordinal: 1, requiredLevel: 5, skillTypeId: 3436, typeId: 2456 },
      { ordinal: 2, requiredLevel: 5, skillTypeId: 3437, typeId: 2456 }
    ],
    skillNames: [
      { typeId: 3327, typeName: "Spaceship Command" },
      { typeId: 3436, typeName: "Drones" },
      { typeId: 3437, typeName: "Light Drone Operation" }
    ],
    staticDataStatus: "available"
  });

  assert.equal(analysis.status, "missing");
  assert.equal(analysis.missingCount, 3);
  assert.ok(
    analysis.requirements.every((requirement) => requirement.met !== null)
  );
  assert.deepEqual(state, before);
});

test("a complete snapshot treats an absent required skill as authoritative level zero", () => {
  const profile = projectLinkedCharacterProfile(
    actor,
    toSafeResult(actor, snapshotRecord({ skills: [] }), firstCheck)
  );
  const analysis = analyzeSkillRequirements({
    itemSources: [{ kind: "module", typeId: 3170 }],
    profile,
    requirementEdges: [
      { ordinal: 1, requiredLevel: 5, skillTypeId: 3300, typeId: 3170 }
    ],
    skillNames: [{ typeId: 3300, typeName: "Gunnery" }],
    staticDataStatus: "available"
  });

  assert.equal(analysis.requirements[0].activeLevel, 0);
  assert.equal(analysis.requirements[0].trainedLevel, 0);
  assert.equal(analysis.status, "missing");
});

test("cache freshness follows Cache-Control and uses a conservative fallback", () => {
  assert.equal(
    calculateRefreshAfter(firstCheck, metadata(null, "public, max-age=90")).toISOString(),
    "2026-08-30T12:01:30.000Z"
  );
  assert.equal(
    calculateRefreshAfter(firstCheck, metadata(null, "no-cache")).toISOString(),
    firstCheck.toISOString()
  );
  assert.equal(
    calculateRefreshAfter(firstCheck, emptyMetadata).toISOString(),
    "2026-08-30T12:05:00.000Z"
  );
});

test("a slower earlier refresh cannot overwrite a newer successful snapshot", async () => {
  const repository = createMemoryRepository();
  let releaseFirst!: () => void;
  let announceFirst!: () => void;
  const firstWaiting = new Promise<void>((resolve) => {
    announceFirst = resolve;
  });
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstDeps = dependencies(repository, { now: firstCheck });
  firstDeps.fetchSkills = async () => {
    announceFirst();
    await firstGate;
    return modified(skillsPayload([skillRow(3300, 1, 1)]));
  };
  const first = refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    firstDeps
  );
  await firstWaiting;

  const secondCheck = new Date("2026-08-30T12:00:01.000Z");
  const second = await refreshCharacterSkillSnapshotCore(
    { actor, force: true },
    dependencies(repository, {
      now: secondCheck,
      skills: modified(skillsPayload([skillRow(3300, 5, 5)]))
    })
  );
  releaseFirst();
  const superseded = await first;

  assert.equal(second.snapshot?.skills[0].trainedLevel, 5);
  assert.equal(repository.state?.skills?.[0].trainedLevel, 5);
  assert.equal(superseded.snapshot?.skills[0].trainedLevel, 5);
  assert.ok(
    superseded.diagnostics.some(
      (diagnostic) => diagnostic.code === "REFRESH_SUPERSEDED"
    )
  );
});

function dependencies(
  repository: CharacterSkillSnapshotRepository,
  options: {
    now?: Date;
    queue?: Awaited<ReturnType<CharacterSkillSyncDependencies["fetchQueue"]>>;
    skills?: Awaited<ReturnType<CharacterSkillSyncDependencies["fetchSkills"]>>;
  } = {}
): CharacterSkillSyncDependencies {
  return {
    async fetchQueue() {
      return options.queue ?? modified([]);
    },
    async fetchSkills() {
      return (
        options.skills ??
        modified(skillsPayload([skillRow(3300, 4, 4)]))
      );
    },
    async getAccessToken() {
      return "server-only-access-token";
    },
    now() {
      return options.now ?? firstCheck;
    },
    repository
  };
}

function createMemoryRepository(initial: CharacterSkillSnapshotRecord | null = null) {
  const repository: CharacterSkillSnapshotRepository & {
    state: CharacterSkillSnapshotRecord | null;
  } = {
    state: initial,
    async beginRefresh(eveIdentityId) {
      const nextVersion = (repository.state?.refreshVersion ?? 0) + 1;
      repository.state = repository.state
        ? { ...repository.state, refreshVersion: nextVersion }
        : snapshotRecord({
            checkedAt: null,
            eveIdentityId,
            fetchedAt: null,
            refreshAfter: null,
            refreshVersion: nextVersion,
            skills: null,
            status: "UNAVAILABLE"
          });
      return cloneRecord(repository.state);
    },
    async commitFailure(input) {
      if (
        !repository.state ||
        repository.state.eveIdentityId !== input.eveIdentityId ||
        repository.state.refreshVersion !== input.refreshVersion
      ) {
        return false;
      }

      repository.state = {
        ...repository.state,
        lastErrorAt: input.lastErrorAt,
        lastErrorCode: input.lastErrorCode,
        status: input.status
      };
      return true;
    },
    async commitSuccess(input) {
      if (
        !repository.state ||
        repository.state.eveIdentityId !== input.eveIdentityId ||
        repository.state.refreshVersion !== input.refreshVersion
      ) {
        return false;
      }

      repository.state = {
        ...cloneWrite(input.snapshot),
        eveIdentityId: input.eveIdentityId,
        refreshVersion: input.refreshVersion
      };
      return true;
    },
    async findByEveIdentityId(eveIdentityId) {
      return repository.state?.eveIdentityId === eveIdentityId
        ? cloneRecord(repository.state)
        : null;
    }
  };

  return repository;
}

function snapshotRecord(
  overrides: Partial<CharacterSkillSnapshotRecord> = {}
): CharacterSkillSnapshotRecord {
  return {
    checkedAt: new Date("2026-08-30T11:55:00.000Z"),
    eveIdentityId: actor.eveIdentityId,
    fetchedAt: new Date("2026-08-30T11:55:00.000Z"),
    lastErrorAt: null,
    lastErrorCode: null,
    queueMetadata: metadata("queue-old", "max-age=120"),
    refreshAfter: new Date("2026-08-30T11:57:00.000Z"),
    refreshVersion: 0,
    skills: [storedSkill(3300, 4, 4)],
    skillsMetadata: metadata("skills-old", "max-age=120"),
    source: "ESI",
    status: "AVAILABLE",
    ...overrides
  };
}

function storedSkill(
  skillTypeId: number,
  activeLevel: 0 | 1 | 2 | 3 | 4 | 5,
  trainedLevel: 0 | 1 | 2 | 3 | 4 | 5
) {
  return {
    activeLevel,
    skillTypeId,
    skillpoints: 1000,
    trainedLevel,
    trainedLevelSource: "skills" as const
  };
}

function cloneRecord(record: CharacterSkillSnapshotRecord) {
  return structuredClone(record);
}

function cloneWrite(write: CharacterSkillSnapshotWrite) {
  return structuredClone(write);
}

function skillsPayload(skills: unknown[]) {
  return { skills, total_sp: 1_000_000 };
}

function skillRow(
  skillId: number,
  activeLevel: number,
  trainedLevel: number
) {
  return {
    active_skill_level: activeLevel,
    skill_id: skillId,
    skillpoints_in_skill: 1000,
    trained_skill_level: trainedLevel
  };
}

function queueRow(
  queuePosition: number,
  skillId: number,
  finishedLevel: number,
  finishDate: string
) {
  return {
    finish_date: finishDate,
    finished_level: finishedLevel,
    queue_position: queuePosition,
    skill_id: skillId
  };
}

function metadata(
  etag: string | null,
  cacheControl: string | null = null,
  lastModified: string | null = null
): CharacterSkillCacheMetadata {
  return { cacheControl, etag, lastModified };
}

function modified(
  payload: unknown,
  responseMetadata: CharacterSkillCacheMetadata = emptyMetadata
) {
  return {
    kind: "modified" as const,
    metadata: responseMetadata,
    payload
  };
}

function notModified(
  responseMetadata: CharacterSkillCacheMetadata = emptyMetadata
) {
  return { kind: "not-modified" as const, metadata: responseMetadata };
}
