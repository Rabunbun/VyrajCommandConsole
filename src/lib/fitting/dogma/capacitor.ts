import type { EngineDiagnostic } from "./types";

export const CAPACITOR_ATTRIBUTE_IDS = {
  capacity: 482,
  rechargeTime: 55
} as const;

export type CapacitorSchedule = Readonly<{
  cycleDurationMs: number;
  instanceId: string;
  amount: number;
}>;

export type CapacitorSimulationResult = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  equilibriumPercentage: number | null;
  moduleDrains: readonly Readonly<{
    instanceId: string;
    nominalDrain: number;
  }>[];
  peakRecharge: number;
  status: "stable" | "unstable" | "unsupported";
  timeToEmptySeconds: number | null;
  totalNominalDrain: number;
}>;

const MICROSECONDS_PER_MILLISECOND = 1000;
const MAX_PERIOD_US = 86_400_000 * MICROSECONDS_PER_MILLISECOND;
const MAX_EVENTS_PER_PERIOD = 100_000;
const MAX_PERIOD_ITERATIONS = 10_000;
const CONVERGENCE_EPSILON = 1e-9;

/**
 * A fit is stable when its repeating, deterministically ordered activation
 * schedule converges to a non-decreasing periodic capacitor state above zero.
 * Recharge between events uses EVE's nonlinear recharge curve exactly.
 */
