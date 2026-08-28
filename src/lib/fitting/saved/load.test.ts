import assert from "node:assert/strict";
import test from "node:test";

import type {
  CargoHoldValidationResponse,
  DroneBayValidationResponse,
  FittingAnalysisResponse,
  FitValidationIssue
} from "@/lib/fitting/types";
import { savedFittingApplicationToFitState } from "./load-application";
import {
  loadSavedFittingFromRepository,
  resolveSavedFittingLoad,
  type SavedFittingLoadDependencies,
  type SavedFittingLoadRepository
} from "./load-core";
import type { SavedFittingLoadCatalog } from "./load-types";
import { resolveSavedFittingOwner } from "./owner-resolution";
import type { SavedFittingReadRow } from "./repository-core";
import type { SavedFittingSnapshotV1 } from "./types";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const fittingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createSnapshot(): SavedFittingSnapshotV1 {
  return {
    cargo: [{ quantity: 100, typeId: 28668 }],
    drones: [{ quantity: 5, typeId: 2456 }],
    hullTypeId: 626,
    slots: {
      high: [
        {
          index: 0,
          module: {
            charge: { quantity: 40, typeId: 23025 },
            typeId: 12346
          }
        },
        { index: 1, module: null }
      ],
      low: [{ index: 0, module: { charge: null, typeId: 2048 } }],
      mid: [{ index: 0, module: null }],
      rig: [{ index: 0, module: null }]
    }
  };
}

function createRow(overrides: Partial<SavedFittingReadRow> = {}): SavedFittingReadRow {
  return {
    createdAt: new Date("2026-08-27T12:00:00.000Z"),
    hullTypeId: 626,
    id: fittingId,
    name: "  Saved Vexor  ",
    revision: 4,
    snapshot: createSnapshot(),
    snapshotVersion: 1,
    updatedAt: new Date("2026-08-27T13:00:00.000Z"),
    ...overrides
  };
}

function createCatalog(): SavedFittingLoadCatalog {
  return {
    cargo: [{ typeId: 28668, typeName: "Nanite Repair Paste" }],
    charges: [{ typeId: 23025, typeName: "Caldari Navy Antimatter Charge M" }],
    drones: [{ typeId: 2456, typeName: "Hobgoblin II" }],
    hulls: [
      {
        droneCapacity: 125,
        highSlots: 2,
        lowSlots: 1,
        midSlots: 1,
        rigSlots: 1,
        typeId: 626,
        typeName: "Vexor"
      }
    ],
    modules: [
      { typeId: 12346, typeName: "200mm Railgun II" },
      { typeId: 2048, typeName: "Damage Control II" }
    ]
  };
}

function createDependencies(options: {
  cargoErrors?: CargoHoldValidationResponse["errors"];
  cargoWarnings?: CargoHoldValidationResponse["warnings"];
  catalog?: SavedFittingLoadCatalog;
  chargeError?: string;
  chargeMaximum?: number;
  droneErrors?: DroneBayValidationResponse["errors"];
  fitErrors?: FitValidationIssue[];
  fitWarnings?: FitValidationIssue[];
  hydrateCalls?: SavedFittingSnapshotV1[];
} = {}): SavedFittingLoadDependencies {
  const catalog = options.catalog ?? createCatalog();

  return {
    async analyzeCargo(input) {
      const errors = options.cargoErrors ?? [];
      const entries = input.cargo.map((entry) => ({
        ...entry,
        typeName: "Nanite Repair Paste",
        volume: 0.01
      }));
      const response: CargoHoldValidationResponse = {
        allowed: errors.length === 0,
        analysis: {
          baseCapacity: 480,
          entries,
          overBaseBy: options.cargoWarnings?.length ? 1 : 0,
          remainingBaseVolume: 479,
          usedVolume: 1
        },
        errors,
        warnings: options.cargoWarnings ?? []
      };
      return response;
    },
    async analyzeFit() {
      const errors = options.fitErrors ?? [];
      const response: FittingAnalysisResponse = {
        allowed: errors.length === 0,
        analysis: {
          calibrationUsed: 0,
          cpuUsed: 42,
          launcherHardpointsUsed: 0,
          powergridUsed: 9,
          turretHardpointsUsed: 1
        },
        errors,
        warnings: options.fitWarnings ?? []
      };
      return response;
    },
    async hydrateStatic(snapshot) {
      options.hydrateCalls?.push(structuredClone(snapshot));
      return structuredClone(catalog);
    },
    async validateCharge() {
      return options.chargeError
        ? { message: options.chargeError, status: "error" }
        : { maximumQuantity: options.chargeMaximum ?? 80, status: "ready" };
    },
    async validateDroneBay(input) {
      const errors = options.droneErrors ?? [];
      const response: DroneBayValidationResponse = {
        allowed: errors.length === 0,
        analysis: {
          capacity: 125,
          entries: input.drones.map((entry) => ({
            ...entry,
            typeName: "Hobgoblin II",
            volume: 5
          })),
          remainingVolume: 100,
          usedVolume: 25
        },
        errors
      };
      return response;
    }
  };
}

