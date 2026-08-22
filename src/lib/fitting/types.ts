import type { RackType } from "@/lib/fitting/fit-state";

export type FittingHullSummary = {
  calibrationCapacity: number | null;
  categoryName: string;
  cpuBase: number | null;
  droneBandwidth: number | null;
  droneCapacity: number | null;
  groupId: number | null;
  groupName: string;
  highSlots: number;
  iconUrl: string;
  launcherHardpoints: number | null;
  lowSlots: number;
  marketGroupId: number | null;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
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

export type FittingModuleHierarchyNode = {
  children: FittingModuleHierarchyNode[];
  count: number;
  directCount: number;
  fallback: boolean;
  key: string;
  label: string;
  marketGroupId: number | null;
};

export type FittingModuleHierarchyResponse = {
  classified: number;
  fallback: number;
  nodes: FittingModuleHierarchyNode[];
  rack: BrowsableFittingRack;
  reachable: number;
  total: number;
  unreachable: number;
};

export type FittingChargeSearchResult = {
  chargeSize: number | null;
  groupId: number;
  groupName: string;
  marketGroupName: string | null;
  metaGroupName: string | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
  volume: number;
};

export type FittingChargeSearchResponse = {
  module: {
    capacity: number | null;
    chargeCapable: boolean;
    typeId: number;
    typeName: string;
  };
  results: FittingChargeSearchResult[];
};

export type FittingDroneSearchResult = {
  bandwidthUsed: number | null;
  groupId: number;
  groupName: string;
  marketGroupId: number | null;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
  metaGroupId: number | null;
  metaGroupName: string | null;
  metaLevel: number | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
  volume: number | null;
};

export type FittingDroneSearchResponse = {
  results: FittingDroneSearchResult[];
  total: number;
};

export type DroneBayInputEntry = {
  quantity: number;
  typeId: number;
};

export type ResolvedDroneBayEntry = DroneBayInputEntry & {
  typeName: string;
  volume: number;
};

export type DroneBayAnalysis = {
  capacity: number | null;
  entries: ResolvedDroneBayEntry[];
  remainingVolume: number | null;
  usedVolume: number;
};

export type DroneBayValidationIssueCode =
  | "BAY_CAPACITY_EXCEEDED"
  | "DRONE_NOT_FOUND"
  | "DRONE_VOLUME_UNAVAILABLE"
  | "HULL_NOT_FOUND"
  | "HULL_NOT_SELECTED"
  | "INVALID_DRONE_BAY_STATE"
  | "ORDINARY_DRONE_BAY_UNAVAILABLE";

export type DroneBayValidationIssue = {
  code: DroneBayValidationIssueCode;
  message: string;
};

export type DroneBayValidationResponse = {
  allowed: boolean;
  analysis: DroneBayAnalysis;
  errors: DroneBayValidationIssue[];
};

export type ResolvedFittingCharge = {
  quantity: number;
  typeId: number;
  typeName: string;
};

export type FittingChargeLoadResponse = {
  charge: ResolvedFittingCharge;
  module: {
    typeId: number;
    typeName: string;
  };
};

export type ResolvedFittingModule = {
  rack: BrowsableFittingRack;
  typeId: number;
  typeName: string;
};

export type FitValidationIssueCode =
  | "CALIBRATION_OVER"
  | "CPU_BASE_OVER"
  | "HULL_NOT_FOUND"
  | "HULL_NOT_SELECTED"
  | "INVALID_FIT_STATE"
  | "INVALID_SLOT"
  | "LAUNCHER_CAPACITY_UNAVAILABLE"
  | "LAUNCHER_HARDPOINTS_EXHAUSTED"
  | "MAX_GROUP_FITTED"
  | "MAX_TYPE_FITTED"
  | "MODULE_NOT_FOUND"
  | "POWERGRID_BASE_OVER"
  | "RACK_MISMATCH"
  | "RIG_SIZE_MISMATCH"
  | "RIG_SIZE_UNAVAILABLE"
  | "SHIP_RESTRICTION"
  | "SLOT_OCCUPIED"
  | "SUBSYSTEM_DEFERRED"
  | "TURRET_CAPACITY_UNAVAILABLE"
  | "TURRET_HARDPOINTS_EXHAUSTED";

export type FitValidationIssue = {
  code: FitValidationIssueCode;
  message: string;
};

export type BaseFitAnalysis = {
  calibrationUsed: number;
  cpuUsed: number;
  launcherHardpointsUsed: number;
  powergridUsed: number;
  turretHardpointsUsed: number;
};

export type FittedModuleAddress = {
  index: number;
  rack: RackType;
  typeId: number;
};

export type FittingAnalysisResponse = {
  allowed: boolean;
  analysis: BaseFitAnalysis;
  errors: FitValidationIssue[];
  warnings: FitValidationIssue[];
};

export type FittingModulePlacementResponse = FittingAnalysisResponse & {
  module: ResolvedFittingModule | null;
};
