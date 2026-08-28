import type {
  CargoHoldValidationResponse,
  DroneBayValidationResponse,
  FittedModuleAddress,
  FittingAnalysisResponse
} from "@/lib/fitting/types";
import { createSavedFittingFingerprint } from "./fingerprint";
import { validateSavedFittingMetadata } from "./metadata";
import type { SavedFittingOwner } from "./owner-resolution";
import type { SavedFittingReadRow } from "./repository-core";
import type {
  SavedFittingLoadCatalog,
  SavedFittingLoadDiagnostic,
  SavedFittingLoadRackSummary,
  SavedFittingLoadResult,
  SavedFittingLoadStaticHydrator
} from "./load-types";
import {
  savedFittingRackOrder,
  type SavedFittingApplicationCandidateV1,
  type SavedFittingRack,
  type SavedFittingSnapshotV1
} from "./types";

export type SavedFittingLoadRepository = {
  findByOwnerAndId(
    ownerEveIdentityId: string,
    fittingId: string
  ): Promise<SavedFittingReadRow | null>;
};

type ChargeValidationResult =
  | { maximumQuantity: number; status: "ready" }
  | { message: string; status: "error" };

export type SavedFittingLoadDependencies = {
  analyzeCargo: (input: {
    cargo: SavedFittingSnapshotV1["cargo"];
    hullTypeId: number;
  }) => Promise<CargoHoldValidationResponse>;
  analyzeFit: (input: {
    fittedModules: FittedModuleAddress[];
    hullTypeId: number;
  }) => Promise<FittingAnalysisResponse>;
  hydrateStatic: SavedFittingLoadStaticHydrator;
  validateCharge: (
    moduleTypeId: number,
    chargeTypeId: number
  ) => Promise<ChargeValidationResult>;
  validateDroneBay: (input: {
    drones: SavedFittingSnapshotV1["drones"];
    hullTypeId: number;
  }) => Promise<DroneBayValidationResponse>;
};

export async function loadSavedFittingFromRepository(
  owner: SavedFittingOwner,
  fittingId: string,
  repository: SavedFittingLoadRepository,
  dependencies: SavedFittingLoadDependencies
): Promise<SavedFittingLoadResult> {
  const row = await repository.findByOwnerAndId(owner.eveIdentityId, fittingId);

  if (!row) {
    return { code: "UNAVAILABLE", ok: false };
  }

  return resolveSavedFittingLoad(row, dependencies);
}

