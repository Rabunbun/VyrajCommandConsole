import type { FitState } from "@/lib/fitting/fit-state";
import {
  EFT_SUPPORTED_RACKS,
  type EftExportSnapshot,
} from "./types";

export function fitStateToEftExportSnapshot(
  state: FitState,
  fitName: string,
): EftExportSnapshot | null {
  if (state.hullTypeId === null) {
    return null;
  }

  return {
    cargo: state.cargo.map((entry) => ({ ...entry })),
    drones: state.drones.map((entry) => ({ ...entry })),
    fitName,
    hullTypeId: state.hullTypeId,
    slots: Object.fromEntries(
      EFT_SUPPORTED_RACKS.map((rack) => [
        rack,
        state.slots[rack].map((slot) => ({
          index: slot.index,
          module: slot.module
            ? {
                chargeTypeId: slot.module.charge?.typeId ?? null,
                typeId: slot.module.typeId,
              }
            : null,
        })),
      ]),
    ) as EftExportSnapshot["slots"],
  };
}