function resolveOwner(eveIdentityId: string) {
  return resolveSavedFittingOwner({
    checkpointEveIdentityId: eveIdentityId,
    linkedEveIdentityIds: [],
    officerId: null
  });
}

function createRepository(ownerEveIdentityId: string, row: SavedFittingReadRow) {
  const calls: Array<{ fittingId: string; ownerEveIdentityId: string }> = [];
  const repository: SavedFittingLoadRepository = {
    async findByOwnerAndId(requestedOwner, requestedId) {
      calls.push({ fittingId: requestedId, ownerEveIdentityId: requestedOwner });
      return requestedOwner === ownerEveIdentityId && requestedId === row.id
        ? structuredClone(row)
        : null;
    }
  };
  return { calls, repository };
}

test("own current-version fitting hydrates ready and converts atomically with fresh IDs", async () => {
  const row = createRow();
  const sourceSnapshot = structuredClone(row.snapshot);
  const hydrateCalls: SavedFittingSnapshotV1[] = [];
  const { calls, repository } = createRepository(ownerA, row);
  const result = await loadSavedFittingFromRepository(
    resolveOwner(ownerA),
    fittingId,
    repository,
    createDependencies({ hydrateCalls })
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.ok(result.application);
  assert.equal(result.savedFitting.name, "Saved Vexor");
  assert.equal(result.savedFitting.revision, 4);
  assert.equal(result.editorBaseline?.savedRevision, 4);
  assert.ok(result.editorBaseline?.baselineFingerprint.startsWith("saved-fitting-v1:"));
  assert.deepEqual(result.application.topology, {
    highSlots: 2,
    lowSlots: 1,
    midSlots: 1,
    rigSlots: 1
  });
  assert.deepEqual(result.application.slots.high[0].module?.charge, {
    quantity: 40,
    typeId: 23025
  });
  assert.deepEqual(result.application.drones, [{ quantity: 5, typeId: 2456 }]);
  assert.deepEqual(result.application.cargo, [{ quantity: 100, typeId: 28668 }]);

  let firstId = 0;
  let secondId = 0;
  const firstState = savedFittingApplicationToFitState(
    result.application,
    () => `first-${++firstId}`
  );
  const secondState = savedFittingApplicationToFitState(
    result.application,
    () => `second-${++secondId}`
  );
  assert.ok(firstState && secondState);
  assert.equal(firstState.slots.high[0].module?.instanceId, "first-2");
  assert.equal(secondState.slots.high[0].module?.instanceId, "second-2");
  assert.notEqual(
    firstState.slots.high[0].module?.instanceId,
    secondState.slots.high[0].module?.instanceId
  );
  assert.deepEqual(firstState.slots.high[0].module?.charge, {
    quantity: 40,
    typeId: 23025
  });
  assert.deepEqual(firstState.drones, [{ quantity: 5, typeId: 2456 }]);
  assert.deepEqual(firstState.cargo, [{ quantity: 100, typeId: 28668 }]);
  assert.deepEqual(row.snapshot, sourceSnapshot);
  assert.deepEqual(result.original.snapshot, sourceSnapshot);
  assert.deepEqual(hydrateCalls, [sourceSnapshot]);
  assert.deepEqual(calls, [{ fittingId, ownerEveIdentityId: ownerA }]);
});

test("cross-owner load is unavailable without static hydration", async () => {
  const hydrateCalls: SavedFittingSnapshotV1[] = [];
  const { calls, repository } = createRepository(ownerA, createRow());
  const result = await loadSavedFittingFromRepository(
    resolveOwner(ownerB),
    fittingId,
    repository,
    createDependencies({ hydrateCalls })
  );

  assert.deepEqual(result, { code: "UNAVAILABLE", ok: false });
  assert.deepEqual(calls, [{ fittingId, ownerEveIdentityId: ownerB }]);
  assert.equal(hydrateCalls.length, 0);
});

test("unknown future and malformed snapshots block before static hydration", async () => {
  for (const row of [
    createRow({ snapshotVersion: 2 }),
    createRow({ snapshot: { hullTypeId: 626 } })
  ]) {
    const hydrateCalls: SavedFittingSnapshotV1[] = [];
    const original = structuredClone(row.snapshot);
    const result = await resolveSavedFittingLoad(
      row,
      createDependencies({ hydrateCalls })
    );

    assert.equal(result.status, "blocked");
    assert.equal(result.application, null);
    assert.ok(result.diagnostics.some((entry) => entry.code === "SNAPSHOT_INVALID"));
    assert.deepEqual(result.original.snapshot, original);
    assert.deepEqual(row.snapshot, original);
    assert.equal(hydrateCalls.length, 0);
  }
});

test("missing hull blocks and preserves its typeId, fitting name, and original snapshot", async () => {
  const row = createRow();
  const catalog = createCatalog();
  catalog.hulls = [];
  const result = await resolveSavedFittingLoad(row, createDependencies({ catalog }));
  const diagnostic = result.diagnostics.find((entry) => entry.code === "HULL_NOT_FOUND");

  assert.equal(result.status, "blocked");
  assert.equal(result.application, null);
  assert.equal(result.savedFitting.name, "Saved Vexor");
  assert.equal(diagnostic?.typeId, 626);
  assert.ok(diagnostic?.message.includes("Saved Vexor"));
  assert.deepEqual(result.original.snapshot, createSnapshot());
});

test("missing module, charge, drone, and cargo references remain visible and block", async () => {
  const scenarios = [
    { code: "MODULE_NOT_FOUND", remove: (catalog: SavedFittingLoadCatalog) => { catalog.modules = catalog.modules.filter((entry) => entry.typeId !== 12346); } },
    { code: "CHARGE_NOT_FOUND", remove: (catalog: SavedFittingLoadCatalog) => { catalog.charges = []; } },
    { code: "DRONE_NOT_FOUND", remove: (catalog: SavedFittingLoadCatalog) => { catalog.drones = []; } },
    { code: "CARGO_NOT_FOUND", remove: (catalog: SavedFittingLoadCatalog) => { catalog.cargo = []; } }
  ] as const;

  for (const scenario of scenarios) {
    const catalog = createCatalog();
    scenario.remove(catalog);
    const result = await resolveSavedFittingLoad(
      createRow(),
      createDependencies({ catalog })
    );
    const diagnostic = result.diagnostics.find((entry) => entry.code === scenario.code);

    assert.equal(result.status, "blocked", scenario.code);
    assert.equal(result.application, null, scenario.code);
    assert.ok(diagnostic, scenario.code);
    if (scenario.code === "MODULE_NOT_FOUND") {
      assert.equal(diagnostic.rack, "high");
      assert.equal(diagnostic.index, 0);
      assert.equal(diagnostic.typeId, 12346);
      assert.equal(result.racks.high[0].module?.typeName, null);
    }
    if (scenario.code === "CHARGE_NOT_FOUND") {
      assert.equal(diagnostic.moduleTypeId, 12346);
      assert.equal(diagnostic.quantity, 40);
      assert.equal(result.racks.high[0].module?.charge?.typeName, null);
    }
    if (scenario.code === "DRONE_NOT_FOUND") {
      assert.equal(diagnostic.quantity, 5);
      assert.equal(result.drones[0].typeName, null);
    }
    if (scenario.code === "CARGO_NOT_FOUND") {
      assert.equal(diagnostic.quantity, 100);
      assert.equal(result.cargo[0].typeName, null);
    }
  }
});

test("a hull gaining slots adds trailing empties and returns review", async () => {
  const catalog = createCatalog();
  catalog.hulls[0].highSlots = 3;
  const result = await resolveSavedFittingLoad(
    createRow(),
    createDependencies({ catalog })
  );

  assert.equal(result.status, "review");
  assert.ok(result.application);
  assert.equal(result.application.slots.high.length, 3);
  assert.deepEqual(result.application.slots.high[2], { index: 2, module: null });
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "HULL_SLOT_ADDED" && entry.rack === "high" && entry.index === 2
    )
  );
});

