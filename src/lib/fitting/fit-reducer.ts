import {
  createEmptyFitState,
  createFittingSlots,
  type FittedModule,
  type FittingSlotAddress,
  type FittingTopology,
  type FitState,
  type LoadedCharge,
  type RackType
} from "@/lib/fitting/fit-state";

export type FitModuleInput = {
  index: number;
  module: FittedModule;
  moduleRack: RackType;
  rack: RackType;
};

export type FitModuleRejection =
  | "empty-slot"
  | "invalid-charge"
  | "invalid-module"
  | "missing-hull"
  | "missing-rack"
  | "missing-slot"
  | "occupied-slot"
  | "rack-mismatch"
  | "same-slot";

export type RemoveModuleInput = FittingSlotAddress;

export type ReplaceModuleInput = FitModuleInput;

export type MoveModuleInput = {
  from: FittingSlotAddress;
  to: FittingSlotAddress;
};

export type LoadChargeInput = FittingSlotAddress & {
  charge: LoadedCharge;
};

export type UnloadChargeInput = FittingSlotAddress;

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
    })
  | (RemoveModuleInput & {
      type: "remove-module";
    })
  | (ReplaceModuleInput & {
      type: "replace-module";
    })
  | (MoveModuleInput & {
      type: "move-module";
    })
  | (LoadChargeInput & {
      type: "load-charge";
    })
  | (UnloadChargeInput & {
      type: "unload-charge";
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

export function validateRemoveModule(
  state: FitState,
  input: RemoveModuleInput
): FitModuleRejection | null {
  const targetSlot = resolveSlot(state, input);

  if (typeof targetSlot === "string") {
    return targetSlot;
  }

  return targetSlot.module ? null : "empty-slot";
}

export function removeModule(
  state: FitState,
  input: RemoveModuleInput
): FitState {
  if (validateRemoveModule(state, input)) {
    return state;
  }

  return updateRack(state, input.rack, (slot) =>
    slot.index === input.index ? { ...slot, module: null } : slot
  );
}

export function validateReplaceModule(
  state: FitState,
  input: ReplaceModuleInput
): FitModuleRejection | null {
  const targetSlot = resolveSlot(state, input);

  if (typeof targetSlot === "string") {
    return targetSlot;
  }

  if (!targetSlot.module) {
    return "empty-slot";
  }

  if (!isValidFittedModule(input.module)) {
    return "invalid-module";
  }

  return input.moduleRack === input.rack ? null : "rack-mismatch";
}

export function replaceModule(
  state: FitState,
  input: ReplaceModuleInput
): FitState {
  if (validateReplaceModule(state, input)) {
    return state;
  }

  return updateRack(state, input.rack, (slot) =>
    slot.index === input.index
      ? { ...slot, module: { ...input.module } }
      : slot
  );
}

export function validateMoveModule(
  state: FitState,
  input: MoveModuleInput
): FitModuleRejection | null {
  if (input.from.rack !== input.to.rack) {
    return "rack-mismatch";
  }

  const sourceSlot = resolveSlot(state, input.from);

  if (typeof sourceSlot === "string") {
    return sourceSlot;
  }

  const targetSlot = resolveSlot(state, input.to);

  if (typeof targetSlot === "string") {
    return targetSlot;
  }

  if (sourceSlot.index === targetSlot.index) {
    return "same-slot";
  }

  if (!sourceSlot.module) {
    return "empty-slot";
  }

  return targetSlot.module ? "occupied-slot" : null;
}

export function moveModule(state: FitState, input: MoveModuleInput): FitState {
  if (validateMoveModule(state, input)) {
    return state;
  }

  const sourceModule = state.slots[input.from.rack].find(
    (slot) => slot.index === input.from.index
  )?.module;

  if (!sourceModule) {
    return state;
  }

  return updateRack(state, input.from.rack, (slot) => {
    if (slot.index === input.from.index) {
      return { ...slot, module: null };
    }

    if (slot.index === input.to.index) {
      return {
        ...slot,
        module: {
          ...sourceModule,
          charge: sourceModule.charge ? { ...sourceModule.charge } : null
        }
      };
    }

    return slot;
  });
}

export function validateLoadCharge(
  state: FitState,
  input: LoadChargeInput
): FitModuleRejection | null {
  const targetSlot = resolveSlot(state, input);

  if (typeof targetSlot === "string") {
    return targetSlot;
  }

  if (!targetSlot.module) {
    return "empty-slot";
  }

  return isValidLoadedCharge(input.charge) ? null : "invalid-charge";
}

export function loadCharge(state: FitState, input: LoadChargeInput): FitState {
  if (validateLoadCharge(state, input)) {
    return state;
  }

  return updateRack(state, input.rack, (slot) =>
    slot.index === input.index && slot.module
      ? {
          ...slot,
          module: {
            ...slot.module,
            charge: { ...input.charge }
          }
        }
      : slot
  );
}

export function validateUnloadCharge(
  state: FitState,
  input: UnloadChargeInput
): FitModuleRejection | null {
  const targetSlot = resolveSlot(state, input);

  if (typeof targetSlot === "string") {
    return targetSlot;
  }

  return targetSlot.module ? null : "empty-slot";
}

export function unloadCharge(
  state: FitState,
  input: UnloadChargeInput
): FitState {
  if (validateUnloadCharge(state, input)) {
    return state;
  }

  return updateRack(state, input.rack, (slot) =>
    slot.index === input.index && slot.module
      ? {
          ...slot,
          module: {
            ...slot.module,
            charge: null
          }
        }
      : slot
  );
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
    case "remove-module":
      return removeModule(state, action);
    case "replace-module":
      return replaceModule(state, action);
    case "move-module":
      return moveModule(state, action);
    case "load-charge":
      return loadCharge(state, action);
    case "unload-charge":
      return unloadCharge(state, action);
    default:
      return state;
  }
}

function resolveSlot(state: FitState, address: FittingSlotAddress) {
  if (state.hullTypeId === null) {
    return "missing-hull" as const;
  }

  if (!Object.prototype.hasOwnProperty.call(state.slots, address.rack)) {
    return "missing-rack" as const;
  }

  return (
    state.slots[address.rack].find((slot) => slot.index === address.index) ??
    ("missing-slot" as const)
  );
}

function updateRack(
  state: FitState,
  rack: RackType,
  updateSlot: (slot: FitState["slots"][RackType][number]) =>
    FitState["slots"][RackType][number]
): FitState {
  return {
    ...state,
    slots: {
      ...state.slots,
      [rack]: state.slots[rack].map(updateSlot)
    }
  };
}

function isValidFittedModule(module: FittedModule) {
  return (
    typeof module.instanceId === "string" &&
    Boolean(module.instanceId.trim()) &&
    Number.isInteger(module.typeId) &&
    module.typeId > 0 &&
    (module.charge === null || isValidLoadedCharge(module.charge))
  );
}

function isValidLoadedCharge(charge: unknown): charge is LoadedCharge {
  return (
    charge !== null &&
    typeof charge === "object" &&
    "typeId" in charge &&
    "quantity" in charge &&
    typeof charge.typeId === "number" &&
    Number.isInteger(charge.typeId) &&
    charge.typeId > 0 &&
    typeof charge.quantity === "number" &&
    Number.isInteger(charge.quantity) &&
    charge.quantity > 0
  );
}
