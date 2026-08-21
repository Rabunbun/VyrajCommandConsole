import { FittingRack } from "@prisma/client";

export const MODULE_CATEGORY_ID = 7;
export const CHARGE_CATEGORY_ID = 8;

export const RACK_EFFECTS = {
  11: { name: "loPower", rack: FittingRack.LOW },
  12: { name: "hiPower", rack: FittingRack.HIGH },
  13: { name: "medPower", rack: FittingRack.MID },
  2663: { name: "rigSlot", rack: FittingRack.RIG },
  3772: { name: "subSystem", rack: FittingRack.SUBSYSTEM }
} as const;

export const CHARGE_SIZE_ATTRIBUTE = {
  defaultValue: 0,
  id: 128,
  name: "chargeSize",
  unitId: 117
} as const;

export const CHARGE_GROUP_ATTRIBUTES = [
  { id: 604, name: "chargeGroup1" },
  { id: 605, name: "chargeGroup2" },
  { id: 606, name: "chargeGroup3" },
  { id: 609, name: "chargeGroup4" },
  { id: 610, name: "chargeGroup5" }
] as const;

type DogmaEffectReference = {
  effectID: number;
};

export type ModuleRackClassification =
  | { kind: "ambiguous"; rackEffectIds: number[] }
  | { kind: "fittable"; rack: Exclude<FittingRack, "SUBSYSTEM"> }
  | { kind: "none" }
  | { kind: "subsystem" };

export function classifyModuleRack(
  dogmaEffects: DogmaEffectReference[] | undefined
): ModuleRackClassification {
  const rackEffectIds = (dogmaEffects || [])
    .map((effect) => effect.effectID)
    .filter((effectId) => effectId in RACK_EFFECTS);

  if (!rackEffectIds.length) {
    return { kind: "none" };
  }

  if (rackEffectIds.length > 1) {
    return { kind: "ambiguous", rackEffectIds };
  }

  const rackEffectId = rackEffectIds[0] as keyof typeof RACK_EFFECTS;
  const rack = RACK_EFFECTS[rackEffectId].rack;

  if (rack === FittingRack.SUBSYSTEM) {
    return { kind: "subsystem" };
  }

  return { kind: "fittable", rack };
}
