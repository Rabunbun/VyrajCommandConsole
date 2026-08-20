import "server-only";
import { FittingRack } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { RackType } from "@/lib/fitting/fit-state";
import type {
  BaseFitAnalysis,
  BrowsableFittingRack,
  FittedModuleAddress,
  FittingAnalysisResponse,
  FittingModulePlacementResponse,
  FitValidationIssue,
  ResolvedFittingModule
} from "@/lib/fitting/types";

export type ValidateFittingModulePlacementInput = {
  fittedModules: FittedModuleAddress[];
  hullTypeId: number | null;
  index: number;
  rack: RackType;
  typeId: number;
};

export type AnalyzeFittingFitInput = {
  fittedModules: FittedModuleAddress[];
  hullTypeId: number | null;
};

const emptyAnalysis: BaseFitAnalysis = {
  calibrationUsed: 0,
  cpuUsed: 0,
  launcherHardpointsUsed: 0,
  powergridUsed: 0,
  turretHardpointsUsed: 0
};

const databaseRackByRack: Record<RackType, FittingRack> = {
  high: FittingRack.HIGH,
  low: FittingRack.LOW,
  mid: FittingRack.MID,
  rig: FittingRack.RIG,
  subsystem: FittingRack.SUBSYSTEM
};

const browserRackByDatabaseRack: Partial<
  Record<FittingRack, BrowsableFittingRack>
> = {
  [FittingRack.HIGH]: "high",
  [FittingRack.LOW]: "low",
  [FittingRack.MID]: "mid",
  [FittingRack.RIG]: "rig"
};

export async function validateFittingModulePlacement(
  input: ValidateFittingModulePlacementInput
): Promise<FittingModulePlacementResponse> {
  const proposedModule: FittedModuleAddress = {
    index: input.index,
    rack: input.rack,
    typeId: input.typeId
  };
  const result = await evaluateFittingFit({
    fittedModules: [...input.fittedModules, proposedModule],
    hullTypeId: input.hullTypeId,
    proposedModule
  });

  return {
    ...result.response,
    module: result.resolvedProposedModule
  };
}

export async function analyzeFittingFit(
  input: AnalyzeFittingFitInput
): Promise<FittingAnalysisResponse> {
  const result = await evaluateFittingFit(input);

  return result.response;
}

async function evaluateFittingFit(input: AnalyzeFittingFitInput & {
  proposedModule?: FittedModuleAddress;
}): Promise<{
  resolvedProposedModule: ResolvedFittingModule | null;
  response: FittingAnalysisResponse;
}> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting static-data cache is unavailable.");
  }

  if (input.hullTypeId === null) {
    return {
      resolvedProposedModule: null,
      response: rejectedAnalysis(
        "HULL_NOT_SELECTED",
        "Select a hull before fitting modules."
      )
    };
  }

  const typeIds = Array.from(new Set(input.fittedModules.map((item) => item.typeId)));
  const [hull, staticModules] = await Promise.all([
    getDb().fittingHull.findUnique({
      where: { typeId: input.hullTypeId },
      select: {
        calibrationCapacity: true,
        cpuBase: true,
        groupId: true,
        highSlots: true,
        launcherHardpoints: true,
        lowSlots: true,
        midSlots: true,
        powergridBase: true,
        rigSize: true,
        rigSlots: true,
        turretHardpoints: true,
        typeId: true,
        typeName: true
      }
    }),
    getDb().fittingModule.findMany({
      where: { typeId: { in: typeIds } },
      select: {
        allowedShipGroupIds: true,
        allowedShipTypeIds: true,
        calibrationCost: true,
        cpuRequirement: true,
        groupId: true,
        groupName: true,
        maxGroupFitted: true,
        maxTypeFitted: true,
        powergridRequirement: true,
        rack: true,
        requiresLauncherHardpoint: true,
        requiresTurretHardpoint: true,
        rigSize: true,
        typeId: true,
        typeName: true
      }
    })
  ]);

  if (!hull) {
    return {
      resolvedProposedModule: null,
      response: rejectedAnalysis(
        "HULL_NOT_FOUND",
        "The selected hull does not exist in the fitting cache."
      )
    };
  }

  const errors: FitValidationIssue[] = [];
  const staticModuleByTypeId = new Map(
    staticModules.map((module) => [module.typeId, module])
  );
  const rackCapacityByRack: Record<RackType, number> = {
    high: hull.highSlots,
    low: hull.lowSlots,
    mid: hull.midSlots,
    rig: hull.rigSlots,
    subsystem: 0
  };

  const occupiedAddresses = new Set<string>();
  const tentativeModules = [] as typeof staticModules;

  for (const fittedModule of input.fittedModules) {
    const isProposedModule = fittedModule === input.proposedModule;
    const address = getSlotAddress(fittedModule.rack, fittedModule.index);

    if (occupiedAddresses.has(address)) {
      addIssue(
        errors,
        isProposedModule ? "SLOT_OCCUPIED" : "INVALID_FIT_STATE",
        isProposedModule
          ? "The target socket is already occupied."
          : "The current fit contains more than one module in the same socket."
      );
    }
    occupiedAddresses.add(address);

    if (fittedModule.rack === "subsystem") {
      addIssue(
        errors,
        isProposedModule ? "SUBSYSTEM_DEFERRED" : "INVALID_FIT_STATE",
        isProposedModule
          ? "Subsystem fitting is not supported yet."
          : "The current fit contains a deferred subsystem module."
      );
    }

    if (
      !Number.isInteger(fittedModule.index) ||
      fittedModule.index < 0 ||
      fittedModule.index >= rackCapacityByRack[fittedModule.rack]
    ) {
      addIssue(
        errors,
        isProposedModule ? "INVALID_SLOT" : "INVALID_FIT_STATE",
        isProposedModule
          ? "The target socket does not exist on this hull."
          : "The current fit contains a module outside the selected hull's sockets."
      );
    }

    const staticModule = staticModuleByTypeId.get(fittedModule.typeId);

    if (!staticModule) {
      addIssue(
        errors,
        "MODULE_NOT_FOUND",
        isProposedModule
          ? "The selected module does not exist in the fitting cache."
          : `Module type ${fittedModule.typeId} in the current fit is missing from the fitting cache.`
      );
      continue;
    }

    if (staticModule.rack !== databaseRackByRack[fittedModule.rack]) {
      addIssue(
        errors,
        isProposedModule ? "RACK_MISMATCH" : "INVALID_FIT_STATE",
        isProposedModule
          ? "The selected module does not fit the target rack."
          : `${staticModule.typeName} is stored in the wrong rack in the current fit.`
      );
    }

    tentativeModules.push(staticModule);
  }

  for (const fittingModule of tentativeModules) {
    validateShipRestriction(errors, hull, fittingModule);
    validateRigSize(errors, hull, fittingModule);
  }

  validateFitCounts(errors, tentativeModules);

  const analysis = analyzeBaseFit(tentativeModules);

  validateHardpoints(errors, hull, analysis);

  const warnings = buildResourceWarnings(hull, analysis);
  const proposedStaticModule = input.proposedModule
    ? staticModuleByTypeId.get(input.proposedModule.typeId) ?? null
    : null;
  const resolvedRack = proposedStaticModule
    ? browserRackByDatabaseRack[proposedStaticModule.rack]
    : null;
  const resolvedModule: ResolvedFittingModule | null =
    proposedStaticModule && resolvedRack
      ? {
          rack: resolvedRack,
          typeId: proposedStaticModule.typeId,
          typeName: proposedStaticModule.typeName
        }
      : null;

  return {
    resolvedProposedModule: resolvedModule,
    response: {
      allowed: errors.length === 0,
      analysis,
      errors,
      warnings
    }
  };
}