test("a hull losing an empty trailing slot truncates deterministically with review", async () => {
  const catalog = createCatalog();
  catalog.hulls[0].highSlots = 1;
  const result = await resolveSavedFittingLoad(
    createRow(),
    createDependencies({ catalog })
  );

  assert.equal(result.status, "review");
  assert.ok(result.application);
  assert.equal(result.application.slots.high.length, 1);
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "HULL_EMPTY_SLOT_REMOVED" && entry.index === 1
    )
  );
});

test("a hull losing an occupied slot blocks without moving or omitting its module", async () => {
  const snapshot = createSnapshot();
  snapshot.slots.high[1].module = { charge: null, typeId: 12346 };
  const catalog = createCatalog();
  catalog.hulls[0].highSlots = 1;
  const result = await resolveSavedFittingLoad(
    createRow({ snapshot }),
    createDependencies({ catalog })
  );
  const diagnostic = result.diagnostics.find(
    (entry) => entry.code === "HULL_OCCUPIED_SLOT_REMOVED"
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.application, null);
  assert.equal(diagnostic?.rack, "high");
  assert.equal(diagnostic?.index, 1);
  assert.equal(diagnostic?.moduleTypeId, 12346);
  assert.equal(result.racks.high[1].module?.typeId, 12346);
  assert.deepEqual(result.original.snapshot, snapshot);
});

