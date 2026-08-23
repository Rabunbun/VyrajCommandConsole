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
