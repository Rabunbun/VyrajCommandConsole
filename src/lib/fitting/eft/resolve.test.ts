import assert from "node:assert/strict";
import test from "node:test";

import type {
  CargoHoldValidationResponse,
  DroneBayValidationResponse,
  FittingAnalysisResponse,
  FitValidationIssue,
} from "@/lib/fitting/types";
import { parseEft } from "./parser";
import type { EftParsedDocument } from "./types";
import {
  resolveAndValidateEftDraft,
  type EftDraftValidationDependencies,
  type EftResolutionCatalog,
} from "./validate";

// Representative IDs and names are current authoritative fitting-cache records.
const catalog: EftResolutionCatalog = {
  cargo: [
    { categoryId: 20, metaGroupId: null, packagedVolume: 0.01, typeId: 28668, typeName: "Nanite Repair Paste", volume: 0.01 },
    { categoryId: 22, metaGroupId: null, packagedVolume: 12, typeId: 32006, typeName: "Navy Cap Booster 400", volume: 12 },
    { categoryId: 22, metaGroupId: null, packagedVolume: 50, typeId: 33474, typeName: "Mobile Depot", volume: 50 },
    { categoryId: 20, metaGroupId: null, packagedVolume: 1, typeId: 25349, typeName: "Strong Exile Booster", volume: 1 },
    { categoryId: 20, metaGroupId: null, packagedVolume: 1, typeId: 19540, typeName: "High-grade Snake Alpha", volume: 1 },
  ],
  charges: [
    { typeId: 23025, typeName: "Caldari Navy Antimatter Charge M" },
    { typeId: 27361, typeName: "Caldari Navy Scourge Light Missile" },
    { typeId: 30488, typeName: "Sisters Core Scanner Probe" },
    { typeId: 29001, typeName: "Tracking Speed Script" },
    { typeId: 32006, typeName: "Navy Cap Booster 400" },
  ],
  drones: [
    { typeId: 2456, typeName: "Hobgoblin II" },
    { typeId: 2488, typeName: "Warrior II" },
  ],
  hulls: [
    {
      cargoCapacityBase: 480,
      droneCapacity: 125,
      highSlots: 4,
      lowSlots: 5,
      midSlots: 4,
      rigSlots: 3,
      typeId: 626,
      typeName: "Vexor",
    },
    {
      cargoCapacityBase: 150,
      droneCapacity: 0,
      highSlots: 3,
      lowSlots: 3,
      midSlots: 4,
      rigSlots: 3,
      typeId: 603,
      typeName: "Merlin",
    },
    {
      cargoCapacityBase: 400,
      droneCapacity: 0,
      highSlots: 0,
      lowSlots: 0,
      midSlots: 0,
      rigSlots: 3,
      typeId: 29986,
      typeName: "Legion",
    },
  ],
  modules: [
    { rack: "low", typeId: 2048, typeName: "Damage Control II" },
    { rack: "mid", typeId: 1978, typeName: "Tracking Computer II" },
    { rack: "mid", typeId: 2024, typeName: "Medium Capacitor Booster II" },
    { rack: "high", typeId: 12346, typeName: "200mm Railgun II" },
    { rack: "high", typeId: 1877, typeName: "Rapid Light Missile Launcher II" },
    { rack: "high", typeId: 17938, typeName: "Core Probe Launcher I" },
    { rack: "rig", typeId: 31055, typeName: "Medium Trimark Armor Pump I" },
  ],
};

const moduleRackByTypeId = new Map(catalog.modules.map((module) => [module.typeId, module.rack]));
const droneNameByTypeId = new Map(catalog.drones.map((drone) => [drone.typeId, drone.typeName]));
const cargoByTypeId = new Map(catalog.cargo.map((cargo) => [cargo.typeId, cargo]));
const chargeQuantityByPair = new Map([
  ["12346:23025", 80],
  ["1877:27361", 20],
  ["1978:29001", 1],
  ["17938:30488", 8],
  ["2024:32006", 3],
]);

function fixture(lines: string[]): ReturnType<typeof parseEft> {
  return parseEft(`${lines.join("\n")}\n`);
}

