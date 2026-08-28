import assert from "node:assert/strict";
import test from "node:test";

import { validateSavedFittingMetadata } from "./metadata";
import {
  createSavedFittingFromRepository,
  deleteSavedFittingFromRepository,
  updateSavedFittingFromRepository,
  type SavedFittingCreateData,
  type SavedFittingMutationRepository,
  type SavedFittingRevisionScope,
  type SavedFittingUpdateData
} from "./mutation-core";
import {
  resolveSavedFittingOwner,
  SavedFittingOwnerError
} from "./owner-resolution";
import {
  getSavedFittingFromRepository,
  listSavedFittingsFromRepository,
  type SavedFittingReadRepository,
  type SavedFittingReadRow
} from "./repository-core";
import type { SavedFittingSnapshotV1 } from "./types";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const fittingA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fittingB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fittingC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createSnapshot(hullTypeId = 626): SavedFittingSnapshotV1 {
  return {
    cargo: [],
    drones: [],
    hullTypeId,
    slots: {
      high: [{ index: 0, module: null }],
      low: [],
      mid: [],
      rig: []
    }
  };
}

function createRow(
  overrides: Partial<SavedFittingReadRow> = {}
): SavedFittingReadRow {
  return {
    createdAt: new Date("2026-08-25T12:00:00.000Z"),
    hullTypeId: 626,
    id: fittingA,
    name: "Fleet Vexor",
    revision: 1,
    snapshot: createSnapshot(),
    snapshotVersion: 1,
    updatedAt: new Date("2026-08-25T13:00:00.000Z"),
    ...overrides
  };
}

function createRepository(
  entries: Array<{ ownerEveIdentityId: string; row: SavedFittingReadRow }>
) {
  const calls = {
    find: [] as Array<{ fittingId: string; ownerEveIdentityId: string }>,
    list: [] as string[]
  };
  const repository: SavedFittingReadRepository = {
    async findByOwnerAndId(ownerEveIdentityId, fittingId) {
      calls.find.push({ fittingId, ownerEveIdentityId });
      return entries.find(
        (entry) =>
          entry.ownerEveIdentityId === ownerEveIdentityId &&
          entry.row.id === fittingId
      )?.row ?? null;
    },
    async listByOwner(ownerEveIdentityId) {
      calls.list.push(ownerEveIdentityId);
      return entries
        .filter((entry) => entry.ownerEveIdentityId === ownerEveIdentityId)
        .map((entry) => entry.row);
    }
  };

  return { calls, repository };
}

function createMutationRepository(
  initialEntries: Array<{
    ownerEveIdentityId: string;
    row: SavedFittingReadRow;
  }> = []
) {
  const entries = initialEntries.map((entry) => ({
    ownerEveIdentityId: entry.ownerEveIdentityId,
    row: structuredClone(entry.row)
  }));
  const generatedIds = [fittingB, fittingC];
  const calls = {
    create: [] as SavedFittingCreateData[],
    delete: [] as SavedFittingRevisionScope[],
    revisionLookup: [] as Array<{
      fittingId: string;
      ownerEveIdentityId: string;
    }>,
    update: [] as SavedFittingUpdateData[]
  };
  let timestamp = Date.parse("2026-08-25T14:00:00.000Z");

  const nextTimestamp = () => {
    const value = new Date(timestamp);
    timestamp += 1_000;
    return value;
  };

  const repository: SavedFittingMutationRepository = {
    async create(data) {
      calls.create.push(structuredClone(data));
      const now = nextTimestamp();
      const row: SavedFittingReadRow = {
        createdAt: now,
        hullTypeId: data.hullTypeId,
        id: generatedIds.shift() ?? crypto.randomUUID(),
        name: data.name,
        revision: data.revision,
        snapshot: structuredClone(data.snapshot),
        snapshotVersion: data.snapshotVersion,
        updatedAt: now
      };
      entries.push({ ownerEveIdentityId: data.ownerEveIdentityId, row });
      return structuredClone(row);
    },
    async deleteIfRevisionMatches(data) {
      calls.delete.push({ ...data });
      const index = entries.findIndex(
        (entry) =>
          entry.ownerEveIdentityId === data.ownerEveIdentityId &&
          entry.row.id === data.id &&
          entry.row.revision === data.expectedRevision
      );

      if (index === -1) {
        return false;
      }

      entries.splice(index, 1);
      return true;
    },
    async findRevisionByOwnerAndId(ownerEveIdentityId, fittingId) {
      calls.revisionLookup.push({ fittingId, ownerEveIdentityId });
      return entries.find(
        (entry) =>
          entry.ownerEveIdentityId === ownerEveIdentityId &&
          entry.row.id === fittingId
      )?.row.revision ?? null;
    },
    async updateIfRevisionMatches(data) {
      calls.update.push(structuredClone(data));
      const entry = entries.find(
        (candidate) =>
          candidate.ownerEveIdentityId === data.ownerEveIdentityId &&
          candidate.row.id === data.id &&
          candidate.row.revision === data.expectedRevision
      );

      if (!entry) {
        return null;
      }

      entry.row = {
        ...entry.row,
        hullTypeId: data.hullTypeId,
        name: data.name,
        revision: entry.row.revision + 1,
        snapshot: structuredClone(data.snapshot),
        snapshotVersion: data.snapshotVersion,
        updatedAt: nextTimestamp()
      };
      return structuredClone(entry.row);
    }
  };

  return { calls, entries, repository };
}