export async function resolveSavedFittingLoad(
  row: SavedFittingReadRow,
  dependencies: SavedFittingLoadDependencies
): Promise<Extract<SavedFittingLoadResult, { ok: true }>> {
  const original = {
    snapshot: structuredClone(row.snapshot),
    snapshotVersion: row.snapshotVersion
  };
  const savedFitting = {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name.trim(),
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString()
  };
  const metadata = validateSavedFittingMetadata({
    hullTypeId: row.hullTypeId,
    name: row.name,
    revision: row.revision,
    snapshot: row.snapshot,
    snapshotVersion: row.snapshotVersion
  });

  if (!metadata.ok) {
    const diagnostics: SavedFittingLoadDiagnostic[] = [
      ...metadata.issues.map((issue) => ({
        code: "SAVED_RECORD_INVALID" as const,
        disposition: "blocking" as const,
        domain: "snapshot" as const,
        message: `${issue.code}: ${issue.message}`,
        path: issue.path
      })),
      ...metadata.snapshotDiagnostics.map((diagnostic) => ({
        code: "SNAPSHOT_INVALID" as const,
        disposition: "blocking" as const,
        domain: "snapshot" as const,
        message: `${diagnostic.code}: ${diagnostic.message}`,
        path: diagnostic.path
      }))
    ];

    return {
      analysis: null,
      application: null,
      cargo: [],
      diagnostics,
      drones: [],
      editorBaseline: null,
      hull: null,
      ok: true,
      original,
      racks: emptyRackSummary(),
      savedFitting,
      status: "blocked"
    };
  }

  savedFitting.name = metadata.value.name;
  const snapshot = metadata.value.snapshot;
  const diagnostics = metadata.snapshotDiagnostics.map<SavedFittingLoadDiagnostic>(
    (diagnostic) => ({
      code:
        diagnostic.severity === "error"
          ? "SNAPSHOT_INVALID"
          : "SNAPSHOT_NORMALIZED",
      disposition: diagnostic.severity === "error" ? "blocking" : "review",
      domain: "snapshot",
      message: `${diagnostic.code}: ${diagnostic.message}`,
      path: diagnostic.path
    })
  );
  const catalog = await dependencies.hydrateStatic(snapshot);
  const names = catalogNames(catalog);
  const racks = summarizeRacks(snapshot, names.modules, names.charges);
  const drones = snapshot.drones.map((entry) => ({
    ...entry,
    typeName: names.drones.get(entry.typeId) ?? null
  }));
  const cargo = snapshot.cargo.map((entry) => ({
    ...entry,
    typeName: names.cargo.get(entry.typeId) ?? null
  }));
  const hull = catalog.hulls.find((entry) => entry.typeId === snapshot.hullTypeId);

  if (!hull) {
    diagnostics.push({
      code: "HULL_NOT_FOUND",
      disposition: "blocking",
      domain: "hull",
      message: `Saved fitting ${quote(savedFitting.name)} references missing hull type ${snapshot.hullTypeId}.`,
      typeId: snapshot.hullTypeId
    });
  }

  addMissingReferenceDiagnostics(snapshot, names, diagnostics);

  const topology = hull ? topologyForHull(hull) : null;
  const adjustedSlots = hull
    ? reconcileTopology(snapshot, topology!, diagnostics)
    : cloneSnapshotSlots(snapshot);
  const hullSummary = hull
    ? {
        currentTopology: topology!,
        savedTopology: topologyForSnapshot(snapshot),
        typeId: hull.typeId,
        typeName: hull.typeName
      }
    : null;

  if (hasBlockingDiagnostic(diagnostics)) {
    return blockedResult({
      cargo,
      diagnostics,
      drones,
      hull: hullSummary,
      original,
      racks,
      savedFitting
    });
  }

  const fittedModules = savedFittingRackOrder.flatMap((rack) =>
    adjustedSlots[rack].flatMap<FittedModuleAddress>((slot) =>
      slot.module
        ? [{ index: slot.index, rack, typeId: slot.module.typeId }]
        : []
    )
  );
  const loadedCharges = savedFittingRackOrder.flatMap((rack) =>
    adjustedSlots[rack].flatMap((slot) =>
      slot.module?.charge
        ? [{ charge: slot.module.charge, index: slot.index, moduleTypeId: slot.module.typeId, rack }]
        : []
    )
  );
  const chargeValidationByPair = new Map<string, Promise<ChargeValidationResult>>();

  for (const loaded of loadedCharges) {
    const key = `${loaded.moduleTypeId}:${loaded.charge.typeId}`;
    if (!chargeValidationByPair.has(key)) {
      chargeValidationByPair.set(
        key,
        dependencies.validateCharge(loaded.moduleTypeId, loaded.charge.typeId)
      );
    }
  }

  const [fitting, droneBay, cargoHold, chargeValidations] = await Promise.all([
    dependencies.analyzeFit({ fittedModules, hullTypeId: snapshot.hullTypeId }),
    snapshot.drones.length
      ? dependencies.validateDroneBay({
          drones: snapshot.drones,
          hullTypeId: snapshot.hullTypeId
        })
      : Promise.resolve<DroneBayValidationResponse>({
          allowed: true,
          analysis: {
            capacity: hull!.droneCapacity,
            entries: [],
            remainingVolume: hull!.droneCapacity,
            usedVolume: 0
          },
          errors: []
        }),
    dependencies.analyzeCargo({
      cargo: snapshot.cargo,
      hullTypeId: snapshot.hullTypeId
    }),
    resolveChargeValidations(chargeValidationByPair)
  ]);

  addChargeDiagnostics(loadedCharges, chargeValidations, diagnostics);
  addValidationDiagnostics(fitting, droneBay, cargoHold, diagnostics);

  const analysis = { cargoHold: cargoHold.analysis, droneBay: droneBay.analysis, fitting };

  if (hasBlockingDiagnostic(diagnostics)) {
    return blockedResult({
      analysis,
      cargo,
      diagnostics,
      drones,
      hull: hullSummary,
      original,
      racks,
      savedFitting
    });
  }

  const application: SavedFittingApplicationCandidateV1 = {
    cargo: snapshot.cargo.map((entry) => ({ ...entry })),
    drones: snapshot.drones.map((entry) => ({ ...entry })),
    hullTypeId: snapshot.hullTypeId,
    slots: adjustedSlots,
    topology: {
      highSlots: adjustedSlots.high.length,
      lowSlots: adjustedSlots.low.length,
      midSlots: adjustedSlots.mid.length,
      rigSlots: adjustedSlots.rig.length
    }
  };
  const fingerprint = createSavedFittingFingerprint(savedFitting.name, snapshot);

  if (!fingerprint.ok) {
    diagnostics.push({
      code: "SNAPSHOT_INVALID",
      disposition: "blocking",
      domain: "snapshot",
      message: "The migrated snapshot could not produce an editor baseline fingerprint."
    });
    return blockedResult({
      analysis,
      cargo,
      diagnostics,
      drones,
      hull: hullSummary,
      original,
      racks,
      savedFitting
    });
  }

  return {
    analysis,
    application,
    cargo,
    diagnostics,
    drones,
    editorBaseline: {
      baselineFingerprint: fingerprint.value,
      savedFittingId: savedFitting.id,
      savedRevision: savedFitting.revision
    },
    hull: hullSummary,
    ok: true,
    original,
    racks,
    savedFitting,
    status: diagnostics.some((entry) => entry.disposition === "review")
      ? "review"
      : "ready"
  };
}

