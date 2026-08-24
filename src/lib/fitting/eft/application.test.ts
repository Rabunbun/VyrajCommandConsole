import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvedEftApplicationToFitState,
  resolvedEftDraftToApplication,
  resolvedEftDraftToFitState,
} from "./application";
import type { ResolvedEftDraft } from "./types";

function createDraft(status: ResolvedEftDraft["status"] = "ready") {
  const draft: ResolvedEftDraft = {
    analysis: {
      cargoHold: {
        baseCapacity: 480,
        entries: [
          { quantity: 100, typeId: 28668, typeName: "Nanite Repair Paste", volume: 0.01 },
        ],
        overBaseBy: 0,
        remainingBaseVolume: 479,
        usedVolume: 1,
      },
      droneBay: {
        capacity: 125,
        entries: [
          { quantity: 5, typeId: 2456, typeName: "Hobgoblin II", volume: 5 },
        ],
        remainingVolume: 100,
        usedVolume: 25,
      },
      fitting: {
        allowed: status !== "error",
        analysis: {
          calibrationUsed: 100,
          cpuUsed: 42,
          launcherHardpointsUsed: 0,
          powergridUsed: 9,
          turretHardpointsUsed: 1,
        },
        errors: [],
        warnings: [],
      },
    },
    cargo: [{ quantity: 100, typeId: 28668 }],
    diagnostics: [],
    drones: [{ quantity: 5, typeId: 2456 }],
    fitName: "Atomic Import",
    hullTypeId: 626,
    slots: {
      high: [
        {
          index: 0,
          module: {
            charge: { quantity: 80, typeId: 23025 },
            typeId: 12346,
          },
          rack: "high",
        },
        { index: 1, module: null, rack: "high" },
      ],
      low: [
        { index: 0, module: { charge: null, typeId: 2048 }, rack: "low" },
      ],
      mid: [{ index: 0, module: null, rack: "mid" }],
      rig: [{ index: 0, module: { charge: null, typeId: 31055 }, rack: "rig" }],
    },
    status,
  };
  return draft;
}

test("converts a resolved draft into a complete FitState with fresh unique IDs", () => {
  const draft = createDraft();
  const snapshot = structuredClone(draft);
  let nextId = 0;
  const state = resolvedEftDraftToFitState(draft, () => `import-${++nextId}`);

  assert.ok(state);
  assert.equal(state.hullTypeId, 626);
  assert.deepEqual(state.cargo, [{ quantity: 100, typeId: 28668 }]);
  assert.deepEqual(state.drones, [{ quantity: 5, typeId: 2456 }]);
  assert.deepEqual(state.slots.high[0].module, {
    charge: { quantity: 80, typeId: 23025 },
    instanceId: "import-2",
    typeId: 12346,
  });
  assert.equal(state.slots.low[0].module?.instanceId, "import-1");
  assert.equal(state.slots.rig[0].module?.instanceId, "import-3");
  assert.deepEqual(draft, snapshot);
});

test("does not create an application payload for an error draft", () => {
  const draft = createDraft("error");
  assert.equal(resolvedEftDraftToApplication(draft), null);
  assert.equal(resolvedEftDraftToFitState(draft, () => "unused"), null);
});

test("rejects malformed application data and duplicate generated IDs atomically", () => {
  const application = resolvedEftDraftToApplication(createDraft());
  assert.ok(application);

  const invalid = structuredClone(application);
  invalid.slots.high[0].index = 1;
  assert.equal(resolvedEftApplicationToFitState(invalid, () => "fresh"), null);
  assert.equal(resolvedEftApplicationToFitState(application, () => "duplicate"), null);
});