function resolveOwner(eveIdentityId: string) {
  return resolveSavedFittingOwner({
    checkpointEveIdentityId: eveIdentityId,
    linkedEveIdentityIds: [],
    officerId: null
  });
}

function expectOwnerError(
  operation: () => unknown,
  code: SavedFittingOwnerError["code"]
) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof SavedFittingOwnerError);
    assert.equal(error.code, code);
    return true;
  });
}

test("verified member and single linked officer identities resolve authoritatively", () => {
  assert.deepEqual(
    resolveSavedFittingOwner({
      checkpointEveIdentityId: ownerA,
      linkedEveIdentityIds: [],
      officerId: null
    }),
    { eveIdentityId: ownerA }
  );
  assert.deepEqual(
    resolveSavedFittingOwner({
      checkpointEveIdentityId: null,
      linkedEveIdentityIds: [ownerB],
      officerId: "officer-1"
    }),
    { eveIdentityId: ownerB }
  );
});

test("missing, manual-only, and ambiguous identity sources reject", () => {
  expectOwnerError(
    () =>
      resolveSavedFittingOwner({
        checkpointEveIdentityId: null,
        linkedEveIdentityIds: [],
        officerId: null
      }),
    "UNAUTHENTICATED"
  );
  expectOwnerError(
    () =>
      resolveSavedFittingOwner({
        checkpointEveIdentityId: null,
        linkedEveIdentityIds: [],
        officerId: "manual-officer"
      }),
    "OFFICER_IDENTITY_REQUIRED"
  );
  expectOwnerError(
    () =>
      resolveSavedFittingOwner({
        checkpointEveIdentityId: null,
        linkedEveIdentityIds: [ownerA, ownerB],
        officerId: "ambiguous-officer"
      }),
    "AMBIGUOUS_OFFICER_IDENTITY"
  );
});

test("client-provided owner data cannot influence owner resolution", () => {
  const input = {
    checkpointEveIdentityId: ownerA,
    clientOwnerEveIdentityId: ownerB,
    linkedEveIdentityIds: [],
    officerId: null
  };

  assert.deepEqual(resolveSavedFittingOwner(input), {
    eveIdentityId: ownerA
  });
});

