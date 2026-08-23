import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyFitState } from "./fit-state";
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
