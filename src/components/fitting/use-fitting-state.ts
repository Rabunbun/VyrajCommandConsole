import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  fittingReducer,
  validateMoveModule,
  validateRemoveModule,
  validateReplaceModule,
  validateFitModulePlacement,
  type FitModuleInput,
  type FitModuleRejection,
  type MoveModuleInput
} from "@/lib/fitting/fit-reducer";
import {
  createEmptyFitState,
  type FittingSlotAddress,
  type FitState,
  type RackType
} from "@/lib/fitting/fit-state";
import type {
  BaseFitAnalysis,
  BrowsableFittingRack,
  FittedModuleAddress,
  FittingAnalysisResponse,
  FittingHullSummary,
  FittingModulePlacementResponse,
  FitValidationIssue,
  ResolvedFittingModule
} from "@/lib/fitting/types";

type UseFittingStateOptions = {
  hulls: FittingHullSummary[];
};

type FitModuleOptions = {
  index: number;
  rack: BrowsableFittingRack;
  typeId: number;
};

export type FitModuleAttemptResult =
  | {
      message: string;
      ok: false;
    }
  | {
      module: ResolvedFittingModule;
      ok: true;
    };

export type FitOperationAttemptResult =
  | {
      message: string;
      ok: false;
    }
  | {
      ok: true;
    };

export function useFittingState({ hulls }: UseFittingStateOptions) {
  const [fitState, dispatch] = useReducer(fittingReducer, undefined, createEmptyFitState);
  const [analysis, setAnalysis] = useState<BaseFitAnalysis>(createEmptyAnalysis);
  const [fitWarnings, setFitWarnings] = useState<FitValidationIssue[]>([]);
  const validationEpochRef = useRef(0);
  const hullsByTypeId = useMemo(
    () => new Map(hulls.map((hull) => [hull.typeId, hull])),
    [hulls]
  );
  const selectedHull = fitState.hullTypeId
    ? hullsByTypeId.get(fitState.hullTypeId) ?? null
    : null;
  const cancelPendingOperation = useCallback(() => {
    validationEpochRef.current += 1;
  }, []);
  const selectHull = useCallback((hull: FittingHullSummary) => {
    validationEpochRef.current += 1;
    setAnalysis(createEmptyAnalysis());
    setFitWarnings([]);
    dispatch({
      hullTypeId: hull.typeId,
      topology: {
        highSlots: hull.highSlots,
        lowSlots: hull.lowSlots,
        midSlots: hull.midSlots,
        rigSlots: hull.rigSlots
      },
      type: "select-hull"
    });
  }, []);
  const fitModule = useCallback(
    async ({ index, rack, typeId }: FitModuleOptions): Promise<FitModuleAttemptResult> => {
      const validationEpoch = ++validationEpochRef.current;
      const validation = await requestModulePlacement({
        fittedModules: getFittedModuleAddresses(fitState),
        hullTypeId: fitState.hullTypeId,
        index,
        rack,
        typeId
      });

      if (!validation.ok) {
        return validation;
      }

      if (validationEpoch !== validationEpochRef.current) {
        return {
          message: "The selected hull changed before placement completed.",
          ok: false
        };
      }

      const input: FitModuleInput = {
        index,
        module: {
          instanceId: crypto.randomUUID(),
          typeId: validation.response.module.typeId
        },
        moduleRack: validation.response.module.rack,
        rack
      };
      const rejection = validateFitModulePlacement(fitState, input);

      if (rejection) {
        return {
          message: getPlacementRejectionMessage(rejection),
          ok: false
        };
      }

      dispatch({ ...input, type: "fit-module" });
      setAnalysis(validation.response.analysis);
      setFitWarnings(validation.response.warnings);

      return {
        module: validation.response.module,
        ok: true
      };
    },
    [fitState]
  );
  const removeModule = useCallback(
    async (address: FittingSlotAddress): Promise<FitOperationAttemptResult> => {
      const rejection = validateRemoveModule(fitState, address);

      if (rejection) {
        return rejectedOperation(rejection);
      }

      const validationEpoch = ++validationEpochRef.current;
      const result = await requestFitAnalysis({
        fittedModules: getFittedModuleAddresses(fitState).filter(
          (item) => !addressesMatch(item, address)
        ),
        hullTypeId: fitState.hullTypeId
      });

      if (!result.ok) {
        return result;
      }

      if (validationEpoch !== validationEpochRef.current) {
        return hullChangedRejection();
      }

      dispatch({ ...address, type: "remove-module" });
      setAnalysis(result.response.analysis);
      setFitWarnings(result.response.warnings);

      return { ok: true };
    },
    [fitState]
  );
  const replaceModule = useCallback(
    async ({ index, rack, typeId }: FitModuleOptions): Promise<FitModuleAttemptResult> => {
      const validationEpoch = ++validationEpochRef.current;
      const validation = await requestModulePlacement({
        fittedModules: getFittedModuleAddresses(fitState).filter(
          (item) => !addressesMatch(item, { index, rack })
        ),
        hullTypeId: fitState.hullTypeId,
        index,
        rack,
        typeId
      });

      if (!validation.ok) {
        return validation;
      }

      if (validationEpoch !== validationEpochRef.current) {
        return hullChangedRejection();
      }

      const input: FitModuleInput = {
        index,
        module: {
          instanceId: crypto.randomUUID(),
          typeId: validation.response.module.typeId
        },
        moduleRack: validation.response.module.rack,
        rack
      };
      const rejection = validateReplaceModule(fitState, input);

      if (rejection) {
        return rejectedOperation(rejection);
      }

      dispatch({ ...input, type: "replace-module" });
      setAnalysis(validation.response.analysis);
      setFitWarnings(validation.response.warnings);

      return {
        module: validation.response.module,
        ok: true
      };
    },
    [fitState]
  );
  const moveModule = useCallback(
    (input: MoveModuleInput): FitOperationAttemptResult => {
      validationEpochRef.current += 1;
      const rejection = validateMoveModule(fitState, input);

      if (rejection) {
        return rejectedOperation(rejection);
      }

      dispatch({ ...input, type: "move-module" });

      return { ok: true };
    },
    [fitState]
  );

  return {
    analysis,
    cancelPendingOperation,
    fitModule,
    fitWarnings,
    fitState,
    moveModule,
    removeModule,
    replaceModule,
    selectHull,
    selectedHull
  };
}

