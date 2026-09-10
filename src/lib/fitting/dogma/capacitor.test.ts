import assert from "node:assert/strict";
import test from "node:test";

import { capacitorAfterRecharge, simulateCapacitor } from "./capacitor";

test("nonlinear recharge follows the closed-form EVE curve and peaks at 25 percent", () => {
  const capacity = 1000;
  const rechargeTimeMs = 100_000;
  const current = 250;
  const elapsedMs = 10;
  const next = capacitorAfterRecharge({ capacity, current, elapsedMs, rechargeTimeMs });
  const instantaneous = (next - current) / (elapsedMs / 1000);

  assert.ok(Math.abs(instantaneous - 25) < 0.02);
});

test("an empty activation schedule is stable at full capacitor", () => {
  const result = simulateCapacitor({
    capacity: 1000,
    drains: [],
    rechargeTimeMs: 100_000
  });

  assert.equal(result.status, "stable");
  assert.equal(result.equilibriumPercentage, 100);
  assert.deepEqual(result.moduleDrains, []);
  assert.equal(result.peakRecharge, 25);
});

test("a supported low drain converges to a positive periodic state", () => {
  const result = simulateCapacitor({
    capacity: 1000,
    drains: [{ amount: 20, cycleDurationMs: 10_000, instanceId: "hardener" }],
    rechargeTimeMs: 100_000
  });

  assert.equal(result.status, "stable");
  assert.ok((result.equilibriumPercentage ?? 0) > 0);
  assert.equal(result.totalNominalDrain, 2);
  assert.deepEqual(result.moduleDrains, [
    { instanceId: "hardener", nominalDrain: 2 }
  ]);
});

test("an excessive drain reports deterministic time to empty from full", () => {
  const result = simulateCapacitor({
    capacity: 100,
    drains: [{ amount: 60, cycleDurationMs: 10_000, instanceId: "repairer" }],
    rechargeTimeMs: 100_000
  });

  assert.equal(result.status, "unstable");
  assert.equal(result.timeToEmptySeconds, 20);
});

test("simultaneous events are aggregated before the empty check", () => {
  const result = simulateCapacitor({
    capacity: 100,
    drains: [
      { amount: 60, cycleDurationMs: 10_000, instanceId: "a" },
      { amount: 50, cycleDurationMs: 20_000, instanceId: "b" }
    ],
    rechargeTimeMs: 100_000
  });

  assert.equal(result.status, "unstable");
  assert.equal(result.timeToEmptySeconds, 0);
});

test("fractional-millisecond cycles are normalized deterministically to microseconds", () => {
  const result = simulateCapacitor({
    capacity: 100,
    drains: [{ amount: 1, cycleDurationMs: 1.5, instanceId: "fractional" }],
    rechargeTimeMs: 100_000
  });

  assert.notEqual(result.status, "unsupported");
});