test("metadata permits duplicate names and canonicalizes surrounding whitespace", () => {
  const first = validateSavedFittingMetadata({
    hullTypeId: 626,
    name: "  Fleet Vexor  ",
    revision: 1,
    snapshot: createSnapshot(),
    snapshotVersion: 1
  });
  const second = validateSavedFittingMetadata({
    hullTypeId: 626,
    name: "Fleet Vexor",
    revision: 1,
    snapshot: createSnapshot(),
    snapshotVersion: 1
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.name, second.value.name);
});

test("metadata rejects hull mismatch, bad revisions, and unknown versions", () => {
  const mismatch = validateSavedFittingMetadata({
    hullTypeId: 587,
    name: "Mismatch",
    revision: 1,
    snapshot: createSnapshot(626),
    snapshotVersion: 1
  });
  const invalidRevision = validateSavedFittingMetadata(
    {
      hullTypeId: 626,
      name: "Revision",
      revision: 2,
      snapshot: createSnapshot(),
      snapshotVersion: 1
    },
    { requireInitialRevision: true }
  );
  const future = validateSavedFittingMetadata({
    hullTypeId: 626,
    name: "Future",
    revision: 1,
    snapshot: createSnapshot(),
    snapshotVersion: 2
  });

  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.issues.some((issue) => issue.code === "HULL_TYPE_MISMATCH"));
  assert.equal(invalidRevision.ok, false);
  assert.ok(
    invalidRevision.issues.some(
      (issue) => issue.code === "INITIAL_REVISION_REQUIRED"
    )
  );
  assert.equal(future.ok, false);
  assert.ok(future.issues.some((issue) => issue.code === "SNAPSHOT_INVALID"));
  assert.equal(future.snapshotDiagnostics[0].code, "INVALID_SNAPSHOT_VERSION");
});

test("repository lookup scopes by owner and treats cross-owner access as unavailable", async () => {
  const { calls, repository } = createRepository([
    { ownerEveIdentityId: ownerA, row: createRow() }
  ]);
  const own = await getSavedFittingFromRepository(
    resolveOwner(ownerA),
    fittingA,
    repository
  );
  const crossOwner = await getSavedFittingFromRepository(
    resolveOwner(ownerB),
    fittingA,
    repository
  );

  assert.equal(own.ok, true);
  assert.equal(crossOwner.ok, false);
  assert.equal(crossOwner.code, "UNAVAILABLE");
  assert.deepEqual(calls.find, [
    { fittingId: fittingA, ownerEveIdentityId: ownerA },
    { fittingId: fittingA, ownerEveIdentityId: ownerB }
  ]);
});

test("repository list returns only the current owner's decoded records", async () => {
  const { calls, repository } = createRepository([
    { ownerEveIdentityId: ownerA, row: createRow() },
    {
      ownerEveIdentityId: ownerA,
      row: createRow({ id: fittingB, name: "Fleet Vexor" })
    },
    {
      ownerEveIdentityId: ownerB,
      row: createRow({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })
    }
  ]);
  const result = await listSavedFittingsFromRepository(
    resolveOwner(ownerA),
    repository
  );

  assert.deepEqual(result.fittings.map((fitting) => fitting.id), [fittingA, fittingB]);
  assert.equal(result.invalidRecords.length, 0);
  assert.deepEqual(calls.list, [ownerA]);
});

test("repository read boundary returns structured invalid snapshot failures", async () => {
  const { repository } = createRepository([
    {
      ownerEveIdentityId: ownerA,
      row: createRow({ snapshotVersion: 2 })
    }
  ]);
  const result = await getSavedFittingFromRepository(
    resolveOwner(ownerA),
    fittingA,
    repository
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_RECORD");
  assert.equal(
    result.invalidRecord.snapshotDiagnostics[0].code,
    "INVALID_SNAPSHOT_VERSION"
  );
});

test("create derives authoritative projections, trims the name, and starts revision one", async () => {
  const { calls, entries, repository } = createMutationRepository();
  const callerInput = {
    hullTypeId: 999,
    name: "  Save As Vexor  ",
    ownerEveIdentityId: ownerB,
    revision: 44,
    snapshot: createSnapshot(626),
    snapshotVersion: 99
  };
  const result = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    callerInput,
    repository
  );

  assert.equal(result.ok, true);
  assert.equal(result.fitting.name, "Save As Vexor");
  assert.equal(result.fitting.hullTypeId, 626);
  assert.equal(result.fitting.snapshotVersion, 1);
  assert.equal(result.fitting.revision, 1);
  assert.equal(entries[0].ownerEveIdentityId, ownerA);
  assert.deepEqual(calls.create[0], {
    hullTypeId: 626,
    name: "Save As Vexor",
    ownerEveIdentityId: ownerA,
    revision: 1,
    snapshot: createSnapshot(626),
    snapshotVersion: 1
  });
});