async function requestModulePlacement(input: {
  fittedModules: FittedModuleAddress[];
  hullTypeId: number | null;
  index: number;
  rack: BrowsableFittingRack;
  typeId: number;
}): Promise<
  | { message: string; ok: false }
  | {
      ok: true;
      response: FittingModulePlacementResponse & {
        allowed: true;
        module: ResolvedFittingModule;
      };
    }
> {
  try {
    const response = await fetch("/api/fitting/modules", {
      body: JSON.stringify({ ...input, operation: "place" }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | FittingModulePlacementResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      return {
        message:
          isPlacementResponse(payload) && payload.errors[0]
            ? payload.errors[0].message
            : payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The selected module could not be validated.",
        ok: false
      };
    }

    if (
      !isPlacementResponse(payload) ||
      !payload.allowed ||
      !payload.module ||
      !isResolvedModule(payload.module, input)
    ) {
      return {
        message: "The module validation response was invalid.",
        ok: false
      };
    }

    return {
      ok: true,
      response: {
        ...payload,
        allowed: true,
        module: payload.module
      }
    };
  } catch {
    return {
      message: "Module placement validation is temporarily unavailable.",
      ok: false
    };
  }
}

async function requestFitAnalysis(input: {
  fittedModules: FittedModuleAddress[];
  hullTypeId: number | null;
}): Promise<
  | { message: string; ok: false }
  | { ok: true; response: FittingAnalysisResponse & { allowed: true } }
> {
  try {
    const response = await fetch("/api/fitting/modules", {
      body: JSON.stringify({ ...input, operation: "analyze" }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | FittingAnalysisResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      return {
        message: getValidationErrorMessage(
          payload,
          "The resulting fit could not be analyzed."
        ),
        ok: false
      };
    }

    if (!isAnalysisResponse(payload) || !payload.allowed) {
      return {
        message: "The fitting analysis response was invalid.",
        ok: false
      };
    }

    return {
      ok: true,
      response: { ...payload, allowed: true }
    };
  } catch {
    return {
      message: "Fitting analysis is temporarily unavailable.",
      ok: false
    };
  }
}

function isPlacementResponse(value: unknown): value is FittingModulePlacementResponse {
  return isAnalysisResponse(value) && "module" in value;
}

function isAnalysisResponse(value: unknown): value is FittingAnalysisResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "allowed" in value &&
    "analysis" in value &&
    "errors" in value &&
    "warnings" in value &&
    typeof value.allowed === "boolean" &&
    isBaseFitAnalysis(value.analysis) &&
    Array.isArray(value.errors) &&
    value.errors.every(isFitValidationIssue) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isFitValidationIssue)
  );
}

function isBaseFitAnalysis(value: unknown): value is BaseFitAnalysis {
  return (
    value !== null &&
    typeof value === "object" &&
    "calibrationUsed" in value &&
    "cpuUsed" in value &&
    "launcherHardpointsUsed" in value &&
    "powergridUsed" in value &&
    "turretHardpointsUsed" in value &&
    isNonnegativeFiniteNumber(value.calibrationUsed) &&
    isNonnegativeFiniteNumber(value.cpuUsed) &&
    isNonnegativeFiniteNumber(value.launcherHardpointsUsed) &&
    isNonnegativeFiniteNumber(value.powergridUsed) &&
    isNonnegativeFiniteNumber(value.turretHardpointsUsed)
  );
}

function isFitValidationIssue(value: unknown): value is FitValidationIssue {
  return (
    value !== null &&
    typeof value === "object" &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    Boolean(value.code) &&
    typeof value.message === "string" &&
    Boolean(value.message.trim())
  );
}

function isResolvedModule(
  value: unknown,
  expected: { rack: BrowsableFittingRack; typeId: number }
): value is ResolvedFittingModule {
  return (
    value !== null &&
    typeof value === "object" &&
    "rack" in value &&
    "typeId" in value &&
    "typeName" in value &&
    value.rack === expected.rack &&
    value.typeId === expected.typeId &&
    typeof value.typeName === "string" &&
    Boolean(value.typeName.trim())
  );
}

function getPlacementRejectionMessage(rejection: FitModuleRejection) {
  switch (rejection) {
    case "empty-slot":
      return "The source socket is empty.";
    case "missing-hull":
      return "Select a hull before fitting modules.";
    case "missing-rack":
      return "The target rack does not exist.";
    case "missing-slot":
      return "The target socket does not exist.";
    case "occupied-slot":
      return "The target socket is already occupied.";
    case "rack-mismatch":
      return "The source and target racks do not match.";
    case "same-slot":
      return "Choose a different target socket.";
    case "invalid-module":
      return "The fitted-module instance is invalid.";
  }
}

function rejectedOperation(rejection: FitModuleRejection) {
  return {
    message: getPlacementRejectionMessage(rejection),
    ok: false as const
  };
}

function hullChangedRejection() {
  return {
    message: "The selected hull changed before the operation completed.",
    ok: false as const
  };
}

function getValidationErrorMessage(
  payload: FittingAnalysisResponse | { error?: unknown } | null,
  fallback: string
) {
  if (isAnalysisResponse(payload) && payload.errors[0]) {
    return payload.errors[0].message;
  }

  return payload && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function getFittedModuleAddresses(fitState: FitState): FittedModuleAddress[] {
  return (Object.entries(fitState.slots) as [RackType, FitState["slots"][RackType]][])
    .flatMap(([rack, slots]) =>
      slots.flatMap((slot) =>
        slot.module
          ? [{ index: slot.index, rack, typeId: slot.module.typeId }]
          : []
      )
    );
}

function addressesMatch(
  left: Pick<FittedModuleAddress, "index" | "rack">,
  right: FittingSlotAddress
) {
  return left.rack === right.rack && left.index === right.index;
}

function createEmptyAnalysis(): BaseFitAnalysis {
  return {
    calibrationUsed: 0,
    cpuUsed: 0,
    launcherHardpointsUsed: 0,
    powergridUsed: 0,
    turretHardpointsUsed: 0
  };
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
