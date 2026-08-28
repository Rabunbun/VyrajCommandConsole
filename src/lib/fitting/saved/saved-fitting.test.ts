import assert from "node:assert/strict";
import test from "node:test";

import type { FitState } from "../fit-state";
import { canonicalizeSavedFittingSnapshot } from "./canonicalize";
import {
  createSavedFittingFingerprint,
  normalizeSavedFittingName
} from "./fingerprint";
import {
  createUnsavedFittingEditor,
  establishSavedFittingEditor,
  evaluateSavedFittingEditor
} from "./editor";
import {
  decodeSavedFittingSnapshot,
  runSequentialSavedFittingMigrations
} from "./migrate";
import {
  decodeSavedFittingSnapshotV1,
  fitStateToSavedFittingSnapshotV1,
  savedFittingSnapshotToApplicationCandidate
} from "./snapshot";
import type { SavedFittingSnapshotV1 } from "./types";

function createFitState(): FitState {
  return {
    cargo: [
      { quantity: 1, typeId: 28668 },
      { quantity: 4, typeId: 12058 },
      { quantity: 2, typeId: 28668 }
    ],
    drones: [
      { quantity: 2, typeId: 2456 },
      { quantity: 1, typeId: 2444 },
      { quantity: 3, typeId: 2456 }
    ],
    hullTypeId: 626,
    slots: {
      high: [
        {
          index: 0,
          module: {
            charge: { quantity: 80, typeId: 23025 },
            instanceId: "runtime-high-0",
            typeId: 12346
          }
        },
        { index: 1, module: null }
      ],
      low: [
        { index: 0, module: null },
        {
          index: 1,
          module: {
            charge: null,
            instanceId: "runtime-low-1",
            typeId: 2048
          }
        }
      ],
      mid: [{ index: 0, module: null }],
      rig: [
        {
          index: 0,
          module: {
            charge: null,
            instanceId: "runtime-rig-0",
            typeId: 31055
          }
        }
      ],
      subsystem: []
    }
  };
}

function createSnapshot(): SavedFittingSnapshotV1 {
  const result = fitStateToSavedFittingSnapshotV1(createFitState());
  assert.equal(result.ok, true);
  return result.value;
}

function fingerprint(name: string, snapshot: unknown) {
  const result = createSavedFittingFingerprint(name, snapshot);
  assert.equal(result.ok, true);
  return result.value;
}

test("FitState conversion strips instance IDs while retaining charges and exact topology", () => {
  const state = createFitState();
  const before = structuredClone(state);
  const result = fitStateToSavedFittingSnapshotV1(state);

  assert.equal(result.ok, true);
  assert.deepEqual(state, before);
  assert.deepEqual(result.value.slots.high, [
    {
      index: 0,
      module: {
        charge: { quantity: 80, typeId: 23025 },
        typeId: 12346
      }
    },
    { index: 1, module: null }
  ]);
  assert.equal("instanceId" in result.value.slots.high[0].module!, false);
  assert.deepEqual(result.value.slots.mid, [{ index: 0, module: null }]);
  assert.deepEqual(result.value.slots.low.map((slot) => slot.index), [0, 1]);
  assert.deepEqual(result.value.slots.rig.map((slot) => slot.index), [0]);
});

test("loaded editor context is clean for an identical fit and ignores runtime instance IDs", () => {
  const state = createFitState();
  const snapshot = createSnapshot();
  const editor = establishSavedFittingEditor({
    id: "00000000-0000-4000-8000-000000000001",
    name: "  Canonical Fit  ",
    revision: 7,
    snapshot
  });

  assert.equal(editor.savedFittingId, "00000000-0000-4000-8000-000000000001");
  assert.equal(editor.savedRevision, 7);
  assert.equal(editor.name, "Canonical Fit");
  assert.deepEqual(evaluateSavedFittingEditor(editor, state), {
    currentFingerprint: editor.baselineFingerprint,
    dirty: false,
    kind: "saved",
    label: "Saved"
  });

  const regeneratedIds = structuredClone(state);
  regeneratedIds.slots.high[0].module!.instanceId = "new-runtime-high-0";
  regeneratedIds.slots.low[1].module!.instanceId = "new-runtime-low-1";
  assert.equal(evaluateSavedFittingEditor(editor, regeneratedIds).dirty, false);
});

