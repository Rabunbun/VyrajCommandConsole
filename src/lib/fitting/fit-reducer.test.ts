import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyFitState, hasMeaningfulFitContent } from "./fit-state";
import { fittingReducer } from "./fit-reducer";

function createFitWithTwoModules() {
  let state = fittingReducer(createEmptyFitState(), {
    hullTypeId: 1,
    topology: { highSlots: 2, lowSlots: 0, midSlots: 1, rigSlots: 0 },
    type: "select-hull"
  });

  state = fittingReducer(state, {
    index: 0,
    module: { charge: null, instanceId: "high-0", typeId: 101 },
    moduleRack: "high",
    rack: "high",
    type: "fit-module"
  });
  return fittingReducer(state, {
    index: 0,
    module: { charge: null, instanceId: "mid-0", typeId: 202 },
    moduleRack: "mid",
    rack: "mid",
    type: "fit-module"
  });
}

test("bulk charge loading updates compatible targets in one reducer transition", () => {
  const state = createFitWithTwoModules();
  const next = fittingReducer(state, {
    entries: [
      {
        charge: { quantity: 80, typeId: 303 },
        index: 0,
        moduleTypeId: 101,
        rack: "high"
      },
      {
        charge: { quantity: 1, typeId: 303 },
        index: 0,
        moduleTypeId: 202,
        rack: "mid"
      }
    ],
    type: "load-charges"
  });

  assert.notStrictEqual(next, state);
  assert.deepEqual(next.slots.high[0].module?.charge, {
    quantity: 80,
    typeId: 303
  });
  assert.deepEqual(next.slots.mid[0].module?.charge, {
    quantity: 1,
    typeId: 303
  });
});

test("bulk charge loading is all-or-nothing when any target is stale", () => {
  const state = createFitWithTwoModules();
  const next = fittingReducer(state, {
    entries: [
      {
        charge: { quantity: 80, typeId: 303 },
        index: 0,
        moduleTypeId: 101,
        rack: "high"
      },
      {
        charge: { quantity: 1, typeId: 303 },
        index: 0,
        moduleTypeId: 999,
        rack: "mid"
      }
    ],
    type: "load-charges"
  });

  assert.strictEqual(next, state);
  assert.equal(next.slots.high[0].module?.charge, null);
  assert.equal(next.slots.mid[0].module?.charge, null);
});

test("cargo operations aggregate, set, remove, replace, and clear immutably", () => {
  const empty = createEmptyFitState();
  const first = fittingReducer(empty, {
    quantity: 2,
    type: "add-cargo",
    typeId: 28668
  });
  const aggregated = fittingReducer(first, {
    quantity: 3,
    type: "add-cargo",
    typeId: 28668
  });

  assert.notStrictEqual(first, empty);
  assert.deepEqual(aggregated.cargo, [{ quantity: 5, typeId: 28668 }]);
  assert.deepEqual(empty.cargo, []);

  const set = fittingReducer(aggregated, {
    quantity: 4,
    type: "set-cargo-quantity",
    typeId: 28668
  });
  assert.deepEqual(set.cargo, [{ quantity: 4, typeId: 28668 }]);

  const replaced = fittingReducer(set, {
    entries: [
      { quantity: 1, typeId: 33474 },
      { quantity: 2, typeId: 12058 },
      { quantity: 3, typeId: 33474 }
    ],
    type: "replace-cargo"
  });
  assert.deepEqual(replaced.cargo, [
    { quantity: 2, typeId: 12058 },
    { quantity: 4, typeId: 33474 }
  ]);

  const removed = fittingReducer(replaced, {
    type: "remove-cargo",
    typeId: 12058
  });
  assert.deepEqual(removed.cargo, [{ quantity: 4, typeId: 33474 }]);
  assert.deepEqual(fittingReducer(removed, { type: "clear-cargo" }).cargo, []);
});

test("cargo quantity overflow and invalid replacement are rejected atomically", () => {
  const state = fittingReducer(createEmptyFitState(), {
    quantity: Number.MAX_SAFE_INTEGER,
    type: "add-cargo",
    typeId: 28668
  });
  const overflow = fittingReducer(state, {
    quantity: 1,
    type: "add-cargo",
    typeId: 28668
  });
  const invalidReplacement = fittingReducer(state, {
    entries: [
      { quantity: Number.MAX_SAFE_INTEGER, typeId: 28668 },
      { quantity: 1, typeId: 28668 }
    ],
    type: "replace-cargo"
  });

  assert.strictEqual(overflow, state);
  assert.strictEqual(invalidReplacement, state);
});

test("selecting another hull clears all carried cargo", () => {
  const withCargo = fittingReducer(createFitWithTwoModules(), {
    quantity: 200,
    type: "add-cargo",
    typeId: 28668
  });
  const next = fittingReducer(withCargo, {
    hullTypeId: 626,
    topology: { highSlots: 4, lowSlots: 5, midSlots: 4, rigSlots: 3 },
    type: "select-hull"
  });

  assert.deepEqual(next.cargo, []);
  assert.ok(next.slots.high.every((slot) => slot.module === null));
});

test("replace-fit swaps the complete fitting atomically and defensively clones it", () => {
  const current = createFitWithTwoModules();
  const replacement = {
    cargo: [{ quantity: 4, typeId: 28668 }],
    drones: [{ quantity: 5, typeId: 2456 }],
    hullTypeId: 626,
    slots: {
      high: [{ index: 0, module: { charge: { quantity: 80, typeId: 23025 }, instanceId: "import-1", typeId: 12346 } }],
      low: [],
      mid: [],
      rig: [],
      subsystem: []
    }
  };
  const next = fittingReducer(current, { nextState: replacement, type: "replace-fit" });

  assert.notStrictEqual(next, replacement);
  assert.equal(next.hullTypeId, 626);
  assert.equal(next.slots.high[0].module?.instanceId, "import-1");
  assert.equal(next.slots.mid.length, 0);
  replacement.cargo[0].quantity = 99;
  assert.equal(next.cargo[0].quantity, 4);
});

test("replace-fit rejects an invalid candidate without changing the current fit", () => {
  const current = createFitWithTwoModules();
  const invalid = structuredClone(current);
  invalid.slots.high[0].module!.instanceId = invalid.slots.mid[0].module!.instanceId;
  assert.strictEqual(
    fittingReducer(current, { nextState: invalid, type: "replace-fit" }),
    current
  );
});

test("meaningful fit content excludes a hull alone and includes modules, drones, or cargo", () => {
  const hullOnly = fittingReducer(createEmptyFitState(), {
    hullTypeId: 626,
    topology: { highSlots: 1, lowSlots: 0, midSlots: 0, rigSlots: 0 },
    type: "select-hull"
  });
  assert.equal(hasMeaningfulFitContent(hullOnly), false);
  assert.equal(hasMeaningfulFitContent(createFitWithTwoModules()), true);
  assert.equal(
    hasMeaningfulFitContent({ ...hullOnly, drones: [{ quantity: 1, typeId: 2456 }] }),
    true
  );
  assert.equal(
    hasMeaningfulFitContent({ ...hullOnly, cargo: [{ quantity: 1, typeId: 28668 }] }),
    true
  );
});