test("create permits duplicate names and accepts exactly the 120-character limit", async () => {
  const { entries, repository } = createMutationRepository();
  const name = "x".repeat(120);
  const first = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    { name, snapshot: createSnapshot() },
    repository
  );
  const second = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    { name, snapshot: createSnapshot() },
    repository
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].row.name, entries[1].row.name);
  assert.notEqual(entries[0].row.id, entries[1].row.id);
});

test("invalid create content returns diagnostics without touching the repository", async () => {
  const { calls, repository } = createMutationRepository();
  const emptyName = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    { name: "   ", snapshot: createSnapshot() },
    repository
  );
  const longName = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    { name: "x".repeat(121), snapshot: createSnapshot() },
    repository
  );
  const badSnapshot = await createSavedFittingFromRepository(
    resolveOwner(ownerA),
    { name: "Broken", snapshot: {} },
    repository
  );

  assert.equal(emptyName.ok, false);
  assert.equal(emptyName.code, "INVALID_INPUT");
  assert.ok(emptyName.issues.some((issue) => issue.code === "INVALID_NAME"));
  assert.equal(longName.ok, false);
  assert.equal(longName.code, "INVALID_INPUT");
  assert.ok(longName.issues.some((issue) => issue.code === "NAME_TOO_LONG"));
  assert.equal(badSnapshot.ok, false);
  assert.equal(badSnapshot.code, "INVALID_INPUT");
  assert.ok(
    badSnapshot.issues.some((issue) => issue.code === "SNAPSHOT_INVALID")
  );
  assert.ok(badSnapshot.snapshotDiagnostics.length > 0);
  assert.equal(calls.create.length, 0);
});

test("update atomically renames, changes hull projection, and increments once", async () => {
  const { calls, entries, repository } = createMutationRepository([
    { ownerEveIdentityId: ownerA, row: createRow() }
  ]);
  const callerInput = {
    expectedRevision: 1,
    hullTypeId: 999,
    id: fittingA,
    name: "  Updated Arbitrator  ",
    ownerEveIdentityId: ownerB,
    revision: 900,
    snapshot: createSnapshot(628),
    snapshotVersion: 900
  };
  const result = await updateSavedFittingFromRepository(
    resolveOwner(ownerA),
    callerInput,
    repository
  );

  assert.equal(result.ok, true);
  assert.equal(result.fitting.name, "Updated Arbitrator");
  assert.equal(result.fitting.hullTypeId, 628);
  assert.equal(result.fitting.revision, 2);
  assert.equal(result.fitting.snapshotVersion, 1);
  assert.equal(entries[0].ownerEveIdentityId, ownerA);
  assert.equal(calls.update[0].ownerEveIdentityId, ownerA);
  assert.equal(calls.update[0].expectedRevision, 1);
  assert.deepEqual(entries[0].row.snapshot, createSnapshot(628));
});

test("two writers cannot silently overwrite the same revision", async () => {
  const { entries, repository } = createMutationRepository([
    { ownerEveIdentityId: ownerA, row: createRow() }
  ]);
  const owner = resolveOwner(ownerA);
  const writerA = await updateSavedFittingFromRepository(
    owner,
    {
      expectedRevision: 1,
      id: fittingA,
      name: "Writer A",
      snapshot: createSnapshot(628)
    },
    repository
  );
  const writerB = await updateSavedFittingFromRepository(
    owner,
    {
      expectedRevision: 1,
      id: fittingA,
      name: "Writer B",
      snapshot: createSnapshot(587)
    },
    repository
  );

  assert.equal(writerA.ok, true);
  assert.equal(writerA.fitting.revision, 2);
  assert.deepEqual(writerB, {
    code: "REVISION_CONFLICT",
    currentRevision: 2,
    ok: false
  });
  assert.equal(entries[0].row.name, "Writer A");
  assert.equal(entries[0].row.hullTypeId, 628);
  assert.equal(entries[0].row.revision, 2);
});