test("module placement, charge quantity, drones, cargo, and name changes mark a loaded fit dirty", () => {
  const state = createFitState();
  const editor = establishSavedFittingEditor({
    id: "00000000-0000-4000-8000-000000000002",
    name: "Dirty Coverage",
    revision: 1,
    snapshot: createSnapshot()
  });

  const moved = structuredClone(state);
  moved.slots.high[1].module = moved.slots.high[0].module;
  moved.slots.high[0].module = null;
  assert.equal(evaluateSavedFittingEditor(editor, moved).dirty, true);

  const chargeChanged = structuredClone(state);
  chargeChanged.slots.high[0].module!.charge!.quantity += 1;
  assert.equal(evaluateSavedFittingEditor(editor, chargeChanged).dirty, true);

  const dronesChanged = structuredClone(state);
  dronesChanged.drones[0].quantity += 1;
  assert.equal(evaluateSavedFittingEditor(editor, dronesChanged).dirty, true);

  const cargoChanged = structuredClone(state);
  cargoChanged.cargo[0].quantity += 1;
  assert.equal(evaluateSavedFittingEditor(editor, cargoChanged).dirty, true);

  assert.equal(
    evaluateSavedFittingEditor({ ...editor, name: "Renamed" }, state).dirty,
    true
  );
});

test("new and EFT-imported editors clear saved association and remain not saved", () => {
  const imported = createUnsavedFittingEditor("  Imported EFT  ");

  assert.deepEqual(imported, {
    baselineFingerprint: null,
    name: "Imported EFT",
    savedFittingId: null,
    savedRevision: null
  });
  assert.deepEqual(evaluateSavedFittingEditor(imported, createFitState()), {
    currentFingerprint: evaluateSavedFittingEditor(imported, createFitState()).currentFingerprint,
    dirty: true,
    kind: "not-saved",
    label: "Not Saved"
  });
});

test("canonicalization aggregates and sorts drone and cargo entries", () => {
  const result = fitStateToSavedFittingSnapshotV1(createFitState());

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.drones, [
    { quantity: 1, typeId: 2444 },
    { quantity: 5, typeId: 2456 }
  ]);
  assert.deepEqual(result.value.cargo, [
    { quantity: 4, typeId: 12058 },
    { quantity: 3, typeId: 28668 }
  ]);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ["DUPLICATE_ENTRY_AGGREGATED", "DUPLICATE_ENTRY_AGGREGATED"]
  );
});

test("equivalent unordered input has one deterministic canonical form", () => {
  const canonical = createSnapshot();
  const unordered = {
    slots: {
      rig: [...canonical.slots.rig].reverse(),
      low: [...canonical.slots.low].reverse(),
      mid: [...canonical.slots.mid].reverse(),
      high: [...canonical.slots.high].reverse()
    },
    hullTypeId: canonical.hullTypeId,
    drones: [...canonical.drones].reverse(),
    cargo: [...canonical.cargo].reverse()
  };
  const result = canonicalizeSavedFittingSnapshot(unordered);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, canonical);
  assert.equal(
    fingerprint("Canonical", unordered),
    fingerprint("Canonical", canonical)
  );
});

