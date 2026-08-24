import assert from "node:assert/strict";
import test from "node:test";

import { projectEftPreview, projectEmptyEftPreview } from "./preview-project";
import type { ResolvedEftDraft } from "./types";

const draft: ResolvedEftDraft = {
  analysis: {
    cargoHold: {
      baseCapacity: 100,
      entries: [{ quantity: 2, typeId: 28668, typeName: "Nanite Repair Paste", volume: 0.01 }],
      overBaseBy: 0,
      remainingBaseVolume: 99.98,
      usedVolume: 0.02,
    },
    droneBay: {
      capacity: 25,
      entries: [{ quantity: 1, typeId: 2456, typeName: "Hobgoblin II", volume: 5 }],
      remainingVolume: 20,
      usedVolume: 5,
    },
    fitting: {
      allowed: true,
      analysis: {
        calibrationUsed: 0,
        cpuUsed: 8,
        launcherHardpointsUsed: 0,
        powergridUsed: 1,
        turretHardpointsUsed: 1,
      },
      errors: [],
      warnings: [{ code: "CPU_BASE_OVER", message: "CPU usage exceeds the base output." }],
    },
  },
  cargo: [{ quantity: 2, typeId: 28668 }],
  diagnostics: [
    {
      code: "FIT_WARNING",
      lineNumber: null,
      message: "CPU_BASE_OVER: CPU usage exceeds the base output.",
      rawText: null,
      severity: "warning",
    },
  ],
  drones: [{ quantity: 1, typeId: 2456 }],
  fitName: "Preview",
  hullTypeId: 626,
  slots: {
    high: [{ index: 0, module: { charge: { quantity: 80, typeId: 23025 }, typeId: 12346 }, rack: "high" }],
    low: [],
    mid: [],
    rig: [],
  },
  status: "review",
};

const names = {
  cargo: new Map([[28668, "Nanite Repair Paste"]]),
  charges: new Map([[23025, "Caldari Navy Antimatter Charge M"]]),
  drones: new Map([[2456, "Hobgoblin II"]]),
  hull: "Vexor",
  modules: new Map([[12346, "200mm Railgun II"]]),
};

test("projects canonical names, analysis, charges, drones, cargo, and an applicable review payload", () => {
  const preview = projectEftPreview(draft, names);
  assert.equal(preview.status, "review");
  assert.equal(preview.hull?.typeName, "Vexor");
  assert.equal(preview.racks.high[0].module?.typeName, "200mm Railgun II");
  assert.equal(preview.racks.high[0].module?.charge?.typeName, "Caldari Navy Antimatter Charge M");
  assert.deepEqual(preview.drones, [{ quantity: 1, typeId: 2456, typeName: "Hobgoblin II" }]);
  assert.deepEqual(preview.cargo, [{ quantity: 2, typeId: 28668, typeName: "Nanite Repair Paste" }]);
  assert.equal(preview.analysis?.fitting.analysis.cpuUsed, 8);
  assert.equal(preview.diagnostics[0].disposition, "warning");
  assert.ok(preview.application);
});

test("blocks application when canonical preview hydration is incomplete", () => {
  const preview = projectEftPreview(draft, { ...names, modules: new Map() });
  assert.equal(preview.status, "error");
  assert.equal(preview.application, null);
  assert.ok(preview.diagnostics.some((entry) => entry.disposition === "blocking"));
});

test("preserves blocking diagnostics when no resolved draft exists", () => {
  const preview = projectEmptyEftPreview({
    diagnostics: [{ code: "MODULE_UNRESOLVED", lineNumber: 2, message: "Unknown module.", rawText: "Unknown", severity: "error" }],
    fitName: "Broken",
    status: "error",
  });
  assert.equal(preview.status, "error");
  assert.equal(preview.application, null);
  assert.equal(preview.diagnostics[0].disposition, "blocking");
});