function addMissingReferenceDiagnostics(
  snapshot: SavedFittingSnapshotV1,
  names: ReturnType<typeof catalogNames>,
  diagnostics: SavedFittingLoadDiagnostic[]
) {
  for (const rack of savedFittingRackOrder) {
    for (const slot of snapshot.slots[rack]) {
      if (slot.module && !names.modules.has(slot.module.typeId)) {
        diagnostics.push({
          code: "MODULE_NOT_FOUND",
          disposition: "blocking",
          domain: "fitting",
          index: slot.index,
          message: `Module type ${slot.module.typeId} is missing from saved ${rack} slot ${slot.index}.`,
          rack,
          typeId: slot.module.typeId
        });
      }
      if (slot.module?.charge && !names.charges.has(slot.module.charge.typeId)) {
        diagnostics.push({
          code: "CHARGE_NOT_FOUND",
          disposition: "blocking",
          domain: "charge",
          index: slot.index,
          message: `Charge type ${slot.module.charge.typeId} is missing from module type ${slot.module.typeId} in saved ${rack} slot ${slot.index}.`,
          moduleTypeId: slot.module.typeId,
          quantity: slot.module.charge.quantity,
          rack,
          typeId: slot.module.charge.typeId
        });
      }
    }
  }
  for (const entry of snapshot.drones) {
    if (!names.drones.has(entry.typeId)) {
      diagnostics.push({
        code: "DRONE_NOT_FOUND",
        disposition: "blocking",
        domain: "drone",
        message: `Drone Bay type ${entry.typeId} with quantity ${entry.quantity} is missing from the ordinary drone cache.`,
        quantity: entry.quantity,
        typeId: entry.typeId
      });
    }
  }
  for (const entry of snapshot.cargo) {
    if (!names.cargo.has(entry.typeId)) {
      diagnostics.push({
        code: "CARGO_NOT_FOUND",
        disposition: "blocking",
        domain: "cargo",
        message: `Cargo type ${entry.typeId} with quantity ${entry.quantity} is missing from the cargo-item cache.`,
        quantity: entry.quantity,
        typeId: entry.typeId
      });
    }
  }
}

