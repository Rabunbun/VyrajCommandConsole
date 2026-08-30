import type { FittingSkillSource } from "./types";

const allowedKinds = new Set<FittingSkillSource["kind"]>([
  "charge",
  "drone",
  "hull",
  "module",
  "rig"
]);
const allowedRacks = new Set(["high", "mid", "low", "rig", "subsystem"]);
const maximumSources = 128;

export function parseFittingSkillSources(value: unknown): FittingSkillSource[] | null {
  if (!Array.isArray(value) || value.length > maximumSources) {
    return null;
  }

  const sources: FittingSkillSource[] = [];

  for (const item of value) {
    if (!isObject(item) || !allowedKinds.has(item.kind as FittingSkillSource["kind"])) {
      return null;
    }

    if (!isPositiveSafeInteger(item.typeId)) {
      return null;
    }

    const source: FittingSkillSource = {
      kind: item.kind as FittingSkillSource["kind"],
      typeId: item.typeId
    };

    if (item.instanceId !== undefined) {
      if (
        typeof item.instanceId !== "string" ||
        !item.instanceId.trim() ||
        item.instanceId.length > 120
      ) {
        return null;
      }
      source.instanceId = item.instanceId;
    }

    if (item.moduleTypeId !== undefined) {
      if (!isPositiveSafeInteger(item.moduleTypeId)) {
        return null;
      }
      source.moduleTypeId = item.moduleTypeId;
    }

    if (item.quantity !== undefined) {
      if (!isPositiveSafeInteger(item.quantity)) {
        return null;
      }
      source.quantity = item.quantity;
    }

    if (item.rack !== undefined) {
      if (typeof item.rack !== "string" || !allowedRacks.has(item.rack)) {
        return null;
      }
      source.rack = item.rack as FittingSkillSource["rack"];
    }

    if (item.slotIndex !== undefined) {
      if (
        !Number.isSafeInteger(item.slotIndex) ||
        (item.slotIndex as number) < 0 ||
        (item.slotIndex as number) > 63
      ) {
        return null;
      }
      source.slotIndex = item.slotIndex as number;
    }

    sources.push(source);
  }

  return sources;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

