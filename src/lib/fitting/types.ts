export type FittingHullSummary = {
  calibrationCapacity: number | null;
  categoryName: string;
  cpuBase: number | null;
  droneBandwidth: number | null;
  droneCapacity: number | null;
  groupName: string;
  highSlots: number;
  iconUrl: string;
  launcherHardpoints: number | null;
  lowSlots: number;
  midSlots: number;
  powergridBase: number | null;
  renderUrl: string;
  rigSlots: number;
  turretHardpoints: number | null;
  typeId: number;
  typeName: string;
};

export type BrowsableFittingRack = "high" | "mid" | "low" | "rig";

export type FittingModuleSearchResult = {
  groupId: number;
  groupName: string;
  marketGroupName: string | null;
  metaGroupName: string | null;
  metaLevel: number | null;
  rack: BrowsableFittingRack;
  techLevel: number | null;
  typeId: number;
  typeName: string;
};

export type FittingModuleSearchResponse = {
  results: FittingModuleSearchResult[];
};

export type ResolvedFittingModule = {
  rack: BrowsableFittingRack;
  typeId: number;
  typeName: string;
};

export type FittingModulePlacementResponse = {
  module: ResolvedFittingModule;
};