function reconcileTopology(
  snapshot: SavedFittingSnapshotV1,
  current: Record<SavedFittingRack, number>,
  diagnostics: SavedFittingLoadDiagnostic[]
): SavedFittingApplicationCandidateV1["slots"] {
  return Object.fromEntries(
    savedFittingRackOrder.map((rack) => {
      const saved = snapshot.slots[rack];
      const currentCount = current[rack];
      const retained = saved.slice(0, currentCount).map(cloneSlot);

      for (let index = saved.length; index < currentCount; index += 1) {
        retained.push({ index, module: null });
        diagnostics.push({
          code: "HULL_SLOT_ADDED",
          disposition: "review",
          domain: "hull",
          index,
          message: `Current hull static data adds empty ${rack} slot ${index}.`,
          rack
        });
      }

      for (const removed of saved.slice(currentCount)) {
        diagnostics.push({
          code: removed.module
            ? "HULL_OCCUPIED_SLOT_REMOVED"
            : "HULL_EMPTY_SLOT_REMOVED",
          disposition: removed.module ? "blocking" : "review",
          domain: "hull",
          index: removed.index,
          message: removed.module
            ? `Current hull static data removes occupied ${rack} slot ${removed.index}; its module will not be moved or omitted.`
            : `Current hull static data removes saved empty ${rack} slot ${removed.index}.`,
          moduleTypeId: removed.module?.typeId,
          rack,
          typeId: removed.module?.typeId
        });
      }

      return [rack, retained];
    })
  ) as SavedFittingApplicationCandidateV1["slots"];
}

async function resolveChargeValidations(
  validations: Map<string, Promise<ChargeValidationResult>>
) {
  const resolved = new Map<string, ChargeValidationResult>();
  await Promise.all(
    Array.from(validations, async ([key, validation]) => {
      resolved.set(key, await validation);
    })
  );
  return resolved;
}

function addChargeDiagnostics(
  loadedCharges: Array<{
    charge: { quantity: number; typeId: number };
    index: number;
    moduleTypeId: number;
    rack: SavedFittingRack;
  }>,
  validations: Map<string, ChargeValidationResult>,
  diagnostics: SavedFittingLoadDiagnostic[]
) {
  for (const loaded of loadedCharges) {
    const result = validations.get(`${loaded.moduleTypeId}:${loaded.charge.typeId}`)!;
    if (result.status === "error") {
      diagnostics.push({
        code: "CHARGE_INCOMPATIBLE",
        disposition: "blocking",
        domain: "charge",
        index: loaded.index,
        message: result.message,
        moduleTypeId: loaded.moduleTypeId,
        quantity: loaded.charge.quantity,
        rack: loaded.rack,
        typeId: loaded.charge.typeId
      });
    } else if (loaded.charge.quantity > result.maximumQuantity) {
      diagnostics.push({
        code: "CHARGE_QUANTITY_DRIFT",
        disposition: "blocking",
        domain: "charge",
        index: loaded.index,
        message: `Saved quantity ${loaded.charge.quantity} exceeds the current authoritative maximum ${result.maximumQuantity}.`,
        moduleTypeId: loaded.moduleTypeId,
        quantity: loaded.charge.quantity,
        rack: loaded.rack,
        typeId: loaded.charge.typeId
      });
    }
  }
}

function addValidationDiagnostics(
  fitting: FittingAnalysisResponse,
  droneBay: DroneBayValidationResponse,
  cargoHold: CargoHoldValidationResponse,
  diagnostics: SavedFittingLoadDiagnostic[]
) {
  for (const issue of fitting.errors) {
    diagnostics.push(validationDiagnostic("FIT_VALIDATION", "blocking", "fitting", issue));
  }
  for (const issue of fitting.warnings) {
    diagnostics.push(validationDiagnostic("FIT_WARNING", "review", "fitting", issue));
  }
  for (const issue of droneBay.errors) {
    diagnostics.push(validationDiagnostic("DRONE_BAY_VALIDATION", "blocking", "drone", issue));
  }
  for (const issue of cargoHold.errors) {
    diagnostics.push(validationDiagnostic("CARGO_HOLD_VALIDATION", "blocking", "cargo", issue));
  }
  for (const issue of cargoHold.warnings) {
    diagnostics.push(validationDiagnostic("CARGO_HOLD_WARNING", "review", "cargo", issue));
  }
}

