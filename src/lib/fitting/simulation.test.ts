import assert from "node:assert/strict";
import test from "node:test";

import type { CharacterSkillSnapshotSafeResult } from "@/lib/eve-sso/private/skills/types";
import { fittingReducer } from "./fit-reducer";
import type { FitState } from "./fit-state";
import {
  collectSimulationSkillSources,
  createInitialFittingSimulationState,
  createSimulationAnalysisKey,
  formatSkillLevel,
  getSimulationWarningSummary,
  initializeFittingSimulationState,
  requirementDisplayRows,
  selectFittingSimulationProfile
} from "./simulation";
import { analyzeSkillRequirements } from "./skills/analysis";
import { parseFittingSkillSources } from "./skills/request";
import { establishSavedFittingEditor, evaluateSavedFittingEditor } from "./saved/editor";
import { fitStateToSavedFittingSnapshotV1 } from "./saved/snapshot";

const linkedSnapshot: CharacterSkillSnapshotSafeResult = {
  characterId: "90000001",
  characterName: "Jason Roderick",
  checkedAt: "2026-08-30T12:05:00.000Z",
  diagnostics: [],
  eveIdentityId: "identity-1",
  fetchedAt: "2026-08-30T12:00:00.000Z",
  lastErrorAt: null,
  lastErrorCode: null,
  refreshAfter: "2026-08-30T12:10:00.000Z",
  snapshot: {
    complete: true,
    skills: [
      {
        activeLevel: 4,
        skillpoints: 1_280_000,
        skillTypeId: 3300,
        trainedLevel: 5
      }
    ],
    stale: false
  },
  source: "esi",
  status: "available"
};

function createFitState(): FitState {
  return {
    cargo: [{ quantity: 100, typeId: 34 }],
    drones: [{ quantity: 5, typeId: 2456 }],
    hullTypeId: 626,
    slots: {
      high: [
        {
          index: 0,
          module: {
            charge: { quantity: 80, typeId: 23025 },
            instanceId: "high-0",
            typeId: 12346
          }
        },
        {
          index: 1,
          module: {
            charge: null,
            instanceId: "high-1",
            typeId: 12346
          }
        }
      ],
      low: [],
      mid: [],
      rig: [],
      subsystem: []
    }
  };
}

test("usable linked data becomes the default and profile switching is reversible", () => {
  const initialized = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot }
  );

  assert.equal(initialized.mode, "linked-character");
  assert.equal(initialized.profile.skillSource.kind, "linked-character");

  const allV = selectFittingSimulationProfile(initialized, "all-v");
  assert.equal(allV.mode, "all-v");
  assert.equal(allV.profile.skillSource.kind, "all-v");

  const linkedAgain = selectFittingSimulationProfile(allV, "linked-character");
  assert.equal(linkedAgain.profile.skillSource.kind, "linked-character");
  assert.equal(
    linkedAgain.profile.skillSource.kind === "linked-character"
      ? linkedAgain.profile.skillSource.characterId
      : null,
    linkedSnapshot.characterId
  );
});

test("no complete snapshot defaults to All V and linked mode stays unavailable", () => {
  const unavailableSnapshot = { ...linkedSnapshot, snapshot: null, status: "unavailable" as const };
  const initialized = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot: unavailableSnapshot }
  );

  assert.equal(initialized.mode, "all-v");
  const linked = selectFittingSimulationProfile(initialized, "linked-character");
  assert.equal(linked.profile.skillSource.kind, "unavailable");
  assert.deepEqual(getSimulationWarningSummary(linked), {
    label: "Character Data Not Connected",
    tone: "unavailable"
  });
});

test("profile switching neither mutates FitState nor changes saved-fit dirty state", () => {
  const fitState = createFitState();
  const before = structuredClone(fitState);
  const snapshot = fitStateToSavedFittingSnapshotV1(fitState);
  assert.equal(snapshot.ok, true);
  const editor = establishSavedFittingEditor({
    id: "00000000-0000-4000-8000-000000000010",
    name: "Simulation Test",
    revision: 1,
    snapshot: snapshot.value
  });
  const initialized = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot }
  );

  selectFittingSimulationProfile(initialized, "all-v");
  selectFittingSimulationProfile(initialized, "linked-character");

  assert.deepEqual(fitState, before);
  assert.equal(evaluateSavedFittingEditor(editor, fitState).dirty, false);
});

test("the atomic replacement path used by EFT and saved loads preserves simulation state", () => {
  const currentFit = createFitState();
  const replacement = createFitState();
  replacement.hullTypeId = 603;
  replacement.slots.high = [];
  const simulation = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot }
  );
  const before = structuredClone(simulation);

  const replacedFit = fittingReducer(currentFit, {
    nextState: replacement,
    type: "replace-fit"
  });

  assert.equal(replacedFit.hullTypeId, 603);
  assert.deepEqual(simulation, before);
  assert.equal(simulation.mode, "linked-character");
  assert.notEqual(
    analysisKey(replacedFit, simulation.mode),
    analysisKey(currentFit, simulation.mode)
  );
});