test("update distinguishes only owner-scoped conflicts from unavailable records", async () => {
  const { calls, entries, repository } = createMutationRepository([
    {
      ownerEveIdentityId: ownerA,
      row: createRow({ name: "Private", revision: 7 })
    }
  ]);
  const crossOwner = await updateSavedFittingFromRepository(
    resolveOwner(ownerB),
    {
      expectedRevision: 7,
      id: fittingA,
      name: "Intruder",
      snapshot: createSnapshot(587)
    },
    repository
  );
  const missing = await updateSavedFittingFromRepository(
    resolveOwner(ownerA),
    {
      expectedRevision: 1,
      id: fittingB,
      name: "Missing",
      snapshot: createSnapshot()
    },
    repository
  );

  assert.deepEqual(crossOwner, { code: "UNAVAILABLE", ok: false });
  assert.deepEqual(missing, { code: "UNAVAILABLE", ok: false });
  assert.deepEqual(calls.revisionLookup, [
    { fittingId: fittingA, ownerEveIdentityId: ownerB },
    { fittingId: fittingB, ownerEveIdentityId: ownerA }
  ]);
  assert.equal(entries[0].row.name, "Private");
  assert.equal(entries[0].row.revision, 7);
});

test("invalid update identity and content cause no database mutation", async () => {
  const { calls, repository } = createMutationRepository([
    { ownerEveIdentityId: ownerA, row: createRow() }
  ]);
  const result = await updateSavedFittingFromRepository(
    resolveOwner(ownerA),
    {
      expectedRevision: 0,
      id: "not-a-uuid",
      name: " ",
      snapshot: {}
    },
    repository
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_INPUT");
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.code)),
    new Set([
      "INVALID_EXPECTED_REVISION",
      "INVALID_FITTING_ID",
      "INVALID_NAME",
      "SNAPSHOT_INVALID"
    ])
  );
  assert.equal(calls.update.length, 0);
  assert.equal(calls.revisionLookup.length, 0);
});

test("delete requires the current owner revision and makes later lookup unavailable", async () => {
  const { calls, entries, repository } = createMutationRepository([
    {
      ownerEveIdentityId: ownerA,
      row: createRow({ revision: 2 })
    }
  ]);
  const owner = resolveOwner(ownerA);
  const stale = await deleteSavedFittingFromRepository(
    owner,
    { expectedRevision: 1, id: fittingA },
    repository
  );
  const crossOwner = await deleteSavedFittingFromRepository(
    resolveOwner(ownerB),
    { expectedRevision: 2, id: fittingA },
    repository
  );
  const deleted = await deleteSavedFittingFromRepository(
    owner,
    { expectedRevision: 2, id: fittingA },
    repository
  );
  const missing = await deleteSavedFittingFromRepository(
    owner,
    { expectedRevision: 2, id: fittingA },
    repository
  );

  assert.deepEqual(stale, {
    code: "REVISION_CONFLICT",
    currentRevision: 2,
    ok: false
  });
  assert.deepEqual(crossOwner, { code: "UNAVAILABLE", ok: false });
  assert.deepEqual(deleted, {
    deletedFitting: { id: fittingA, revision: 2 },
    ok: true
  });
  assert.deepEqual(missing, { code: "UNAVAILABLE", ok: false });
  assert.equal(entries.length, 0);
  assert.deepEqual(calls.revisionLookup, [
    { fittingId: fittingA, ownerEveIdentityId: ownerA },
    { fittingId: fittingA, ownerEveIdentityId: ownerB },
    { fittingId: fittingA, ownerEveIdentityId: ownerA }
  ]);
});

test("invalid delete input is rejected before repository access", async () => {
  const { calls, repository } = createMutationRepository();
  const result = await deleteSavedFittingFromRepository(
    resolveOwner(ownerA),
    { expectedRevision: Number.MAX_SAFE_INTEGER, id: "bad" },
    repository
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_INPUT");
  assert.equal(calls.delete.length, 0);
  assert.equal(calls.revisionLookup.length, 0);
});