export function simulateCapacitor(input: {
  capacity: number;
  rechargeTimeMs: number;
  drains: readonly CapacitorSchedule[];
  injections?: readonly CapacitorSchedule[];
}): CapacitorSimulationResult {
  const diagnostics: EngineDiagnostic[] = [];
  const schedules = [
    ...input.drains.map((schedule) => ({ ...schedule, direction: -1 as const })),
    ...(input.injections ?? []).map((schedule) => ({
      ...schedule,
      direction: 1 as const
    }))
  ];

  if (
    !Number.isFinite(input.capacity) ||
    input.capacity <= 0 ||
    !Number.isFinite(input.rechargeTimeMs) ||
    input.rechargeTimeMs <= 0 ||
    schedules.some(
      (schedule) =>
        !Number.isFinite(schedule.amount) ||
        schedule.amount < 0 ||
        !Number.isFinite(schedule.cycleDurationMs) ||
        schedule.cycleDurationMs <= 0 ||
        !Number.isSafeInteger(
          Math.round(schedule.cycleDurationMs * MICROSECONDS_PER_MILLISECOND)
        )
    )
  ) {
    return unsupported("Capacitor simulation inputs are invalid.");
  }

  const totalNominalDrain = input.drains.reduce(
    (total, schedule) => total + schedule.amount / (schedule.cycleDurationMs / 1000),
    0
  );
  const moduleDrains = input.drains.map((schedule) => ({
    instanceId: schedule.instanceId,
    nominalDrain: schedule.amount / (schedule.cycleDurationMs / 1000)
  }));
  const peakRecharge = 2.5 * input.capacity / (input.rechargeTimeMs / 1000);
  if (!schedules.length || schedules.every((schedule) => schedule.amount === 0)) {
    return {
      diagnostics,
      equilibriumPercentage: 100,
      moduleDrains,
      peakRecharge,
      status: "stable",
      timeToEmptySeconds: null,
      totalNominalDrain
    };
  }

  const normalizedSchedules = schedules.map((schedule) => ({
    ...schedule,
    cycleDurationUs: Math.round(
      schedule.cycleDurationMs * MICROSECONDS_PER_MILLISECOND
    )
  }));
  let periodUs = 1;
  for (const schedule of normalizedSchedules) {
    periodUs = leastCommonMultiple(periodUs, schedule.cycleDurationUs);
    if (!Number.isSafeInteger(periodUs) || periodUs > MAX_PERIOD_US) {
      return unsupported(
        "The combined activation schedule exceeds the supported one-day exact repeat period.",
        moduleDrains
      );
    }
  }

  const eventByTime = new Map<number, number>();
  for (const schedule of normalizedSchedules) {
    for (let time = 0; time < periodUs; time += schedule.cycleDurationUs) {
      eventByTime.set(
        time,
        (eventByTime.get(time) ?? 0) + schedule.direction * schedule.amount
      );
      if (eventByTime.size > MAX_EVENTS_PER_PERIOD) {
        return unsupported(
          "The exact repeating capacitor schedule is too large to evaluate safely.",
          moduleDrains
        );
      }
    }
  }
  const events = [...eventByTime.entries()].toSorted((left, right) => left[0] - right[0]);
  let capacitor = input.capacity;
  let elapsedMs = 0;

  for (let iteration = 0; iteration < MAX_PERIOD_ITERATIONS; iteration += 1) {
    const start = capacitor;
    let previousTimeUs = 0;
    let minimum = capacitor;

    for (const [timeUs, delta] of events) {
      capacitor = recharge(
        capacitor,
        input.capacity,
        input.rechargeTimeMs,
        (timeUs - previousTimeUs) / MICROSECONDS_PER_MILLISECOND
      );
      capacitor = Math.min(input.capacity, capacitor + delta);
      minimum = Math.min(minimum, capacitor);
      if (capacitor <= 0) {
        return {
          diagnostics,
          equilibriumPercentage: null,
          moduleDrains,
          peakRecharge,
          status: "unstable",
          timeToEmptySeconds:
            (elapsedMs + timeUs / MICROSECONDS_PER_MILLISECOND) / 1000,
          totalNominalDrain
        };
      }
      previousTimeUs = timeUs;
    }

    capacitor = recharge(
      capacitor,
      input.capacity,
      input.rechargeTimeMs,
      (periodUs - previousTimeUs) / MICROSECONDS_PER_MILLISECOND
    );
    elapsedMs += periodUs / MICROSECONDS_PER_MILLISECOND;
    const tolerance = CONVERGENCE_EPSILON * Math.max(1, input.capacity);
    if (capacitor >= start - tolerance) {
      return {
        diagnostics,
        equilibriumPercentage: 100 * Math.max(0, minimum) / input.capacity,
        moduleDrains,
        peakRecharge,
        status: "stable",
        timeToEmptySeconds: null,
        totalNominalDrain
      };
    }
  }

  return unsupported(
    "The repeating capacitor schedule did not converge within the deterministic limit.",
    moduleDrains
  );

  function unsupported(
    message: string,
    knownModuleDrains: CapacitorSimulationResult["moduleDrains"] = []
  ): CapacitorSimulationResult {
    return {
      diagnostics: [{
        code: "capacitor-simulation-unsupported",
        message,
        severity: "unsupported"
      }],
      equilibriumPercentage: null,
      moduleDrains: knownModuleDrains,
      peakRecharge:
        input.capacity > 0 && input.rechargeTimeMs > 0
          ? 2.5 * input.capacity / (input.rechargeTimeMs / 1000)
          : 0,
      status: "unsupported",
      timeToEmptySeconds: null,
      totalNominalDrain: 0
    };
  }
}

export function capacitorAfterRecharge(input: {
  capacity: number;
  current: number;
  elapsedMs: number;
  rechargeTimeMs: number;
}) {
  return recharge(input.current, input.capacity, input.rechargeTimeMs, input.elapsedMs);
}

function recharge(current: number, capacity: number, rechargeTimeMs: number, elapsedMs: number) {
  if (elapsedMs <= 0 || current >= capacity) return Math.min(capacity, current);
  const normalized = Math.max(0, current) / capacity;
  const root = 1 - (1 - Math.sqrt(normalized)) * Math.exp(-5 * elapsedMs / rechargeTimeMs);
  return capacity * root * root;
}

function leastCommonMultiple(left: number, right: number) {
  return Math.abs(left / greatestCommonDivisor(left, right) * right);
}

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