test("analysis keys react to fitting content and profile changes but ignore cargo", () => {
  const fitState = createFitState();
  const key = analysisKey(fitState, "all-v");
  const cargoOnly = structuredClone(fitState);
  cargoOnly.cargo[0].quantity += 1;
  assert.equal(analysisKey(cargoOnly, "all-v"), key);

  const moduleChanged = structuredClone(fitState);
  moduleChanged.slots.high[1].module!.typeId += 1;
  assert.notEqual(analysisKey(moduleChanged, "all-v"), key);

  const chargeChanged = structuredClone(fitState);
  chargeChanged.slots.high[0].module!.charge!.typeId += 1;
  assert.notEqual(analysisKey(chargeChanged, "all-v"), key);

  const droneChanged = structuredClone(fitState);
  droneChanged.drones[0].typeId += 1;
  assert.notEqual(analysisKey(droneChanged, "all-v"), key);
  assert.notEqual(analysisKey(fitState, "linked-character"), key);
});

test("collected sources preserve duplicate fitted modules but aggregate drone quantity once", () => {
  const sources = collectSimulationSkillSources(createFitState());
  const moduleSources = sources.filter((source) => source.kind === "module");
  const droneSources = sources.filter((source) => source.kind === "drone");

  assert.deepEqual(moduleSources.map((source) => source.instanceId), ["high-0", "high-1"]);
  assert.equal(droneSources.length, 1);
  assert.equal(droneSources[0].quantity, 5);
  assert.ok(!sources.some((source) => source.typeId === 34));
});

test("warning summaries distinguish missing, met, unavailable, and stale profiles", () => {
  const initialized = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot }
  );
  const missingAnalysis = analyzeSkillRequirements({
    itemSources: [{ kind: "module", typeId: 12346 }],
    profile: initialized.profile,
    requirementEdges: [
      { ordinal: 1, requiredLevel: 5, skillTypeId: 3300, typeId: 12346 }
    ],
    skillNames: [{ typeId: 3300, typeName: "Gunnery" }],
    staticDataStatus: "available"
  });
  const missingState = { ...initialized, analysis: missingAnalysis };

  assert.deepEqual(getSimulationWarningSummary(missingState), {
    label: "1 Skill Missing",
    tone: "warning"
  });
  assert.deepEqual(requirementDisplayRows(missingAnalysis).map((row) => ({
    active: formatSkillLevel(row.activeLevel),
    required: formatSkillLevel(row.requiredLevel),
    trained: formatSkillLevel(row.trainedLevel)
  })), [{ active: "IV", required: "V", trained: "V" }]);

  const allVState = selectFittingSimulationProfile(initialized, "all-v");
  const metAnalysis = analyzeSkillRequirements({
    itemSources: [{ kind: "module", typeId: 12346 }],
    profile: allVState.profile,
    requirementEdges: [
      { ordinal: 1, requiredLevel: 5, skillTypeId: 3300, typeId: 12346 }
    ],
    skillNames: [{ typeId: 3300, typeName: "Gunnery" }],
    staticDataStatus: "available"
  });
  assert.deepEqual(getSimulationWarningSummary({ ...allVState, analysis: metAnalysis }), {
    label: "All Requirements Met",
    tone: "success"
  });

  const staleSnapshot = {
    ...linkedSnapshot,
    snapshot: { ...linkedSnapshot.snapshot!, stale: true },
    status: "stale" as const
  };
  const staleState = initializeFittingSimulationState(
    createInitialFittingSimulationState(),
    { connection: null, linkedSnapshot: staleSnapshot }
  );
  assert.deepEqual(getSimulationWarningSummary({ ...staleState, analysis: metAnalysis }), {
    label: "Skills Stale",
    tone: "warning"
  });
});

test("skill-source request parsing accepts bounded fitting data and rejects cargo or malformed values", () => {
  const valid = collectSimulationSkillSources(createFitState());
  assert.deepEqual(parseFittingSkillSources(valid), valid);
  assert.equal(parseFittingSkillSources([{ kind: "cargo", typeId: 34 }]), null);
  assert.equal(parseFittingSkillSources([{ kind: "module", slotIndex: -1, typeId: 1 }]), null);
  assert.equal(
    parseFittingSkillSources(Array.from({ length: 129 }, () => ({ kind: "module", typeId: 1 }))),
    null
  );
});

function analysisKey(fitState: FitState, mode: "all-v" | "linked-character") {
  return createSimulationAnalysisKey({
    itemSources: collectSimulationSkillSources(fitState),
    linkedSnapshot,
    mode
  });
}
