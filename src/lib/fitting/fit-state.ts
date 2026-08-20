export type RackType = "high" | "mid" | "low" | "rig" | "subsystem";

export type FittedModule = {
  instanceId: string;
  typeId: number;
};

export type FittingSlot = {
  index: number;
  module: FittedModule | null;
};

export type FittingSlotAddress = {
  index: number;
  rack: RackType;
};

export type FittingSlots = Record<RackType, FittingSlot[]>;

export type FitState = {
  hullTypeId: number | null;
  slots: FittingSlots;
};

export type FittingTopology = {
  highSlots: number;
  lowSlots: number;
  midSlots: number;
  rigSlots: number;
};

export function createEmptyFitState(): FitState {
  return {
    hullTypeId: null,
    slots: createEmptyFittingSlots()
  };
}

export function createEmptyFittingSlots(): FittingSlots {
  return {
    high: [],
    low: [],
    mid: [],
    rig: [],
    subsystem: []
  };
}

export function createFittingSlots(topology: FittingTopology): FittingSlots {
  return {
    high: createRackSlots(topology.highSlots),
    low: createRackSlots(topology.lowSlots),
    mid: createRackSlots(topology.midSlots),
    rig: createRackSlots(topology.rigSlots),
    subsystem: []
  };
}

function createRackSlots(count: number): FittingSlot[] {
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, index) => ({
    index,
    module: null
  }));
}