function requireDocument(parsed: ReturnType<typeof parseEft>): EftParsedDocument {
  assert.ok(parsed.document);
  return parsed.document;
}

function createDependencies(options?: {
  analyzeCalls?: Array<Parameters<EftDraftValidationDependencies["analyzeFit"]>[0]>;
}): EftDraftValidationDependencies {
  return {
    async analyzeCargo(input) {
      const hull = catalog.hulls.find((candidate) => candidate.typeId === input.hullTypeId);
      assert.ok(hull);
      const entries = input.cargo.map((entry) => {
        const item = cargoByTypeId.get(entry.typeId);
        assert.ok(item?.volume);
        return { ...entry, typeName: item.typeName, volume: item.volume };
      });
      const usedVolume = entries.reduce(
        (total, entry) => total + entry.quantity * entry.volume,
        0,
      );
      const overBaseBy = Math.max(0, usedVolume - (hull.cargoCapacityBase ?? usedVolume));
      const warnings = overBaseBy > 0
        ? [{ code: "BASE_CAPACITY_EXCEEDED" as const, message: "Cargo exceeds base capacity." }]
        : [];
      const response: CargoHoldValidationResponse = {
        allowed: true,
        analysis: {
          baseCapacity: hull.cargoCapacityBase,
          entries,
          overBaseBy,
          remainingBaseVolume: hull.cargoCapacityBase === null ? null : hull.cargoCapacityBase - usedVolume,
          usedVolume,
        },
        errors: [],
        warnings,
      };
      return response;
    },
    async analyzeFit(input) {
      options?.analyzeCalls?.push(structuredClone(input));
      const errors: FitValidationIssue[] = [];
      for (const fitted of input.fittedModules) {
        if (moduleRackByTypeId.get(fitted.typeId) !== fitted.rack) {
          errors.push({
            code: "RACK_MISMATCH",
            message: `Module type ${fitted.typeId} does not fit the ${fitted.rack} rack.`,
          });
        }
      }
      return fittingAnalysis(errors);
    },
    async validateCharge(moduleTypeId, chargeTypeId) {
      const quantity = chargeQuantityByPair.get(`${moduleTypeId}:${chargeTypeId}`);
      return quantity === undefined
        ? { message: "The resolved charge is incompatible with the resolved module.", status: "error" }
        : { quantity, status: "ready" };
    },
    async validateDroneBay(input) {
      const hull = catalog.hulls.find((candidate) => candidate.typeId === input.hullTypeId);
      assert.ok(hull);
      const usedVolume = input.drones.reduce(
        (total, drone) => total + drone.quantity * 5,
        0,
      );
      const errors =
        usedVolume > (hull.droneCapacity ?? 0)
          ? [
              {
                code: "BAY_CAPACITY_EXCEEDED" as const,
                message: `${hull.typeName}'s Drone Bay capacity would be exceeded.`,
              },
            ]
          : [];
      const response: DroneBayValidationResponse = {
        allowed: errors.length === 0,
        analysis: {
          capacity: hull.droneCapacity,
          entries: input.drones.map((drone) => ({
            ...drone,
            typeName: droneNameByTypeId.get(drone.typeId)!,
            volume: 5,
          })),
          remainingVolume:
            hull.droneCapacity === null ? null : hull.droneCapacity - usedVolume,
          usedVolume,
        },
        errors,
      };
      return response;
    },
  };
}

function fittingAnalysis(errors: FitValidationIssue[] = []): FittingAnalysisResponse {
  return {
    allowed: errors.length === 0,
    analysis: {
      calibrationUsed: 0,
      cpuUsed: 0,
      launcherHardpointsUsed: 0,
      powergridUsed: 0,
      turretHardpointsUsed: 0,
    },
    errors,
    warnings: [],
  };
}

