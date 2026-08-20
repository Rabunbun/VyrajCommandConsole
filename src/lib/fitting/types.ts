import type { RackType } from "@/lib/fitting/fit-state";

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

export type FittingModulePlacementResponse = {
  allowed: boolean;
  analysis: BaseFitAnalysis;
  errors: FitValidationIssue[];
  module: ResolvedFittingModule | null;
  warnings: FitValidationIssue[];
};
