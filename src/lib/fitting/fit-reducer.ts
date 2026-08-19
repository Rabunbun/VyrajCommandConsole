import {
  createEmptyFitState,
  createFittingSlots,
  type FittingTopology,
  type FitState
} from "@/lib/fitting/fit-state";

export type FitAction =
  | {
      hullTypeId: number;
      topology: FittingTopology;
      type: "select-hull";
    }
  | {
      type: "clear-hull";
    };

export function fittingReducer(state: FitState, action: FitAction): FitState {
  switch (action.type) {
    case "select-hull":
      return {
        hullTypeId: action.hullTypeId,
        slots: createFittingSlots(action.topology)
      };
    case "clear-hull":
      return createEmptyFitState();
    default:
      return state;
  }
}
