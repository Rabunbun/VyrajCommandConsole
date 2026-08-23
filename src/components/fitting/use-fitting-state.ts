import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  fittingReducer,
  validateLoadCharge,
  validateLoadCharges,
  validateMoveModule,
  validateRemoveModule,
  validateReplaceModule,
  validateFitModulePlacement,
  validateUnloadCharge,
  type FitModuleInput,
  type FitModuleRejection,
  type MoveModuleInput
} from "@/lib/fitting/fit-reducer";
import {
  createEmptyFitState,
  type CargoEntry,
  type DroneBayEntry,
  type FittingSlotAddress,
  type FitState,
  type RackType
} from "@/lib/fitting/fit-state";
import type {
  BaseFitAnalysis,
  BrowsableFittingRack,
  CargoHoldAnalysis,
  CargoHoldValidationResponse,
  CargoValidationIssue,
  CargoValidationIssueCode,
  DroneBayAnalysis,
  DroneBayValidationIssueCode,
  DroneBayValidationResponse,
  FittedModuleAddress,
  FittingAnalysisResponse,
  FittingChargeBulkLoadResponse,
  FittingChargeLoadResponse,
  FittingHullSummary,
  FittingModulePlacementResponse,
  FitValidationIssueCode,
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
      code?: FitValidationIssueCode;
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

export type LoadChargeAttemptResult =
  | {
      message: string;
      ok: false;
    }
  | {
      charge: FittingChargeLoadResponse["charge"];
      ok: true;
    };

export type BulkLoadChargeAttemptResult =
  | {
      message: string;
      ok: false;
    }
  | {
      chargeTypeId: number;
      chargeTypeName: string;
      loadedModuleCount: number;
      ok: true;
    };

export type DroneBayAttemptResult =
  | {
      code?: DroneBayValidationIssueCode;
      message: string;
      ok: false;
    }
  | {
    analysis: DroneBayAnalysis;
    ok: true;
  };

export type CargoHoldAttemptResult =
  | {
      code?: CargoValidationIssueCode;
      message: string;
      ok: false;
    }
  | {
      analysis: CargoHoldAnalysis;
      ok: true;
      warnings: CargoValidationIssue[];
    };

export function useFittingState({ hulls }: UseFittingStateOptions) {
  const [fitState, dispatch] = useReducer(fittingReducer, undefined, createEmptyFitState);
  const [analysis, setAnalysis] = useState<BaseFitAnalysis>(createEmptyAnalysis);
  const [droneBayAnalysis, setDroneBayAnalysis] = useState<DroneBayAnalysis>(
    createEmptyDroneBayAnalysis
  );
  const [cargoHoldAnalysis, setCargoHoldAnalysis] = useState<CargoHoldAnalysis>(
    createEmptyCargoHoldAnalysis
  );
  const [cargoWarnings, setCargoWarnings] = useState<CargoValidationIssue[]>([]);
  const [fitWarnings, setFitWarnings] = useState<FitValidationIssue[]>([]);
  const validationEpochRef = useRef(0);
  const droneValidationEpochRef = useRef(0);
  const cargoValidationEpochRef = useRef(0);
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
    droneValidationEpochRef.current += 1;
    cargoValidationEpochRef.current += 1;
    setAnalysis(createEmptyAnalysis());
    setDroneBayAnalysis(createEmptyDroneBayAnalysis(hull.droneCapacity));
    setCargoHoldAnalysis(createEmptyCargoHoldAnalysis(hull.cargoCapacityBase));
    setCargoWarnings([]);
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
          charge: null,
          instanceId: crypto.randomUUID(),
          typeId: validation.response.module.typeId
        },
        moduleRack: validation.response.module.rack,
        rack
      };
      const rejection = validateFitModulePlacement(fitState, input);

      if (rejection) {
        const code = getPlacementRejectionCode(rejection);

        return {
          ...(code ? { code } : {}),
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
          charge: null,
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
  const loadCharge = useCallback(
    async (
      address: FittingSlotAddress,
      chargeTypeId: number
    ): Promise<LoadChargeAttemptResult> => {
      const fittedModule = findFittedModule(fitState, address);

      if (!fittedModule) {
        return {
          message: "Select a fitted module before loading a charge.",
          ok: false
        };
      }

      const validationEpoch = ++validationEpochRef.current;
      const result = await requestChargeLoad({
        chargeTypeId,
        moduleTypeId: fittedModule.typeId
      });

      if (!result.ok) {
        return result;
      }

      if (validationEpoch !== validationEpochRef.current) {
        return hullChangedRejection();
      }

      const input = {
        ...address,
        charge: {
          quantity: result.response.charge.quantity,
          typeId: result.response.charge.typeId
        }
      };
      const rejection = validateLoadCharge(fitState, input);

      if (rejection) {
        return rejectedOperation(rejection);
      }

      dispatch({ ...input, type: "load-charge" });

      return {
        charge: result.response.charge,
        ok: true
      };
    },
    [fitState]
  );
  const bulkLoadCharge = useCallback(
    async (chargeTypeId: number): Promise<BulkLoadChargeAttemptResult> => {
      const fittedModules = getFittedModuleAddresses(fitState);
      if (!fittedModules.length) {
        return {
          message: "No fitted modules are available for this charge.",
          ok: false
        };
      }

      const validationEpoch = ++validationEpochRef.current;
      const result = await requestBulkChargeLoad({
        chargeTypeId,
        moduleTypeIds: fittedModules.map((module) => module.typeId)
      });
      if (!result.ok) {
        return result;
      }
      if (validationEpoch !== validationEpochRef.current) {
        return hullChangedRejection();
      }

      const loadByModuleTypeId = new Map(
        result.response.loads.map((load) => [load.module.typeId, load.charge])
      );
      const entries = fittedModules.flatMap((module) => {
        const charge = loadByModuleTypeId.get(module.typeId);
        return charge
          ? [{
              ...module,
              charge: { quantity: charge.quantity, typeId: charge.typeId },
              moduleTypeId: module.typeId
            }]
          : [];
      });
      if (!entries.length) {
        return {
          message: "No fitted modules are compatible with this charge.",
          ok: false
        };
      }

      const input = { entries };
      const rejection = validateLoadCharges(fitState, input);
      if (rejection) {
        return rejectedOperation(rejection);
      }

      dispatch({ ...input, type: "load-charges" });
      return {
        chargeTypeId: result.response.chargeTypeId,
        chargeTypeName: result.response.chargeTypeName,
        loadedModuleCount: entries.length,
        ok: true
      };
    },
    [fitState]
  );
  const unloadCharge = useCallback(
    (address: FittingSlotAddress): FitOperationAttemptResult => {
      validationEpochRef.current += 1;
      const rejection = validateUnloadCharge(fitState, address);

      if (rejection) {
        return rejectedOperation(rejection);
      }

      dispatch({ ...address, type: "unload-charge" });

      return { ok: true };
    },
    [fitState]
  );
  const setDroneQuantity = useCallback(
    async (typeId: number, quantity: number): Promise<DroneBayAttemptResult> => {
      if (!Number.isInteger(typeId) || typeId <= 0) {
        return { message: "The selected drone type is invalid.", ok: false };
      }

      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        return { message: "Drone quantity must be a nonnegative integer.", ok: false };
      }

      const targetDrones = setDroneBayEntryQuantity(fitState.drones, typeId, quantity);
      const validationEpoch = ++droneValidationEpochRef.current;
      const result = await requestDroneBayValidation({
        drones: targetDrones,
        hullTypeId: fitState.hullTypeId
      });

      if (!result.ok) {
        return result;
      }

      if (validationEpoch !== droneValidationEpochRef.current) {
        return hullChangedRejection();
      }

      dispatch({ quantity, type: "set-drone-quantity", typeId });
      setDroneBayAnalysis(result.response.analysis);

      return { analysis: result.response.analysis, ok: true };
    },
    [fitState.drones, fitState.hullTypeId]
  );
  const addDrone = useCallback(
    (typeId: number, quantity = 1): Promise<DroneBayAttemptResult> => {
      const currentQuantity =
        fitState.drones.find((entry) => entry.typeId === typeId)?.quantity ?? 0;

      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return Promise.resolve({
          message: "Drone quantity must be a positive integer.",
          ok: false
        });
      }

      return setDroneQuantity(typeId, currentQuantity + quantity);
    },
    [fitState.drones, setDroneQuantity]
  );
  const decrementDrone = useCallback(
    (typeId: number): Promise<DroneBayAttemptResult> => {
      const currentQuantity =
        fitState.drones.find((entry) => entry.typeId === typeId)?.quantity ?? 0;

      if (currentQuantity <= 0) {
        return Promise.resolve({
          message: "That drone is not currently in the Drone Bay.",
          ok: false
        });
      }

      return setDroneQuantity(typeId, currentQuantity - 1);
    },
    [fitState.drones, setDroneQuantity]
  );
  const removeDrone = useCallback(
    (typeId: number): Promise<DroneBayAttemptResult> =>
      setDroneQuantity(typeId, 0),
    [setDroneQuantity]
  );
  const setCargoQuantity = useCallback(
    async (typeId: number, quantity: number): Promise<CargoHoldAttemptResult> => {
      if (!Number.isInteger(typeId) || typeId <= 0) {
        return { message: "The selected cargo type is invalid.", ok: false };
      }

      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        return {
          code: "INVALID_CARGO_STATE",
          message: "Cargo quantity must be a nonnegative safe integer.",
          ok: false
        };
      }

      const targetCargo = setCargoEntryQuantity(fitState.cargo, typeId, quantity);
      const validationEpoch = ++cargoValidationEpochRef.current;
      const result = await requestCargoHoldValidation({
        cargo: targetCargo,
        hullTypeId: fitState.hullTypeId
      });

      if (!result.ok) {
        return result;
      }

      if (validationEpoch !== cargoValidationEpochRef.current) {
        return hullChangedRejection();
      }

      dispatch({ quantity, type: "set-cargo-quantity", typeId });
      setCargoHoldAnalysis(result.response.analysis);
      setCargoWarnings(result.response.warnings);

      return {
        analysis: result.response.analysis,
        ok: true,
        warnings: result.response.warnings
      };
    },
    [fitState.cargo, fitState.hullTypeId]
  );
  const addCargo = useCallback(
    (typeId: number, quantity = 1): Promise<CargoHoldAttemptResult> => {
      const currentQuantity =
        fitState.cargo.find((entry) => entry.typeId === typeId)?.quantity ?? 0;

      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return Promise.resolve({
          code: "INVALID_CARGO_STATE",
          message: "Cargo quantity must be a positive safe integer.",
          ok: false
        });
      }

      const nextQuantity = currentQuantity + quantity;

      if (!Number.isSafeInteger(nextQuantity)) {
        return Promise.resolve({
          code: "INVALID_CARGO_STATE",
          message: "The resulting cargo quantity exceeds the safe integer range.",
          ok: false
        });
      }

      return setCargoQuantity(typeId, nextQuantity);
    },
    [fitState.cargo, setCargoQuantity]
  );
  const decrementCargo = useCallback(
    (typeId: number): Promise<CargoHoldAttemptResult> => {
      const currentQuantity =
        fitState.cargo.find((entry) => entry.typeId === typeId)?.quantity ?? 0;

      if (currentQuantity <= 0) {
        return Promise.resolve({
          message: "That item is not currently in the Cargo Hold.",
          ok: false
        });
      }

      return setCargoQuantity(typeId, currentQuantity - 1);
    },
    [fitState.cargo, setCargoQuantity]
  );
  const removeCargo = useCallback(
    (typeId: number): Promise<CargoHoldAttemptResult> =>
      setCargoQuantity(typeId, 0),
    [setCargoQuantity]
  );
  const clearCargo = useCallback(async (): Promise<CargoHoldAttemptResult> => {
    const validationEpoch = ++cargoValidationEpochRef.current;
    const result = await requestCargoHoldValidation({
      cargo: [],
      hullTypeId: fitState.hullTypeId
    });

    if (!result.ok) {
      return result;
    }

    if (validationEpoch !== cargoValidationEpochRef.current) {
      return hullChangedRejection();
    }

    dispatch({ type: "clear-cargo" });
    setCargoHoldAnalysis(result.response.analysis);
    setCargoWarnings(result.response.warnings);

    return {
      analysis: result.response.analysis,
      ok: true,
      warnings: result.response.warnings
    };
  }, [fitState.hullTypeId]);

  return {
    addCargo,
    addDrone,
    analysis,
    bulkLoadCharge,
    cancelPendingOperation,
    cargoHoldAnalysis,
    cargoWarnings,
    clearCargo,
    decrementCargo,
    decrementDrone,
    droneBayAnalysis,
    fitModule,
    fitWarnings,
    fitState,
    loadCharge,
    moveModule,
    removeCargo,
    removeDrone,
    removeModule,
    replaceModule,
    selectHull,
    selectedHull,
    unloadCharge
  };
}