test("stored charge quantity above the current magazine maximum blocks without normalization", async () => {
  const result = await resolveSavedFittingLoad(
    createRow(),
    createDependencies({ chargeMaximum: 20 })
  );
  const diagnostic = result.diagnostics.find(
    (entry) => entry.code === "CHARGE_QUANTITY_DRIFT"
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.application, null);
  assert.equal(diagnostic?.quantity, 40);
  assert.equal(diagnostic?.moduleTypeId, 12346);
  assert.equal(result.racks.high[0].module?.charge?.quantity, 40);
  assert.deepEqual(
    (result.original.snapshot as SavedFittingSnapshotV1).slots.high[0].module?.charge,
    { quantity: 40, typeId: 23025 }
  );
});

test("hard whole-fit validation blocks while soft fitting and cargo warnings remain applicable", async () => {
  const hard = await resolveSavedFittingLoad(
    createRow(),
    createDependencies({
      fitErrors: [{ code: "SHIP_RESTRICTION", message: "Module is restricted." }]
    })
  );
  assert.equal(hard.status, "blocked");
  assert.equal(hard.application, null);
  assert.ok(hard.diagnostics.some((entry) => entry.code === "FIT_VALIDATION"));

  const review = await resolveSavedFittingLoad(
    createRow(),
    createDependencies({
      cargoWarnings: [
        { code: "BASE_CAPACITY_EXCEEDED", message: "Cargo exceeds base capacity." }
      ],
      fitWarnings: [
        { code: "CPU_BASE_OVER", message: "CPU exceeds base output." },
        { code: "POWERGRID_BASE_OVER", message: "Powergrid exceeds base output." },
        { code: "CALIBRATION_OVER", message: "Calibration exceeds base capacity." }
      ]
    })
  );
  assert.equal(review.status, "review");
  assert.ok(review.application);
  assert.equal(
    review.diagnostics.filter((entry) => entry.code === "FIT_WARNING").length,
    3
  );
  assert.ok(review.diagnostics.some((entry) => entry.code === "CARGO_HOLD_WARNING"));
});

test("authoritative charge, Drone Bay, and Cargo hard failures block application", async () => {
  const scenarios = [
    {
      code: "CHARGE_INCOMPATIBLE",
      dependencies: createDependencies({ chargeError: "Charge is no longer compatible." })
    },
    {
      code: "DRONE_BAY_VALIDATION",
      dependencies: createDependencies({
        droneErrors: [
          { code: "BAY_CAPACITY_EXCEEDED", message: "Drone Bay capacity exceeded." }
        ]
      })
    },
    {
      code: "CARGO_HOLD_VALIDATION",
      dependencies: createDependencies({
        cargoErrors: [
          { code: "PACKAGE_STATE_UNSUPPORTED", message: "Package state is ambiguous." }
        ]
      })
    }
  ] as const;

  for (const scenario of scenarios) {
    const result = await resolveSavedFittingLoad(createRow(), scenario.dependencies);
    assert.equal(result.status, "blocked", scenario.code);
    assert.equal(result.application, null, scenario.code);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === scenario.code),
      scenario.code
    );
  }
});