test("quantity aggregation rejects unsafe integer overflow", () => {
  const snapshot = createSnapshot();
  const result = canonicalizeSavedFittingSnapshot({
    ...snapshot,
    cargo: [
      { quantity: Number.MAX_SAFE_INTEGER, typeId: 28668 },
      { quantity: 1, typeId: 28668 }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((item) => item.code === "QUANTITY_OVERFLOW"));
});

test("strict decoding rejects malformed topology, runtime fields, type IDs, and quantities", () => {
  const snapshot = createSnapshot();
  const malformed = structuredClone(snapshot) as unknown as {
    cargo: Array<{ quantity: number; typeId: number }>;
    slots: SavedFittingSnapshotV1["slots"];
  };
  malformed.slots.high = [
    {
      index: 0,
      module: {
        charge: { quantity: 0, typeId: 23025 },
        instanceId: "must-not-persist",
        typeId: -1
      } as never
    },
    { index: 0, module: null }
  ];
  malformed.cargo = [{ quantity: 0, typeId: 28668 }];
  const result = decodeSavedFittingSnapshotV1(malformed);
  const codes = new Set(result.diagnostics.map((diagnostic) => diagnostic.code));

  assert.equal(result.ok, false);
  assert.ok(codes.has("DUPLICATE_SLOT_INDEX"));
  assert.ok(codes.has("MISSING_SLOT_INDEX"));
  assert.ok(codes.has("RUNTIME_FIELD_PRESENT"));
  assert.ok(codes.has("INVALID_TYPE_ID"));
  assert.ok(codes.has("INVALID_QUANTITY"));
});

test("application candidate remains separate and does not generate runtime IDs", () => {
  const snapshot = createSnapshot();
  const before = structuredClone(snapshot);
  const result = savedFittingSnapshotToApplicationCandidate(snapshot);

  assert.equal(result.ok, true);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(result.value.topology, {
    highSlots: 2,
    lowSlots: 2,
    midSlots: 1,
    rigSlots: 1
  });
  assert.equal("instanceId" in result.value.slots.high[0].module!, false);
  assert.deepEqual(result.value.slots.high[0].module?.charge, {
    quantity: 80,
    typeId: 23025
  });
});

test("fingerprints normalize names deterministically and document empty names", () => {
  const snapshot = createSnapshot();

  assert.equal(normalizeSavedFittingName("  Fleet Vexor  "), "Fleet Vexor");
  assert.equal(normalizeSavedFittingName("   "), "");
  assert.equal(
    fingerprint("  Fleet Vexor  ", snapshot),
    fingerprint("Fleet Vexor", snapshot)
  );
  assert.equal(fingerprint("   ", snapshot), fingerprint("", snapshot));
});

test("persistent changes affect fingerprints while runtime instance IDs do not", () => {
  const state = createFitState();
  const baselineSnapshot = fitStateToSavedFittingSnapshotV1(state);
  assert.equal(baselineSnapshot.ok, true);
  const baseline = fingerprint("Vexor", baselineSnapshot.value);

  const runtimeIdChange = structuredClone(state);
  runtimeIdChange.slots.high[0].module!.instanceId = "another-runtime-id";
  const runtimeSnapshot = fitStateToSavedFittingSnapshotV1(runtimeIdChange);
  assert.equal(runtimeSnapshot.ok, true);
  assert.equal(fingerprint("Vexor", runtimeSnapshot.value), baseline);

  const moved = structuredClone(baselineSnapshot.value);
  [moved.slots.low[0].module, moved.slots.low[1].module] = [
    moved.slots.low[1].module,
    moved.slots.low[0].module
  ];
  assert.notEqual(fingerprint("Vexor", moved), baseline);

  const chargeChanged = structuredClone(baselineSnapshot.value);
  chargeChanged.slots.high[0].module!.charge!.quantity += 1;
  assert.notEqual(fingerprint("Vexor", chargeChanged), baseline);

  const cargoChanged = structuredClone(baselineSnapshot.value);
  cargoChanged.cargo[0].quantity += 1;
  assert.notEqual(fingerprint("Vexor", cargoChanged), baseline);

  const dronesChanged = structuredClone(baselineSnapshot.value);
  dronesChanged.drones[0].quantity += 1;
  assert.notEqual(fingerprint("Vexor", dronesChanged), baseline);
});

test("V1 decoding canonicalizes a copy and rejects unknown future versions", () => {
  const snapshot = createSnapshot();
  const before = structuredClone(snapshot);
  const decoded = decodeSavedFittingSnapshot({
    snapshot,
    snapshotVersion: 1
  });
  const future = decodeSavedFittingSnapshot({
    snapshot,
    snapshotVersion: 2
  });

  assert.equal(decoded.ok, true);
  assert.notStrictEqual(decoded.value.snapshot, snapshot);
  assert.deepEqual(decoded.value.snapshot, before);
  assert.deepEqual(snapshot, before);
  assert.equal(future.ok, false);
  assert.equal(future.diagnostics[0].code, "INVALID_SNAPSHOT_VERSION");
});

test("migration runner applies real steps sequentially without mutating source input", () => {
  const input = {
    snapshot: { steps: [] as number[] },
    snapshotVersion: 1
  };
  const before = structuredClone(input);
  const migrations = new Map([
    [
      1,
      (value: unknown) => {
        const next = value as { steps: number[] };
        next.steps.push(1);
        return next;
      }
    ],
    [
      2,
      (value: unknown) => {
        const next = value as { steps: number[] };
        next.steps.push(2);
        return next;
      }
    ]
  ]);
  const result = runSequentialSavedFittingMigrations(input, 3, migrations);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    snapshot: { steps: [1, 2] },
    snapshotVersion: 3
  });
  assert.deepEqual(input, before);
});

test("missing migration steps reject cleanly", () => {
  const result = runSequentialSavedFittingMigrations(
    { snapshot: {}, snapshotVersion: 1 },
    2,
    new Map()
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "MIGRATION_MISSING");
});