test("resolves a complete authoritative fit with turret, missile, script, probe, rig, and drones", async () => {
  const parsed = fixture([
    "[Vexor, Resolver Coverage]",
    "Damage Control II",
    "",
    "Tracking Computer II, Tracking Speed Script",
    "",
    "200mm Railgun II, Caldari Navy Antimatter Charge M",
    "Rapid Light Missile Launcher II, Caldari Navy Scourge Light Missile",
    "Core Probe Launcher I, Sisters Core Scanner Probe",
    "",
    "Medium Trimark Armor Pump I",
    "",
    "",
    "",
    "Hobgoblin II x5",
    "Hobgoblin II x1",
    "Warrior II x2",
  ]);
  const sourceSnapshot = structuredClone(parsed.document);
  const analyzeCalls: Array<Parameters<EftDraftValidationDependencies["analyzeFit"]>[0]> = [];
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies({ analyzeCalls }),
    document: requireDocument(parsed),
    parseDiagnostics: parsed.diagnostics,
  });

  assert.equal(result.status, "ready");
  assert.ok(result.draft);
  assert.equal(result.draft.hullTypeId, 626);
  assert.equal(result.draft.fitName, "Resolver Coverage");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(result.draft.slots).map(([rack, slots]) => [rack, slots.length]),
    ),
    { low: 5, mid: 4, high: 4, rig: 3 },
  );
  assert.deepEqual(result.draft.slots.high.slice(0, 3).map((slot) => slot.module?.charge), [
    { quantity: 80, typeId: 23025 },
    { quantity: 20, typeId: 27361 },
    { quantity: 8, typeId: 30488 },
  ]);
  assert.deepEqual(result.draft.drones, [
    { quantity: 6, typeId: 2456 },
    { quantity: 2, typeId: 2488 },
  ]);
  assert.equal(analyzeCalls.length, 1);
  assert.equal(analyzeCalls[0].fittedModules.length, 6);
  assert.deepEqual(parsed.document, sourceSnapshot);
});

test("uses a unique case-insensitive exact match and reports normalization", async () => {
  const parsed = fixture(["[vexor, Case]", "damage control ii"]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "review");
  assert.ok(result.draft);
  assert.equal(result.diagnostics.filter((entry) => entry.code === "NORMALIZED_NAME").length, 2);
});

test("blocks unknown and ambiguous module names without partial validation", async () => {
  const analyzeCalls: Array<Parameters<EftDraftValidationDependencies["analyzeFit"]>[0]> = [];
  const unknown = fixture(["[Vexor, Unknown]", "Imaginary Damage Control"]);
  const unknownResult = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies({ analyzeCalls }),
    document: requireDocument(unknown),
  });
  assert.equal(unknownResult.status, "error");
  assert.equal(unknownResult.draft, null);
  assert.ok(unknownResult.diagnostics.some((entry) => entry.code === "MODULE_UNRESOLVED"));

  const ambiguous = fixture(["[Vexor, Ambiguous]", "Damage Control II"]);
  const ambiguousResult = await resolveAndValidateEftDraft({
    catalog: {
      ...catalog,
      modules: [
        ...catalog.modules,
        { rack: "low", typeId: 999999, typeName: "Damage Control II" },
      ],
    },
    dependencies: createDependencies({ analyzeCalls }),
    document: requireDocument(ambiguous),
  });
  assert.equal(ambiguousResult.status, "error");
  assert.equal(ambiguousResult.draft, null);
  assert.ok(ambiguousResult.diagnostics.some((entry) => entry.code === "MODULE_AMBIGUOUS"));
  assert.equal(analyzeCalls.length, 0);
});

test("delegates wrong-rack rejection to whole-fit validation", async () => {
  const parsed = fixture([
    "[Vexor, Wrong Rack]",
    "[Empty low slot]",
    "",
    "[Empty med slot]",
    "",
    "Damage Control II",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "error");
  assert.ok(result.draft);
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "FIT_VALIDATION" && entry.message.includes("RACK_MISMATCH"),
    ),
  );
});

test("blocks section overflow before whole-fit validation", async () => {
  const parsed = fixture([
    "[Merlin, Overflow]",
    "Damage Control II",
    "Damage Control II",
    "Damage Control II",
    "Damage Control II",
  ]);
  const analyzeCalls: Array<Parameters<EftDraftValidationDependencies["analyzeFit"]>[0]> = [];
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies({ analyzeCalls }),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "error");
  assert.equal(result.draft, null);
  assert.ok(result.diagnostics.some((entry) => entry.code === "TOO_MANY_SLOTS"));
  assert.equal(analyzeCalls.length, 0);
});