async function requestCargoHoldValidation(input: {
  cargo: CargoEntry[];
  hullTypeId: number | null;
}): Promise<
  | { code?: CargoValidationIssueCode; message: string; ok: false }
  | { ok: true; response: CargoHoldValidationResponse & { allowed: true } }
> {
  try {
    const response = await fetch("/api/fitting/cargo", {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | CargoHoldValidationResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      const issue = isCargoHoldValidationResponse(payload)
        ? payload.errors[0]
        : null;

      return {
        ...(issue ? { code: issue.code } : {}),
        message:
          issue?.message ??
          (payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The Cargo Hold change could not be validated."),
        ok: false
      };
    }

    if (!isCargoHoldValidationResponse(payload) || !payload.allowed) {
      return { message: "The Cargo Hold analysis response was invalid.", ok: false };
    }

    return { ok: true, response: { ...payload, allowed: true } };
  } catch {
    return { message: "Cargo Hold analysis is temporarily unavailable.", ok: false };
  }
}

async function requestDroneBayValidation(input: {
  drones: DroneBayEntry[];
  hullTypeId: number | null;
}): Promise<
  | { code?: DroneBayValidationIssueCode; message: string; ok: false }
  | { ok: true; response: DroneBayValidationResponse & { allowed: true } }
> {
  try {
    const response = await fetch("/api/fitting/drones", {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | DroneBayValidationResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      const issue = isDroneBayValidationResponse(payload) ? payload.errors[0] : null;

      return {
        ...(issue ? { code: issue.code } : {}),
        message:
          issue?.message ??
          (payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The Drone Bay change could not be validated."),
        ok: false
      };
    }

    if (!isDroneBayValidationResponse(payload) || !payload.allowed) {
      return { message: "The Drone Bay validation response was invalid.", ok: false };
    }

    return { ok: true, response: { ...payload, allowed: true } };
  } catch {
    return { message: "Drone Bay validation is temporarily unavailable.", ok: false };
  }
}

async function requestChargeLoad(input: {
  chargeTypeId: number;
  moduleTypeId: number;
}): Promise<
  | { message: string; ok: false }
  | { ok: true; response: FittingChargeLoadResponse }
> {
  try {
    const response = await fetch("/api/fitting/charges", {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | FittingChargeLoadResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      return {
        message:
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The selected charge could not be validated.",
        ok: false
      };
    }

    if (!isChargeLoadResponse(payload, input)) {
      return {
        message: "The charge validation response was invalid.",
        ok: false
      };
    }

    return { ok: true, response: payload };
  } catch {
    return {
      message: "Charge validation is temporarily unavailable.",
      ok: false
    };
  }
}

async function requestBulkChargeLoad(input: {
  chargeTypeId: number;
  moduleTypeIds: number[];
}): Promise<
  | { message: string; ok: false }
  | { ok: true; response: FittingChargeBulkLoadResponse }
> {
  try {
    const response = await fetch("/api/fitting/charges", {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = (await response.json().catch(() => null)) as
      | FittingChargeBulkLoadResponse
      | { error?: unknown }
      | null;

    if (!response.ok) {
      return {
        message:
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The charge could not be validated against the current fit.",
        ok: false
      };
    }
    if (!isBulkChargeLoadResponse(payload, input.chargeTypeId)) {
      return {
        message: "The bulk charge validation response was invalid.",
        ok: false
      };
    }

    return { ok: true, response: payload };
  } catch {
    return {
      message: "Charge validation is temporarily unavailable.",
      ok: false
    };
  }
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
      const validationIssue =
        isPlacementResponse(payload) && payload.errors[0]
          ? payload.errors[0]
          : null;

      return {
        ...(validationIssue ? { code: validationIssue.code } : {}),
        message:
          validationIssue
            ? validationIssue.message
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

function isChargeLoadResponse(
  value: unknown,
  expected: { chargeTypeId: number; moduleTypeId: number }
): value is FittingChargeLoadResponse {
  if (
    value === null ||
    typeof value !== "object" ||
    !("charge" in value) ||
    !("module" in value)
  ) {
    return false;
  }

  const { charge, module } = value;

  return (
    charge !== null &&
    typeof charge === "object" &&
    "quantity" in charge &&
    "typeId" in charge &&
    "typeName" in charge &&
    charge.typeId === expected.chargeTypeId &&
    typeof charge.quantity === "number" &&
    Number.isInteger(charge.quantity) &&
    charge.quantity > 0 &&
    typeof charge.typeName === "string" &&
    Boolean(charge.typeName.trim()) &&
    module !== null &&
    typeof module === "object" &&
    "typeId" in module &&
    "typeName" in module &&
    module.typeId === expected.moduleTypeId &&
    typeof module.typeName === "string" &&
    Boolean(module.typeName.trim())
  );
}

function isBulkChargeLoadResponse(
  value: unknown,
  expectedChargeTypeId: number
): value is FittingChargeBulkLoadResponse {
  if (
    value === null ||
    typeof value !== "object" ||
    !("chargeTypeId" in value) ||
    !("chargeTypeName" in value) ||
    !("loads" in value) ||
    !("missingModuleTypeIds" in value) ||
    value.chargeTypeId !== expectedChargeTypeId ||
    typeof value.chargeTypeName !== "string" ||
    !value.chargeTypeName.trim() ||
    !Array.isArray(value.loads) ||
    !Array.isArray(value.missingModuleTypeIds)
  ) {
    return false;
  }

  return (
    value.loads.every((load) =>
      load !== null &&
      typeof load === "object" &&
      "module" in load &&
      load.module !== null &&
      typeof load.module === "object" &&
      "typeId" in load.module &&
      typeof load.module.typeId === "number"
        ? isChargeLoadResponse(load, {
            chargeTypeId: expectedChargeTypeId,
            moduleTypeId: load.module.typeId
          })
        : false
    ) &&
    value.missingModuleTypeIds.every(
      (typeId) => typeof typeId === "number" && Number.isInteger(typeId) && typeId > 0
    )
  );
}

function isDroneBayValidationResponse(
  value: unknown
): value is DroneBayValidationResponse {
  if (
    value === null ||
    typeof value !== "object" ||
    !("allowed" in value) ||
    !("analysis" in value) ||
    !("errors" in value) ||
    typeof value.allowed !== "boolean" ||
    !Array.isArray(value.errors) ||
    !value.errors.every(
      (error) =>
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        "message" in error &&
        typeof error.code === "string" &&
        Boolean(error.code) &&
        typeof error.message === "string" &&
        Boolean(error.message.trim())
    )
  ) {
    return false;
  }

  const analysis = value.analysis;

  return (
    analysis !== null &&
    typeof analysis === "object" &&
    "capacity" in analysis &&
    "entries" in analysis &&
    "remainingVolume" in analysis &&
    "usedVolume" in analysis &&
    (analysis.capacity === null || isNonnegativeFiniteNumber(analysis.capacity)) &&
    (analysis.remainingVolume === null ||
      (typeof analysis.remainingVolume === "number" &&
        Number.isFinite(analysis.remainingVolume))) &&
    isNonnegativeFiniteNumber(analysis.usedVolume) &&
    Array.isArray(analysis.entries) &&
    analysis.entries.every(isResolvedDroneBayEntry)
  );
}

function isResolvedDroneBayEntry(value: unknown) {
  return (
    value !== null &&
    typeof value === "object" &&
    "quantity" in value &&
    "typeId" in value &&
    "typeName" in value &&
    "volume" in value &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    typeof value.typeId === "number" &&
    Number.isInteger(value.typeId) &&
    value.typeId > 0 &&
    typeof value.typeName === "string" &&
    Boolean(value.typeName.trim()) &&
    isNonnegativeFiniteNumber(value.volume)
  );
}

function getPlacementRejectionMessage(rejection: FitModuleRejection) {
  switch (rejection) {
    case "empty-slot":
      return "The source socket is empty.";
    case "invalid-charge":
      return "The loaded-charge instance is invalid.";
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

function getPlacementRejectionCode(
  rejection: FitModuleRejection
): FitValidationIssueCode | undefined {
  switch (rejection) {
    case "occupied-slot":
      return "SLOT_OCCUPIED";
    case "missing-slot":
      return "INVALID_SLOT";
    default:
      return undefined;
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

function findFittedModule(fitState: FitState, address: FittingSlotAddress) {
  return fitState.slots[address.rack].find(
    (slot) => slot.index === address.index
  )?.module ?? null;
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

function createEmptyDroneBayAnalysis(capacity: number | null = null): DroneBayAnalysis {
  return {
    capacity,
    entries: [],
    remainingVolume: capacity,
    usedVolume: 0
  };
}

function createEmptyCargoHoldAnalysis(
  baseCapacity: number | null = null
): CargoHoldAnalysis {
  return {
    baseCapacity,
    entries: [],
    overBaseBy: 0,
    remainingBaseVolume: baseCapacity,
    usedVolume: 0
  };
}

function setCargoEntryQuantity(
  entries: CargoEntry[],
  typeId: number,
  quantity: number
) {
  if (quantity === 0) {
    return entries.filter((entry) => entry.typeId !== typeId);
  }

  const existingEntry = entries.some((entry) => entry.typeId === typeId);

  return existingEntry
    ? entries.map((entry) =>
        entry.typeId === typeId ? { ...entry, quantity } : entry
      )
    : [...entries, { quantity, typeId }];
}

function setDroneBayEntryQuantity(
  entries: DroneBayEntry[],
  typeId: number,
  quantity: number
) {
  if (quantity === 0) {
    return entries.filter((entry) => entry.typeId !== typeId);
  }

  const existingEntry = entries.some((entry) => entry.typeId === typeId);

  return existingEntry
    ? entries.map((entry) =>
        entry.typeId === typeId ? { ...entry, quantity } : entry
      )
    : [...entries, { quantity, typeId }];
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCargoHoldValidationResponse(
  value: unknown
): value is CargoHoldValidationResponse {
  if (
    value === null ||
    typeof value !== "object" ||
    !("allowed" in value) ||
    !("analysis" in value) ||
    !("errors" in value) ||
    !("warnings" in value) ||
    typeof value.allowed !== "boolean" ||
    !Array.isArray(value.errors) ||
    !Array.isArray(value.warnings)
  ) {
    return false;
  }

  const analysis = value.analysis;

  return (
    analysis !== null &&
    typeof analysis === "object" &&
    "baseCapacity" in analysis &&
    "entries" in analysis &&
    "overBaseBy" in analysis &&
    "remainingBaseVolume" in analysis &&
    "usedVolume" in analysis &&
    (analysis.baseCapacity === null ||
      isNonnegativeFiniteNumber(analysis.baseCapacity)) &&
    Array.isArray(analysis.entries) &&
    analysis.entries.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        "quantity" in entry &&
        "typeId" in entry &&
        "typeName" in entry &&
        "volume" in entry &&
        typeof entry.quantity === "number" &&
        Number.isSafeInteger(entry.quantity) &&
        entry.quantity > 0 &&
        typeof entry.typeId === "number" &&
        Number.isInteger(entry.typeId) &&
        entry.typeId > 0 &&
        typeof entry.typeName === "string" &&
        Boolean(entry.typeName.trim()) &&
        isNonnegativeFiniteNumber(entry.volume)
    ) &&
    isNonnegativeFiniteNumber(analysis.overBaseBy) &&
    (analysis.remainingBaseVolume === null ||
      (typeof analysis.remainingBaseVolume === "number" &&
        Number.isFinite(analysis.remainingBaseVolume))) &&
    isNonnegativeFiniteNumber(analysis.usedVolume) &&
    value.errors.every(isCargoValidationIssue) &&
    value.warnings.every(isCargoValidationIssue)
  );
}

function isCargoValidationIssue(value: unknown): value is CargoValidationIssue {
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
