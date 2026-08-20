import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  fittingReducer,
  validateFitModulePlacement,
  type FitModuleInput,
  type FitModuleRejection
} from "@/lib/fitting/fit-reducer";
import {
  createEmptyFitState,
  type FitState,
  type RackType
} from "@/lib/fitting/fit-state";
import type {
  BaseFitAnalysis,
  BrowsableFittingRack,
  FittedModuleAddress,
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
      const validationEpoch = validationEpochRef.current;
      const validation = await resolveModuleForPlacement({
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

  return {
    analysis,
    fitModule,
    fitWarnings,
    fitState,
    selectHull,
    selectedHull
  };
}

async function resolveModuleForPlacement(input: {
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
      body: JSON.stringify(input),
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

function isPlacementResponse(value: unknown): value is FittingModulePlacementResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "allowed" in value &&
    "analysis" in value &&
    "errors" in value &&
    "module" in value &&
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
    case "missing-hull":
      return "Select a hull before fitting modules.";
    case "missing-rack":
      return "The target rack does not exist.";
    case "missing-slot":
      return "The target socket does not exist.";
    case "occupied-slot":
      return "The target socket is already occupied.";
    case "rack-mismatch":
      return "The selected module does not fit the target rack.";
    case "invalid-module":
      return "The fitted-module instance is invalid.";
  }
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
