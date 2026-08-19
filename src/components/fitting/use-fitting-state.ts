import { useCallback, useMemo, useReducer } from "react";
import {
  fittingReducer,
  validateFitModulePlacement,
  type FitModuleInput,
  type FitModuleRejection
} from "@/lib/fitting/fit-reducer";
import { createEmptyFitState } from "@/lib/fitting/fit-state";
import type {
  BrowsableFittingRack,
  FittingHullSummary,
  FittingModulePlacementResponse,
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
  const hullsByTypeId = useMemo(
    () => new Map(hulls.map((hull) => [hull.typeId, hull])),
    [hulls]
  );
  const selectedHull = fitState.hullTypeId
    ? hullsByTypeId.get(fitState.hullTypeId) ?? null
    : null;
  const selectHull = useCallback((hull: FittingHullSummary) => {
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
      const resolvedModule = await resolveModuleForPlacement({ rack, typeId });

      if (!resolvedModule.ok) {
        return resolvedModule;
      }

      const input: FitModuleInput = {
        index,
        module: {
          instanceId: crypto.randomUUID(),
          typeId: resolvedModule.module.typeId
        },
        moduleRack: resolvedModule.module.rack,
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

      return resolvedModule;
    },
    [fitState]
  );

  return {
    fitModule,
    fitState,
    selectHull,
    selectedHull
  };
}

async function resolveModuleForPlacement(input: {
  rack: BrowsableFittingRack;
  typeId: number;
}): Promise<FitModuleAttemptResult> {
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
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The selected module could not be validated.",
        ok: false
      };
    }

    if (!payload || !("module" in payload) || !isResolvedModule(payload.module, input)) {
      return {
        message: "The module validation response was invalid.",
        ok: false
      };
    }

    return {
      module: payload.module,
      ok: true
    };
  } catch {
    return {
      message: "Module placement validation is temporarily unavailable.",
      ok: false
    };
  }
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