function validationDiagnostic(
  code: SavedFittingLoadDiagnostic["code"],
  disposition: SavedFittingLoadDiagnostic["disposition"],
  domain: SavedFittingLoadDiagnostic["domain"],
  issue: { code: string; message: string }
): SavedFittingLoadDiagnostic {
  return { code, disposition, domain, message: `${issue.code}: ${issue.message}` };
}

function catalogNames(catalog: SavedFittingLoadCatalog) {
  return {
    cargo: new Map(catalog.cargo.map((entry) => [entry.typeId, entry.typeName])),
    charges: new Map(catalog.charges.map((entry) => [entry.typeId, entry.typeName])),
    drones: new Map(catalog.drones.map((entry) => [entry.typeId, entry.typeName])),
    modules: new Map(catalog.modules.map((entry) => [entry.typeId, entry.typeName]))
  };
}

function summarizeRacks(
  snapshot: SavedFittingSnapshotV1,
  moduleNames: Map<number, string>,
  chargeNames: Map<number, string>
): SavedFittingLoadRackSummary {
  return Object.fromEntries(
    savedFittingRackOrder.map((rack) => [
      rack,
      snapshot.slots[rack].map((slot) => ({
        index: slot.index,
        module: slot.module
          ? {
              charge: slot.module.charge
                ? {
                    ...slot.module.charge,
                    typeName: chargeNames.get(slot.module.charge.typeId) ?? null
                  }
                : null,
              typeId: slot.module.typeId,
              typeName: moduleNames.get(slot.module.typeId) ?? null
            }
          : null
      }))
    ])
  ) as SavedFittingLoadRackSummary;
}

function topologyForHull(hull: SavedFittingLoadCatalog["hulls"][number]) {
  return {
    high: hull.highSlots,
    low: hull.lowSlots,
    mid: hull.midSlots,
    rig: hull.rigSlots
  };
}

function topologyForSnapshot(snapshot: SavedFittingSnapshotV1) {
  return Object.fromEntries(
    savedFittingRackOrder.map((rack) => [rack, snapshot.slots[rack].length])
  ) as Record<SavedFittingRack, number>;
}

function cloneSnapshotSlots(snapshot: SavedFittingSnapshotV1) {
  return Object.fromEntries(
    savedFittingRackOrder.map((rack) => [
      rack,
      snapshot.slots[rack].map(cloneSlot)
    ])
  ) as SavedFittingApplicationCandidateV1["slots"];
}

function cloneSlot(slot: SavedFittingSnapshotV1["slots"][SavedFittingRack][number]) {
  return {
    index: slot.index,
    module: slot.module
      ? {
          charge: slot.module.charge ? { ...slot.module.charge } : null,
          typeId: slot.module.typeId
        }
      : null
  };
}

function emptyRackSummary(): SavedFittingLoadRackSummary {
  return { high: [], low: [], mid: [], rig: [] };
}

function hasBlockingDiagnostic(diagnostics: SavedFittingLoadDiagnostic[]) {
  return diagnostics.some((entry) => entry.disposition === "blocking");
}

function blockedResult(input: {
  analysis?: Extract<SavedFittingLoadResult, { ok: true }>["analysis"];
  cargo: Extract<SavedFittingLoadResult, { ok: true }>["cargo"];
  diagnostics: SavedFittingLoadDiagnostic[];
  drones: Extract<SavedFittingLoadResult, { ok: true }>["drones"];
  hull: Extract<SavedFittingLoadResult, { ok: true }>["hull"];
  original: Extract<SavedFittingLoadResult, { ok: true }>["original"];
  racks: SavedFittingLoadRackSummary;
  savedFitting: Extract<SavedFittingLoadResult, { ok: true }>["savedFitting"];
}): Extract<SavedFittingLoadResult, { ok: true }> {
  return {
    analysis: input.analysis ?? null,
    application: null,
    cargo: input.cargo,
    diagnostics: input.diagnostics,
    drones: input.drones,
    editorBaseline: null,
    hull: input.hull,
    ok: true,
    original: input.original,
    racks: input.racks,
    savedFitting: input.savedFitting,
    status: "blocked"
  };
}

function quote(value: string) {
  return JSON.stringify(value);
}
