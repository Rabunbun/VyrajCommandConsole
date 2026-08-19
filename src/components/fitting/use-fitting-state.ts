import { useCallback, useMemo, useReducer } from "react";
import { fittingReducer } from "@/lib/fitting/fit-reducer";
import { createEmptyFitState } from "@/lib/fitting/fit-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

type UseFittingStateOptions = {
  hulls: FittingHullSummary[];
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

  return {
    fitState,
    selectHull,
    selectedHull
  };
}