test("rejects unknown and incompatible loaded charges without fitting uncharged", async () => {
  const unknown = fixture([
    "[Vexor, Unknown Charge]",
    "[Empty low slot]",
    "",
    "[Empty med slot]",
    "",
    "200mm Railgun II, Imaginary Charge M",
  ]);
  const unknownResult = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(unknown),
  });
  assert.equal(unknownResult.draft, null);
  assert.ok(unknownResult.diagnostics.some((entry) => entry.code === "CHARGE_UNRESOLVED"));

  const incompatible = fixture([
    "[Vexor, Incompatible Charge]",
    "[Empty low slot]",
    "",
    "[Empty med slot]",
    "",
    "200mm Railgun II, Caldari Navy Scourge Light Missile",
  ]);
  const incompatibleResult = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(incompatible),
  });
  assert.equal(incompatibleResult.draft, null);
  assert.ok(
    incompatibleResult.diagnostics.some((entry) => entry.code === "CHARGE_INCOMPATIBLE"),
  );
});

test("aggregates repeated drones and retains Drone Bay capacity failures", async () => {
  const parsed = fixture([
    "[Merlin, Drone Overflow]",
    "Damage Control II",
    "",
    "[Empty med slot]",
    "",
    "[Empty high slot]",
    "",
    "[Empty rig slot]",
    "",
    "",
    "",
    "Hobgoblin II x1",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "error");
  assert.ok(result.draft);
  assert.ok(result.diagnostics.some((entry) => entry.code === "DRONE_BAY_VALIDATION"));
});

test("does not reinterpret an unresolved fighter name as an ordinary drone", async () => {
  const parsed = fixture([
    "[Vexor, Fighter Unsupported]",
    "Damage Control II",
    "",
    "[Empty med slot]",
    "",
    "[Empty high slot]",
    "",
    "[Empty rig slot]",
    "",
    "",
    "",
    "Templar I x3",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "error");
  assert.equal(result.draft, null);
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "DRONE_UNRESOLVED" && entry.rawText === "Templar I x3",
    ),
  );
});

test("offline content produces review while cargo resolves into the draft", async () => {
  const parsed = fixture([
    "[Vexor, Review]",
    "Damage Control II /offline",
    "",
    "[Empty med slot]",
    "",
    "[Empty high slot]",
    "",
    "[Empty rig slot]",
    "",
    "",
    "",
    "Hobgoblin II x1",
    "",
    "Nanite Repair Paste x100",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
    parseDiagnostics: parsed.diagnostics,
  });

  assert.equal(result.status, "review");
  assert.ok(result.draft);
  assert.ok(result.diagnostics.some((entry) => entry.code === "OFFLINE_UNSUPPORTED"));
  assert.deepEqual(result.draft.cargo, [{ quantity: 100, typeId: 28668 }]);
  assert.equal(result.draft.analysis.cargoHold.usedVolume, 1);
});

