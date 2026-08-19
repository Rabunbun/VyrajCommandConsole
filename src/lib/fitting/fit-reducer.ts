import {
  createEmptyFitState,
  createFittingSlots,
  type FittedModule,
  type FittingTopology,
  type FitState,
  type RackType
} from "@/lib/fitting/fit-state";

export type FitModuleInput = {
  index: number;
  module: FittedModule;
  moduleRack: RackType;
  rack: RackType;
};

export type FitModuleRejection =
  | "invalid-module"
  | "missing-hull"
  | "missing-rack"
  | "missing-slot"
  | "occupied-slot"
  | "rack-mismatch";

export type FitAction =
  | {
      hullTypeId: number;
      topology: FittingTopology;
      type: "select-hull";
    }
  | {
      type: "clear-hull";
    }
  | (FitModuleInput & {
      type: "fit-module";
    });

export function validateFitModulePlacement(
  state: FitState,
  input: FitModuleInput
): FitModuleRejection | null {
  if (state.hullTypeId === null) {
    return "missing-hull";
  }

  if (!Object.prototype.hasOwnProperty.call(state.slots, input.rack)) {
    return "missing-rack";
  }

  const rackSlots = state.slots[input.rack];
  const targetSlot = rackSlots?.find((slot) => slot.index === input.index);

  if (!targetSlot) {
    return "missing-slot";
  }

  if (targetSlot.module) {
    return "occupied-slot";
  }

  if (!isValidFittedModule(input.module)) {
    return "invalid-module";
  }

  if (input.moduleRack !== input.rack) {
    return "rack-mismatch";
  }

  return null;
}

export function fitModuleIntoSlot(
  state: FitState,
  input: FitModuleInput
): FitState {
  // Structural state safety only. The caller must first resolve the module
  // against the authoritative static cache; full EVE fitting rules come later.
  if (validateFitModulePlacement(state, input)) {
    return state;
  }

  const rackSlots = state.slots[input.rack];

  return {
    ...state,
    slots: {
      ...state.slots,
      [input.rack]: rackSlots.map((slot) =>
        slot.index === input.index
          ? {
              ...slot,
              module: { ...input.module }
            }
          : slot
      )
    }
  };
}

export function fittingReducer(state: FitState, action: FitAction): FitState {
  switch (action.type) {
    case "select-hull":
      return {
        hullTypeId: action.hullTypeId,
        slots: createFittingSlots(action.topology)
      };
    case "clear-hull":
      return createEmptyFitState();
    case "fit-module":
      return fitModuleIntoSlot(state, action);
    default:
      return state;
  }
}

function isValidFittedModule(module: FittedModule) {
  return (
    typeof module.instanceId === "string" &&
    Boolean(module.instanceId.trim()) &&
    Number.isInteger(module.typeId) &&
    module.typeId > 0
  );
}
