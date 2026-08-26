import assert from "node:assert/strict";
import test from "node:test";

import { validateSavedFittingMetadata } from "./metadata";
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
