import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyFitState, createFittingSlots } from "@/lib/fitting/fit-state";
import { getEftImportConfirmation, isApplicableEftPreview } from "./ui";
import type { EftPreviewResponse } from "./types";

function preview(status: EftPreviewResponse["status"]): EftPreviewResponse {
  return {
    analysis: status === "error" ? null : {
      cargoHold: { baseCapacity: 0, entries: [], overBaseBy: 0, remainingBaseVolume: 0, usedVolume: 0 },
      droneBay: { capacity: 0, entries: [], remainingVolume: 0, usedVolume: 0 },
      fitting: { allowed: true, analysis: { calibrationUsed: 0, cpuUsed: 0, launcherHardpointsUsed: 0, powergridUsed: 0, turretHardpointsUsed: 0 }, errors: [], warnings: [] },
    },
    application: status === "error" ? null : {
      cargo: [],
      drones: [],
      hullTypeId: 626,
      slots: { high: [], low: [], mid: [], rig: [] },
      topology: { highSlots: 0, lowSlots: 0, midSlots: 0, rigSlots: 0 },
    },
    cargo: [],
    diagnostics: [],
    drones: [],
    fitName: "UI",
    hull: { typeId: 626, typeName: "Vexor" },
    racks: { high: [], low: [], mid: [], rig: [] },
    status,
  };
}

test("ready and review previews can apply while error previews cannot", () => {
  assert.equal(isApplicableEftPreview(preview("ready")), true);
  assert.equal(isApplicableEftPreview(preview("review")), true);
  assert.equal(isApplicableEftPreview(preview("error")), false);
});

test("review always requires confirmation and meaningful content adds destructive confirmation", () => {
  const hullOnly = { ...createEmptyFitState(), hullTypeId: 626, slots: createFittingSlots({ highSlots: 1, lowSlots: 0, midSlots: 0, rigSlots: 0 }) };
  assert.equal(getEftImportConfirmation("ready", hullOnly), "none");
  assert.equal(getEftImportConfirmation("review", hullOnly), "review");

  const meaningful = structuredClone(hullOnly);
  meaningful.slots.high[0].module = { charge: null, instanceId: "existing", typeId: 12346 };
  assert.equal(getEftImportConfirmation("ready", meaningful), "replace-current");
  assert.equal(getEftImportConfirmation("review", meaningful), "review-and-replace-current");
});
