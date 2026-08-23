import {
  createEmptyFitState,
  createFittingSlots,
  type CargoEntry,
  type DroneBayEntry,
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

export type BulkLoadChargeEntry = LoadChargeInput & {
  moduleTypeId: number;
};

export type LoadChargesInput = {
  entries: BulkLoadChargeEntry[];
};

export type UnloadChargeInput = FittingSlotAddress;

export type AddDroneInput = DroneBayEntry;

export type RemoveDroneInput = DroneBayEntry;

export type SetDroneQuantityInput = DroneBayEntry;

export type DroneBayRejection = "invalid-drone-type" | "invalid-quantity";

export type AddCargoInput = CargoEntry;

export type SetCargoQuantityInput = CargoEntry;

export type RemoveCargoInput = Pick<CargoEntry, "typeId">;

export type ReplaceCargoInput = {
  entries: CargoEntry[];
};

export type CargoRejection =
  | "invalid-cargo-type"
  | "invalid-quantity"
  | "quantity-overflow";

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
  | (LoadChargesInput & {
      type: "load-charges";
    })
  | (UnloadChargeInput & {
      type: "unload-charge";
    })
  | (AddDroneInput & {
      type: "add-drone";
    })
  | (RemoveDroneInput & {
      type: "remove-drone";
    })
  | (SetDroneQuantityInput & {
      type: "set-drone-quantity";
    })
  | {
      type: "clear-drones";
    }
  | (AddCargoInput & {
      type: "add-cargo";
    })
  | (SetCargoQuantityInput & {
      type: "set-cargo-quantity";
    })
  | (RemoveCargoInput & {
      type: "remove-cargo";
    })
  | (ReplaceCargoInput & {
      type: "replace-cargo";
    })
  | {
      type: "clear-cargo";
    };

export function addCargo(state: FitState, input: AddCargoInput): FitState {
  if (validateCargoEntry(input, false)) {
    return state;
  }

  const current = state.cargo.find((entry) => entry.typeId === input.typeId);

  if (current) {
    const quantity = current.quantity + input.quantity;

    if (!Number.isSafeInteger(quantity)) {
      return state;
    }

    return {
      ...state,
      cargo: state.cargo.map((entry) =>
        entry.typeId === input.typeId ? { ...entry, quantity } : entry
      )
    };
  }

  return {
    ...state,
    cargo: [
      ...state.cargo,
      { quantity: input.quantity, typeId: input.typeId }
    ].toSorted(
      (left, right) => left.typeId - right.typeId
    )
  };
}

export function setCargoQuantity(
  state: FitState,
  input: SetCargoQuantityInput
): FitState {
  if (validateCargoEntry(input, true)) {
    return state;
  }

  if (input.quantity === 0) {
    return removeCargo(state, input);
  }

  const existing = state.cargo.some((entry) => entry.typeId === input.typeId);

  return {
    ...state,
    cargo: (existing
      ? state.cargo.map((entry) =>
          entry.typeId === input.typeId ? { ...entry, quantity: input.quantity } : entry
        )
      : [
          ...state.cargo,
          { quantity: input.quantity, typeId: input.typeId }
        ]
    ).toSorted((left, right) => left.typeId - right.typeId)
  };
}

export function removeCargo(
  state: FitState,
  input: RemoveCargoInput
): FitState {
  if (validateCargoTypeId(input.typeId)) {
    return state;
  }

  const cargo = state.cargo.filter((entry) => entry.typeId !== input.typeId);
  return cargo.length === state.cargo.length ? state : { ...state, cargo };
}

export function replaceCargo(
  state: FitState,
  input: ReplaceCargoInput
): FitState {
  const quantities = new Map<number, number>();

  for (const entry of input.entries) {
    if (validateCargoEntry(entry, false)) {
      return state;
    }

    const quantity = (quantities.get(entry.typeId) ?? 0) + entry.quantity;

    if (!Number.isSafeInteger(quantity)) {
      return state;
    }

    quantities.set(entry.typeId, quantity);
  }

  return {
    ...state,
    cargo: Array.from(quantities, ([typeId, quantity]) => ({ quantity, typeId }))
      .toSorted((left, right) => left.typeId - right.typeId)
  };
}

export function clearCargo(state: FitState): FitState {
  return state.cargo.length ? { ...state, cargo: [] } : state;
}

export function addDrone(
  state: FitState,
  input: AddDroneInput
): FitState {
  if (validateDroneBayEntry(input, false)) {
    return state;
  }

  const currentEntry = state.drones.find((entry) => entry.typeId === input.typeId);

  if (currentEntry) {
    const quantity = currentEntry.quantity + input.quantity;

    if (!Number.isSafeInteger(quantity)) {
      return state;
    }

    return {
      ...state,
      drones: state.drones.map((entry) =>
        entry.typeId === input.typeId
          ? { ...entry, quantity }
          : entry
      )
    };
  }

  return {
    ...state,
    drones: [...state.drones, { ...input }]
  };
}

export function removeDrone(
  state: FitState,
  input: RemoveDroneInput
): FitState {
  if (validateDroneBayEntry(input, false)) {
    return state;
  }

  return {
    ...state,
    drones: state.drones.flatMap((entry) => {
      if (entry.typeId !== input.typeId) {
        return [entry];
      }

      const quantity = entry.quantity - input.quantity;
      return quantity > 0 ? [{ ...entry, quantity }] : [];
    })
  };
}

export function setDroneQuantity(
  state: FitState,
  input: SetDroneQuantityInput
): FitState {
  if (validateDroneBayEntry(input, true)) {
    return state;
  }

  if (input.quantity === 0) {
    return {
      ...state,
      drones: state.drones.filter((entry) => entry.typeId !== input.typeId)
    };
  }

  const existingEntry = state.drones.some((entry) => entry.typeId === input.typeId);

  return {
    ...state,
    drones: existingEntry
      ? state.drones.map((entry) =>
          entry.typeId === input.typeId ? { ...entry, quantity: input.quantity } : entry
        )
      : [...state.drones, { ...input }]
  };
}

export function clearDrones(state: FitState): FitState {
  return state.drones.length ? { ...state, drones: [] } : state;
}

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

export function validateLoadCharges(
  state: FitState,
  input: LoadChargesInput
): FitModuleRejection | null {
  if (!input.entries.length) {
    return "invalid-charge";
  }

  const addresses = new Set<string>();
  for (const entry of input.entries) {
    const address = `${entry.rack}:${entry.index}`;
    if (addresses.has(address)) {
      return "invalid-charge";
    }
    addresses.add(address);

    const rejection = validateLoadCharge(state, entry);
    if (rejection) {
      return rejection;
    }

    const targetSlot = state.slots[entry.rack].find(
      (slot) => slot.index === entry.index
    );
    if (targetSlot?.module?.typeId !== entry.moduleTypeId) {
      return "invalid-module";
    }
  }

  return null;
}

export function loadCharges(state: FitState, input: LoadChargesInput): FitState {
  if (validateLoadCharges(state, input)) {
    return state;
  }

  const chargeByAddress = new Map(
    input.entries.map((entry) => [`${entry.rack}:${entry.index}`, entry.charge])
  );
  const slots = { ...state.slots };

  for (const rack of ["high", "mid", "low", "rig", "subsystem"] as const) {
    slots[rack] = state.slots[rack].map((slot) => {
      const charge = chargeByAddress.get(`${rack}:${slot.index}`);
      return charge && slot.module
        ? {
            ...slot,
            module: { ...slot.module, charge: { ...charge } }
          }
        : slot;
    });
  }

  return { ...state, slots };
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
        cargo: [],
        drones: [],
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
    case "load-charges":
      return loadCharges(state, action);
    case "unload-charge":
      return unloadCharge(state, action);
    case "add-drone":
      return addDrone(state, action);
    case "remove-drone":
      return removeDrone(state, action);
    case "set-drone-quantity":
      return setDroneQuantity(state, action);
    case "clear-drones":
      return clearDrones(state);
    case "add-cargo":
      return addCargo(state, action);
    case "set-cargo-quantity":
      return setCargoQuantity(state, action);
    case "remove-cargo":
      return removeCargo(state, action);
    case "replace-cargo":
      return replaceCargo(state, action);
    case "clear-cargo":
      return clearCargo(state);
    default:
      return state;
  }
}

function validateCargoEntry(
  entry: CargoEntry,
  allowZero: boolean
): CargoRejection | null {
  const typeRejection = validateCargoTypeId(entry.typeId);

  if (typeRejection) {
    return typeRejection;
  }

  if (
    !Number.isSafeInteger(entry.quantity) ||
    entry.quantity < (allowZero ? 0 : 1)
  ) {
    return "invalid-quantity";
  }

  return null;
}

function validateCargoTypeId(typeId: number): CargoRejection | null {
  return Number.isInteger(typeId) && typeId > 0
    ? null
    : "invalid-cargo-type";
}

function validateDroneBayEntry(
  entry: DroneBayEntry,
  allowZero: boolean
): DroneBayRejection | null {
  if (!Number.isInteger(entry.typeId) || entry.typeId <= 0) {
    return "invalid-drone-type";
  }

  if (
    !Number.isSafeInteger(entry.quantity) ||
    entry.quantity < (allowZero ? 0 : 1)
  ) {
    return "invalid-quantity";
  }

  return null;
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
