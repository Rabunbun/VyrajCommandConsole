import assert from "node:assert/strict";
import test from "node:test";

import type { FitState } from "@/lib/fitting/fit-state";
import { analyzeSkillRequirements, collectFitSkillSources } from "./analysis";
import {
  createAllVCharacterProfile,
  type CharacterProfile,
  type FittingSkillRequirementEdge,
  type FittingSkillSource
} from "./types";

const skills = [
  { typeId: 3300, typeName: "Gunnery" },
  { typeId: 3318, typeName: "Weapon Upgrades" },
  { typeId: 3436, typeName: "Drones" }
];

function analyze(input: {
  itemSources?: FittingSkillSource[];
  profile?: CharacterProfile;
  requirementEdges?: FittingSkillRequirementEdge[];
}) {
  return analyzeSkillRequirements({
    itemSources: input.itemSources ?? [{ kind: "module", typeId: 100 }],
    profile: input.profile ?? createAllVCharacterProfile(),
    requirementEdges:
      input.requirementEdges ?? [
        {
          ordinal: 1,
          requiredLevel: 4,
          skillTypeId: 3318,
          typeId: 100
        }
      ],
    skillNames: skills,
    staticDataStatus: "available"
  });
}

function explicitProfile(
  skills: Array<{
    activeLevel: 0 | 1 | 2 | 3 | 4 | 5;
    trainedLevel: 0 | 1 | 2 | 3 | 4 | 5;
    typeId: number;
  }>,
  stale = false
): CharacterProfile {
  return {
    boosters: { kind: "none" },
    implants: { kind: "none" },
    skillSource: {
      kind: "custom",
      name: "Test snapshot",
      snapshot: {
        capturedAt: "2026-08-28T00:00:00.000Z",
        complete: true,
        skills,
        stale
      }
    }
  };
}

test("All V satisfies every known valid direct requirement", () => {
  const result = analyze({});

  assert.equal(result.status, "met");
  assert.equal(result.missingCount, 0);
  assert.equal(result.requirements[0].activeLevel, 5);
  assert.equal(result.requirements[0].trainedLevel, 5);
  assert.equal(result.requirements[0].met, true);
});

test("complete explicit snapshots treat absent skills as level zero", () => {
  const result = analyze({ profile: explicitProfile([]) });

  assert.equal(result.status, "missing");
  assert.equal(result.missingCount, 1);
  assert.equal(result.requirements[0].activeLevel, 0);
  assert.equal(result.requirements[0].trainedLevel, 0);
  assert.equal(result.requirements[0].met, false);
});

test("active level determines use even when trained level is higher", () => {
  const result = analyze({
    profile: explicitProfile([
      { activeLevel: 4, trainedLevel: 5, typeId: 3318 }
    ]),
    requirementEdges: [
      {
        ordinal: 1,
        requiredLevel: 5,
        skillTypeId: 3318,
        typeId: 100
      }
    ]
  });

  assert.equal(result.status, "missing");
  assert.equal(result.requirements[0].activeLevel, 4);
  assert.equal(result.requirements[0].trainedLevel, 5);
  assert.equal(result.requirements[0].met, false);
});

test("unavailable profile is distinct from a known level-zero snapshot", () => {
  const result = analyze({
    profile: {
      boosters: { kind: "none" },
      implants: { kind: "none" },
      skillSource: { kind: "unavailable", reason: "No snapshot exists." }
    }
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.missingCount, 0);
  assert.equal(result.requirements[0].activeLevel, null);
  assert.equal(result.requirements[0].trainedLevel, null);
  assert.equal(result.requirements[0].met, null);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "PROFILE_UNAVAILABLE"
    )
  );
});

test("stale snapshots still analyze last-known levels and emit a warning", () => {
  const result = analyze({
    profile: explicitProfile(
      [{ activeLevel: 4, trainedLevel: 4, typeId: 3318 }],
      true
    )
  });

  assert.equal(result.status, "met");
  assert.equal(result.requirements[0].met, true);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "PROFILE_STALE"
    )
  );
});

test("duplicate requirements aggregate to the highest level and retain sources", () => {
  const result = analyze({
    itemSources: [
      { instanceId: "first", kind: "module", typeId: 100 },
      { instanceId: "second", kind: "module", typeId: 101 },
      { instanceId: "third", kind: "module", typeId: 101 }
    ],
    requirementEdges: [
      {
        ordinal: 1,
        requiredLevel: 3,
        skillTypeId: 3318,
        typeId: 100
      },
      {
        ordinal: 2,
        requiredLevel: 4,
        skillTypeId: 3318,
        typeId: 101
      }
    ]
  });

  assert.equal(result.requirements.length, 1);
  assert.equal(result.requirements[0].requiredLevel, 4);
  assert.deepEqual(
    result.requirements[0].contributingSources.map(
      (contribution) => contribution.source.instanceId
    ),
    ["first", "second", "third"]
  );
});

test("drone quantity preserves one source and does not multiply requirements", () => {
  const result = analyze({
    itemSources: [{ kind: "drone", quantity: 5, typeId: 200 }],
    requirementEdges: [
      {
        ordinal: 1,
        requiredLevel: 1,
        skillTypeId: 3436,
        typeId: 200
      }
    ]
  });

  assert.equal(result.requirements[0].contributingSources.length, 1);
  assert.equal(
    result.requirements[0].contributingSources[0].source.quantity,
    5
  );
});

test("FitState collection includes loaded items and drones but excludes cargo", () => {
  const state: FitState = {
    cargo: [{ quantity: 50, typeId: 999 }],
    drones: [{ quantity: 5, typeId: 200 }],
    hullTypeId: 10,
    slots: {
      high: [
        {
          index: 0,
          module: {
            charge: { quantity: 80, typeId: 300 },
            instanceId: "module-1",
            typeId: 100
          }
        }
      ],
      low: [],
      mid: [],
      rig: [
        {
          index: 0,
          module: { charge: null, instanceId: "rig-1", typeId: 400 }
        }
      ],
      subsystem: []
    }
  };
  const before = structuredClone(state);
  const sources = collectFitSkillSources(state);

  assert.deepEqual(
    sources.map((source) => [source.kind, source.typeId]),
    [
      ["hull", 10],
      ["module", 100],
      ["charge", 300],
      ["rig", 400],
      ["drone", 200]
    ]
  );
  assert.ok(!sources.some((source) => source.typeId === 999));
  assert.deepEqual(state, before);
});

test("unknown static skill references remain unavailable under All V", () => {
  const result = analyzeSkillRequirements({
    itemSources: [{ kind: "hull", typeId: 10 }],
    profile: createAllVCharacterProfile(),
    requirementEdges: [
      {
        ordinal: 1,
        requiredLevel: 1,
        skillTypeId: 999_999,
        typeId: 10
      }
    ],
    skillNames: skills,
    staticDataStatus: "available"
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.requirements[0].activeLevel, null);
  assert.equal(result.requirements[0].met, null);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "STATIC_SKILL_REFERENCE_UNKNOWN"
    )
  );
});