function analyzeBaseFit(
  modules: Array<{
    calibrationCost: number;
    cpuRequirement: number;
    powergridRequirement: number;
    requiresLauncherHardpoint: boolean;
    requiresTurretHardpoint: boolean;
  }>
): BaseFitAnalysis {
  return modules.reduce<BaseFitAnalysis>(
    (analysis, fittingModule) => ({
      calibrationUsed: analysis.calibrationUsed + fittingModule.calibrationCost,
      cpuUsed: analysis.cpuUsed + fittingModule.cpuRequirement,
      launcherHardpointsUsed:
        analysis.launcherHardpointsUsed +
        (fittingModule.requiresLauncherHardpoint ? 1 : 0),
      powergridUsed: analysis.powergridUsed + fittingModule.powergridRequirement,
      turretHardpointsUsed:
        analysis.turretHardpointsUsed +
        (fittingModule.requiresTurretHardpoint ? 1 : 0)
    }),
    { ...emptyAnalysis }
  );
}

function validateShipRestriction(
  errors: FitValidationIssue[],
  hull: { groupId: number | null; typeId: number; typeName: string },
  fittingModule: {
    allowedShipGroupIds: number[];
    allowedShipTypeIds: number[];
    typeName: string;
  }
) {
  const hasRestrictions =
    fittingModule.allowedShipGroupIds.length > 0 ||
    fittingModule.allowedShipTypeIds.length > 0;
  const groupAllowed =
    hull.groupId !== null &&
    fittingModule.allowedShipGroupIds.includes(hull.groupId);
  const typeAllowed = fittingModule.allowedShipTypeIds.includes(hull.typeId);

  if (hasRestrictions && !groupAllowed && !typeAllowed) {
    addIssue(
      errors,
      "SHIP_RESTRICTION",
      `${fittingModule.typeName} cannot be fitted to ${hull.typeName}.`
    );
  }
}

function validateRigSize(
  errors: FitValidationIssue[],
  hull: { rigSize: number | null; typeName: string },
  fittingModule: { rack: FittingRack; rigSize: number | null; typeName: string }
) {
  if (fittingModule.rack !== FittingRack.RIG) {
    return;
  }

  if (fittingModule.rigSize === null || hull.rigSize === null) {
    addIssue(
      errors,
      "RIG_SIZE_UNAVAILABLE",
      `Rig-size data required to fit ${fittingModule.typeName} to ${hull.typeName} is unavailable.`
    );
  } else if (fittingModule.rigSize !== hull.rigSize) {
    addIssue(
      errors,
      "RIG_SIZE_MISMATCH",
      `${fittingModule.typeName} does not match ${hull.typeName}'s rig size.`
    );
  }
}

