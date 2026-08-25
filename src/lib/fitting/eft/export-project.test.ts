import assert from "node:assert/strict";
import test from "node:test";

import { fitStateToEftExportSnapshot } from "./export-snapshot";
import {
  EftExportHydrationError,
  hydrateAndFormatEftExport,
  type EftExportCatalog,
} from "./export-project";
import type { EftExportSnapshot } from "./types";
import type { FitState } from "@/lib/fitting/fit-state";

const snapshot: EftExportSnapshot = {
  cargo: [{ quantity: 100, typeId: 28668 }],
  drones: [{ quantity: 5, typeId: 2456 }],
  fitName: "Hydrated Fit",
  hullTypeId: 626,
  slots: {
    low: [
      { index: 0, module: { chargeTypeId: null, typeId: 2048 } },
      { index: 1, module: null },
    ],
    mid: [{ index: 0, module: null }],
    high: [
      { index: 0, module: { chargeTypeId: 23025, typeId: 12346 } },
      { index: 1, module: null },
    ],
    rig: [{ index: 0, module: { chargeTypeId: null, typeId: 31055 } }],
  },
};

const catalog: EftExportCatalog = {
  cargo: [{ typeId: 28668, typeName: "Nanite Repair Paste" }],
  charges: [{ typeId: 23025, typeName: "Caldari Navy Antimatter Charge M" }],
  drones: [{ typeId: 2456, typeName: "Hobgoblin II" }],
  hulls: [{ highSlots: 2, lowSlots: 2, midSlots: 1, rigSlots: 1, typeId: 626, typeName: "Vexor" }],
  modules: [
    { rack: "low", typeId: 2048, typeName: "Damage Control II" },
    { rack: "high", typeId: 12346, typeName: "200mm Railgun II" },
    { rack: "rig", typeId: 31055, typeName: "Medium Trimark Armor Pump I" },
  ],
};

test("authoritatively hydrates and deterministically formats modules, charges, drones, cargo, and explicit empties", () => {
  const first = hydrateAndFormatEftExport(snapshot, catalog);
  const second = hydrateAndFormatEftExport(structuredClone(snapshot), structuredClone(catalog));
  assert.deepEqual(second, first);
  assert.equal(first.fitName, "Hydrated Fit");
  assert.match(first.eftText, /^\[Vexor, Hydrated Fit\]\nDamage Control II\n\[Empty low slot\]/);
  assert.match(first.eftText, /200mm Railgun II, Caldari Navy Antimatter Charge M/);
  assert.match(first.eftText, /\[Empty high slot\]/);
  assert.match(first.eftText, /Hobgoblin II x5/);
  assert.match(first.eftText, /Nanite Repair Paste x100\n$/);
});

test("uses the authoritative hull name as the deterministic blank fit-name fallback", () => {
  const result = hydrateAndFormatEftExport({ ...snapshot, fitName: "   " }, catalog);
  assert.equal(result.fitName, "Vexor");
  assert.match(result.eftText, /^\[Vexor, Vexor\]/);
});

test("fails cleanly for every missing authoritative static record", () => {
  const scenarios: Array<[string, EftExportCatalog]> = [
    ["hull", { ...catalog, hulls: [] }],
    ["module", { ...catalog, modules: catalog.modules.filter((entry) => entry.typeId !== 2048) }],
    ["charge", { ...catalog, charges: [] }],
    ["drone", { ...catalog, drones: [] }],
    ["cargo", { ...catalog, cargo: [] }],
  ];
  for (const [kind, candidateCatalog] of scenarios) {
    assert.throws(
      () => hydrateAndFormatEftExport(snapshot, candidateCatalog),
      (error: unknown) => error instanceof EftExportHydrationError && error.message.includes(kind),
      kind,
    );
  }
});

test("sanitized client snapshot omits instance IDs and loaded magazine quantities", () => {
  const state: FitState = {
    cargo: [{ quantity: 100, typeId: 28668 }],
    drones: [{ quantity: 5, typeId: 2456 }],
    hullTypeId: 626,
    slots: {
      high: [{ index: 0, module: { charge: { quantity: 80, typeId: 23025 }, instanceId: "secret-instance", typeId: 12346 } }],
      low: [],
      mid: [],
      rig: [],
      subsystem: [],
    },
  };
  const sanitized = fitStateToEftExportSnapshot(state, "Snapshot");
  assert.ok(sanitized);
  assert.deepEqual(sanitized.slots.high[0].module, { chargeTypeId: 23025, typeId: 12346 });
  assert.equal(JSON.stringify(sanitized).includes("secret-instance"), false);
  assert.equal(JSON.stringify(sanitized).includes('"quantity":80'), false);
});
