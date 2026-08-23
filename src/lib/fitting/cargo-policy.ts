import type { CargoValidationIssue } from "@/lib/fitting/types";

export const BLUEPRINT_CATEGORY_ID = 9;
export const ABYSSAL_META_GROUP_ID = 15;

export type CargoStaticRecord = {
  categoryId: number;
  metaGroupId: number | null;
  packagedVolume: number | null;
  typeId: number;
  typeName: string;
  volume: number | null;
};

export function getUnsupportedCargoIssue(
  item: CargoStaticRecord
): CargoValidationIssue | null {
  if (item.categoryId === BLUEPRINT_CATEGORY_ID) {
    return {
      code: "BLUEPRINT_STATE_UNSUPPORTED",
      message: `${item.typeName} requires blueprint original/copy state that CargoEntry cannot represent.`
    };
  }

  if (item.metaGroupId === ABYSSAL_META_GROUP_ID) {
    return {
      code: "MUTATED_STATE_UNSUPPORTED",
      message: `${item.typeName} requires mutated-instance state that CargoEntry cannot represent.`
    };
  }

  if (
    item.volume === null ||
    !Number.isFinite(item.volume) ||
    item.volume <= 0
  ) {
    return {
      code: "CARGO_VOLUME_UNAVAILABLE",
      message: `${item.typeName} has no positive authoritative carried volume.`
    };
  }

  if (
    item.packagedVolume !== null &&
    item.packagedVolume !== item.volume
  ) {
    return {
      code: "PACKAGE_STATE_UNSUPPORTED",
      message: `${item.typeName} has different assembled and packaged volumes; CargoEntry cannot identify which state is carried.`
    };
  }

  return null;
}