test("aggregates cargo separately from loaded charges and preserves a soft base-capacity warning", async () => {
  const parsed = fixture([
    "[Merlin, Cargo]",
    "Damage Control II",
    "",
    "[Empty med slot]",
    "",
    "[Empty high slot]",
    "",
    "[Empty rig slot]",
    "",
    "",
    "",
    "",
    "Navy Cap Booster 400 x10",
    "Navy Cap Booster 400 x5",
    "Mobile Depot x1",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.equal(result.status, "review");
  assert.ok(result.draft);
  assert.deepEqual(result.draft.cargo, [
    { quantity: 15, typeId: 32006 },
    { quantity: 1, typeId: 33474 },
  ]);
  assert.ok(result.diagnostics.some((entry) => entry.code === "CARGO_HOLD_WARNING"));
});

test("keeps loaded and spare charges separate while boosters and implants remain carried cargo", async () => {
  const parsed = fixture([
    "[Vexor, Role Separation]",
    "Damage Control II",
    "",
    "Medium Capacitor Booster II, Navy Cap Booster 400",
    "",
    "[Empty high slot]",
    "",
    "[Empty rig slot]",
    "",
    "",
    "",
    "",
    "Navy Cap Booster 400 x12",
    "Nanite Repair Paste x200",
    "Strong Exile Booster x1",
    "High-grade Snake Alpha x1",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
  });

  assert.ok(result.draft);
  assert.deepEqual(result.draft.slots.mid[0].module?.charge, {
    quantity: 3,
    typeId: 32006,
  });
  assert.deepEqual(result.draft.cargo, [
    { quantity: 1, typeId: 19540 },
    { quantity: 1, typeId: 25349 },
    { quantity: 200, typeId: 28668 },
    { quantity: 12, typeId: 32006 },
  ]);
});

test("rejects unresolved, ambiguous, package-sensitive, Blueprint, Abyssal, and volume-less cargo", async () => {
  const baseCargo = [
    ...catalog.cargo,
    { categoryId: 6, metaGroupId: null, packagedVolume: 33, typeId: 3293, typeName: "Medium Standard Container", volume: 325 },
    { categoryId: 9, metaGroupId: null, packagedVolume: 0.01, typeId: 999001, typeName: "Test Blueprint", volume: 0.01 },
    { categoryId: 20, metaGroupId: 15, packagedVolume: 1, typeId: 999002, typeName: "Mutated Cargo", volume: 1 },
    { categoryId: 20, metaGroupId: null, packagedVolume: null, typeId: 999003, typeName: "Unknown Volume Cargo", volume: null },
  ];
  const scenarios = [
    { code: "CARGO_UNRESOLVED", line: "Imaginary Cargo x1", records: baseCargo },
    { code: "CARGO_AMBIGUOUS", line: "Nanite Repair Paste x1", records: [...baseCargo, { ...catalog.cargo[0], typeId: 999004 }] },
    { code: "CARGO_PACKAGE_STATE_UNSUPPORTED", line: "Medium Standard Container x1", records: baseCargo },
    { code: "CARGO_BLUEPRINT_STATE_UNSUPPORTED", line: "Test Blueprint x1", records: baseCargo },
    { code: "CARGO_MUTATED_STATE_UNSUPPORTED", line: "Mutated Cargo x1", records: baseCargo },
    { code: "CARGO_VOLUME_UNAVAILABLE", line: "Unknown Volume Cargo x1", records: baseCargo },
  ] as const;

  for (const scenario of scenarios) {
    const parsed = fixture([
      "[Vexor, Invalid Cargo]",
      "Damage Control II",
      "",
      "[Empty med slot]",
      "",
      "[Empty high slot]",
      "",
      "[Empty rig slot]",
      "",
      "",
      "",
      "",
      scenario.line,
    ]);
    const result = await resolveAndValidateEftDraft({
      catalog: { ...catalog, cargo: [...scenario.records] },
      dependencies: createDependencies(),
      document: requireDocument(parsed),
    });
    assert.equal(result.draft, null, scenario.code);
    const diagnostic = result.diagnostics.find((entry) => entry.code === scenario.code);
    assert.ok(diagnostic, scenario.code);
    if (scenario.code === "CARGO_AMBIGUOUS") {
      assert.deepEqual(diagnostic.candidateTypeIds, [28668, 999004]);
    }
  }
});

test("Strategic Cruiser subsystem content blocks application", async () => {
  const parsed = fixture([
    "[Legion, Unsupported T3]",
    "",
    "",
    "",
    "",
    "Legion Defensive - Covert Reconfiguration",
  ]);
  const result = await resolveAndValidateEftDraft({
    catalog,
    dependencies: createDependencies(),
    document: requireDocument(parsed),
    parseDiagnostics: parsed.diagnostics,
  });

  assert.equal(result.status, "error");
  assert.ok(result.draft);
  assert.ok(result.diagnostics.some((entry) => entry.code === "SUBSYSTEM_UNSUPPORTED"));
});
