import { formatEft } from "./formatter";
import {
  EFT_SUPPORTED_RACKS,
  type EftExportDocument,
  type EftExportResponse,
  type EftExportSnapshot,
  type EftSupportedRack,
} from "./types";

type NamedRecord = { typeId: number; typeName: string };

export type EftExportCatalog = {
  cargo: NamedRecord[];
  charges: NamedRecord[];
  drones: NamedRecord[];
  hulls: Array<
    NamedRecord & {
      highSlots: number;
      lowSlots: number;
      midSlots: number;
      rigSlots: number;
    }
  >;
  modules: Array<NamedRecord & { rack: EftSupportedRack | "subsystem" }>;
};

export class EftExportHydrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EftExportHydrationError";
  }
}

export function validateEftExportSnapshot(value: unknown): EftExportSnapshot {
  if (!isRecord(value)) {
    throw new EftExportHydrationError("A JSON EFT export snapshot is required.");
  }
  if (!isPositiveInteger(value.hullTypeId)) {
    throw new EftExportHydrationError("hullTypeId must be a positive integer.");
  }
  if (
    typeof value.fitName !== "string" ||
    value.fitName.length > 120 ||
    /\r|\n/.test(value.fitName)
  ) {
    throw new EftExportHydrationError("fitName must be a string of at most 120 characters.");
  }
  const rawSlots = value.slots;
  if (!isRecord(rawSlots)) {
    throw new EftExportHydrationError("slots must contain explicit fitting racks.");
  }

  const slots = Object.fromEntries(
    EFT_SUPPORTED_RACKS.map((rack) => [rack, validateRack(rawSlots[rack], rack)]),
  ) as EftExportSnapshot["slots"];

  return {
    cargo: validateQuantityEntries(value.cargo, "cargo"),
    drones: validateQuantityEntries(value.drones, "drones"),
    fitName: value.fitName,
    hullTypeId: value.hullTypeId,
    slots,
  };
}

export function hydrateAndFormatEftExport(
  snapshot: EftExportSnapshot,
  catalog: EftExportCatalog,
): EftExportResponse {
  const validated = validateEftExportSnapshot(snapshot);
  const hull = resolveUnique(catalog.hulls, validated.hullTypeId, "hull");
  const expectedTopology: Record<EftSupportedRack, number> = {
    high: hull.highSlots,
    low: hull.lowSlots,
    mid: hull.midSlots,
    rig: hull.rigSlots,
  };

  const moduleByTypeId = uniqueRecordMap(catalog.modules, "module");
  const chargeByTypeId = uniqueRecordMap(catalog.charges, "charge");
  const droneByTypeId = uniqueRecordMap(catalog.drones, "drone");
  const cargoByTypeId = uniqueRecordMap(catalog.cargo, "cargo");

  const slots = Object.fromEntries(
    EFT_SUPPORTED_RACKS.map((rack) => {
      if (validated.slots[rack].length !== expectedTopology[rack]) {
        throw new EftExportHydrationError(
          `${hull.typeName} requires ${expectedTopology[rack]} explicit ${rack} slots.`,
        );
      }
      return [
        rack,
        validated.slots[rack].map((slot) => {
          if (!slot.module) {
            return { chargeName: null, index: slot.index, moduleName: null };
          }
          const moduleRecord = requireRecord(moduleByTypeId, slot.module.typeId, "module");
          if (moduleRecord.rack !== rack) {
            throw new EftExportHydrationError(
              `${moduleRecord.typeName} is authoritative for the ${moduleRecord.rack} rack, not ${rack}.`,
            );
          }
          const chargeName = slot.module.chargeTypeId === null
            ? null
            : requireRecord(chargeByTypeId, slot.module.chargeTypeId, "charge").typeName;
          return { chargeName, index: slot.index, moduleName: moduleRecord.typeName };
        }),
      ];
    }),
  ) as EftExportDocument["slots"];

  const fitName = validated.fitName.trim() || hull.typeName;
  const document: EftExportDocument = {
    cargo: validated.cargo.map((entry) => ({
      ...entry,
      typeName: requireRecord(cargoByTypeId, entry.typeId, "cargo").typeName,
    })),
    drones: validated.drones.map((entry) => ({
      ...entry,
      typeName: requireRecord(droneByTypeId, entry.typeId, "drone").typeName,
    })),
    fitName,
    hullName: hull.typeName,
    slots,
  };

  return { eftText: formatEft(document), fitName, hullName: hull.typeName };
}

function validateRack(value: unknown, rack: EftSupportedRack) {
  if (!Array.isArray(value) || value.length > 64) {
    throw new EftExportHydrationError(`${rack} slots must be an array of at most 64 entries.`);
  }
  return value.map((slot, index) => {
    if (!isRecord(slot) || slot.index !== index || !("module" in slot)) {
      throw new EftExportHydrationError(`${rack} slots must contain each explicit index in order.`);
    }
    if (slot.module === null) return { index, module: null };
    if (!isRecord(slot.module) || !isPositiveInteger(slot.module.typeId)) {
      throw new EftExportHydrationError(`${rack} slot ${index + 1} has an invalid module typeId.`);
    }
    const chargeTypeId = slot.module.chargeTypeId;
    if (chargeTypeId !== null && !isPositiveInteger(chargeTypeId)) {
      throw new EftExportHydrationError(`${rack} slot ${index + 1} has an invalid charge typeId.`);
    }
    return { index, module: { chargeTypeId, typeId: slot.module.typeId } };
  });
}

function validateQuantityEntries(value: unknown, field: "cargo" | "drones") {
  if (!Array.isArray(value) || value.length > 512) {
    throw new EftExportHydrationError(`${field} must be an array of at most 512 entries.`);
  }
  const seen = new Set<number>();
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      !isPositiveInteger(entry.typeId) ||
      !isPositiveInteger(entry.quantity) ||
      seen.has(entry.typeId)
    ) {
      throw new EftExportHydrationError(
        `${field} entries require unique positive typeIds and positive quantities.`,
      );
    }
    seen.add(entry.typeId);
    return { quantity: entry.quantity, typeId: entry.typeId };
  });
}

function uniqueRecordMap<T extends NamedRecord>(records: T[], kind: string) {
  const result = new Map<number, T>();
  for (const record of records) {
    if (result.has(record.typeId)) {
      throw new EftExportHydrationError(
        `Authoritative ${kind} type ${record.typeId} is ambiguous.`,
      );
    }
    result.set(record.typeId, record);
  }
  return result;
}

function resolveUnique<T extends NamedRecord>(records: T[], typeId: number, kind: string) {
  return requireRecord(uniqueRecordMap(records, kind), typeId, kind);
}

function requireRecord<T extends NamedRecord>(records: Map<number, T>, typeId: number, kind: string) {
  const record = records.get(typeId);
  if (!record) {
    throw new EftExportHydrationError(
      `Authoritative ${kind} type ${typeId} is missing from the fitting cache.`,
    );
  }
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