function validateFitCounts(
  errors: FitValidationIssue[],
  modules: Array<{
    groupId: number;
    groupName: string;
    maxGroupFitted: number | null;
    maxTypeFitted: number | null;
    typeId: number;
    typeName: string;
  }>
) {
  const groupCounts = countBy(modules, (fittingModule) => fittingModule.groupId);
  const typeCounts = countBy(modules, (fittingModule) => fittingModule.typeId);
  const checkedGroups = new Set<number>();
  const checkedTypes = new Set<number>();

  for (const fittingModule of modules) {
    if (
      fittingModule.maxGroupFitted !== null &&
      !checkedGroups.has(fittingModule.groupId) &&
      (groupCounts.get(fittingModule.groupId) ?? 0) > fittingModule.maxGroupFitted
    ) {
      checkedGroups.add(fittingModule.groupId);
      addIssue(
        errors,
        "MAX_GROUP_FITTED",
        `${fittingModule.groupName} is limited to ${fittingModule.maxGroupFitted} fitted module${fittingModule.maxGroupFitted === 1 ? "" : "s"}.`
      );
    }

    if (
      fittingModule.maxTypeFitted !== null &&
      !checkedTypes.has(fittingModule.typeId) &&
      (typeCounts.get(fittingModule.typeId) ?? 0) > fittingModule.maxTypeFitted
    ) {
      checkedTypes.add(fittingModule.typeId);
      addIssue(
        errors,
        "MAX_TYPE_FITTED",
        `${fittingModule.typeName} is limited to ${fittingModule.maxTypeFitted} fitted ${fittingModule.maxTypeFitted === 1 ? "copy" : "copies"}.`
      );
    }
  }
}

function validateHardpoints(
  errors: FitValidationIssue[],
  hull: {
    launcherHardpoints: number | null;
    turretHardpoints: number | null;
    typeName: string;
  },
  analysis: BaseFitAnalysis
) {
  if (analysis.turretHardpointsUsed > 0 && hull.turretHardpoints === null) {
    addIssue(
      errors,
      "TURRET_CAPACITY_UNAVAILABLE",
      `${hull.typeName}'s turret-hardpoint capacity is unavailable.`
    );
  } else if (
    hull.turretHardpoints !== null &&
    analysis.turretHardpointsUsed > hull.turretHardpoints
  ) {
    addIssue(
      errors,
      "TURRET_HARDPOINTS_EXHAUSTED",
      `${hull.typeName} has no remaining turret hardpoints.`
    );
  }

  if (analysis.launcherHardpointsUsed > 0 && hull.launcherHardpoints === null) {
    addIssue(
      errors,
      "LAUNCHER_CAPACITY_UNAVAILABLE",
      `${hull.typeName}'s launcher-hardpoint capacity is unavailable.`
    );
  } else if (
    hull.launcherHardpoints !== null &&
    analysis.launcherHardpointsUsed > hull.launcherHardpoints
  ) {
    addIssue(
      errors,
      "LAUNCHER_HARDPOINTS_EXHAUSTED",
      `${hull.typeName} has no remaining launcher hardpoints.`
    );
  }
}

function buildResourceWarnings(
  hull: {
    calibrationCapacity: number | null;
    cpuBase: number | null;
    powergridBase: number | null;
  },
  analysis: BaseFitAnalysis
): FitValidationIssue[] {
  const warnings: FitValidationIssue[] = [];

  if (hull.cpuBase !== null && analysis.cpuUsed > hull.cpuBase) {
    addIssue(
      warnings,
      "CPU_BASE_OVER",
      "CPU usage exceeds the hull's unmodified base output."
    );
  }
  if (hull.powergridBase !== null && analysis.powergridUsed > hull.powergridBase) {
    addIssue(
      warnings,
      "POWERGRID_BASE_OVER",
      "Powergrid usage exceeds the hull's unmodified base output."
    );
  }
  if (
    hull.calibrationCapacity !== null &&
    analysis.calibrationUsed > hull.calibrationCapacity
  ) {
    addIssue(
      warnings,
      "CALIBRATION_OVER",
      "Calibration usage exceeds the hull's base capacity."
    );
  }

  return warnings;
}

function rejectedAnalysis(
  code: FitValidationIssue["code"],
  message: string
): FittingAnalysisResponse {
  return {
    allowed: false,
    analysis: { ...emptyAnalysis },
    errors: [{ code, message }],
    warnings: []
  };
}

function addIssue(
  issues: FitValidationIssue[],
  code: FitValidationIssue["code"],
  message: string
) {
  if (!issues.some((issue) => issue.code === code && issue.message === message)) {
    issues.push({ code, message });
  }
}

function countBy<T>(items: T[], getKey: (item: T) => number) {
  const counts = new Map<number, number>();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function getSlotAddress(rack: RackType, index: number) {
  return `${rack}:${index}`;
}
