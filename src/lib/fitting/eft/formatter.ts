import type {
  EftExportDocument,
  EftExportCargo,
  EftExportDrone,
  EftExportSlot,
  EftSupportedRack,
} from "./types";

const EMPTY_MARKERS: Record<EftSupportedRack, string> = {
  low: "[Empty low slot]",
  mid: "[Empty med slot]",
  high: "[Empty high slot]",
  rig: "[Empty rig slot]",
};

export class EftFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EftFormatError";
  }
}

function canonicalName(value: string, field: string): string {
  const name = value.trim();
  if (!name) {
    throw new EftFormatError(`${field} must not be empty.`);
  }
  if (/\r|\n/.test(name)) {
    throw new EftFormatError(`${field} must not contain line breaks.`);
  }
  return name;
}

function orderedSlots(rack: EftSupportedRack, slots: EftExportSlot[]): EftExportSlot[] {
  const ordered = [...slots].sort((left, right) => left.index - right.index);
  for (let index = 0; index < ordered.length; index += 1) {
    const slot = ordered[index];
    if (!Number.isSafeInteger(slot.index) || slot.index !== index) {
      throw new EftFormatError(`${rack} slots must contain each explicit index from 0 through ${ordered.length - 1}.`);
    }
  }
  return ordered;
}

function formatSlot(rack: EftSupportedRack, slot: EftExportSlot): string {
  if (slot.moduleName === null) {
    if (slot.chargeName !== null) {
      throw new EftFormatError(`An empty ${rack} slot cannot contain a charge.`);
    }
    return EMPTY_MARKERS[rack];
  }

  const moduleName = canonicalName(slot.moduleName, `${rack} module name`);
  if (slot.chargeName === null) {
    return moduleName;
  }
  return `${moduleName}, ${canonicalName(slot.chargeName, `${rack} charge name`)}`;
}

function compareDrones(left: EftExportDrone, right: EftExportDrone): number {
  if (left.typeName < right.typeName) return -1;
  if (left.typeName > right.typeName) return 1;
  return left.typeId - right.typeId;
}

function compareCargo(left: EftExportCargo, right: EftExportCargo): number {
  if (left.typeName < right.typeName) return -1;
  if (left.typeName > right.typeName) return 1;
  return left.typeId - right.typeId;
}

function formatDrone(drone: EftExportDrone): string {
  if (!Number.isSafeInteger(drone.typeId) || drone.typeId <= 0) {
    throw new EftFormatError("Drone typeId must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(drone.quantity) || drone.quantity <= 0) {
    throw new EftFormatError("Drone quantity must be a positive safe integer.");
  }
  return `${canonicalName(drone.typeName, "Drone type name")} x${drone.quantity}`;
}

function normalizeCargo(cargo: EftExportCargo[]): EftExportCargo[] {
  const byTypeId = new Map<number, EftExportCargo>();

  for (const entry of cargo) {
    if (!Number.isSafeInteger(entry.typeId) || entry.typeId <= 0) {
      throw new EftFormatError("Cargo typeId must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity <= 0) {
      throw new EftFormatError("Cargo quantity must be a positive safe integer.");
    }
    const typeName = canonicalName(entry.typeName, "Cargo type name");
    const current = byTypeId.get(entry.typeId);
    if (current && current.typeName !== typeName) {
      throw new EftFormatError(`Cargo type ${entry.typeId} has inconsistent type names.`);
    }
    const quantity = (current?.quantity ?? 0) + entry.quantity;
    if (!Number.isSafeInteger(quantity)) {
      throw new EftFormatError(`Cargo quantity for ${typeName} exceeds the safe integer range.`);
    }
    byTypeId.set(entry.typeId, { quantity, typeId: entry.typeId, typeName });
  }

  return [...byTypeId.values()].sort(compareCargo);
}

/**
 * Formats the currently representable fitting subset as deterministic EFT text.
 * The returned text uses LF line endings and always ends with exactly one newline.
 */
export function formatEft(document: EftExportDocument): string {
  const hullName = canonicalName(document.hullName, "Hull name");
  const fitName = document.fitName.trim();
  if (/\r|\n/.test(fitName)) {
    throw new EftFormatError("Fit name must not contain line breaks.");
  }

  const lines: string[] = [`[${hullName}, ${fitName}]`];
  for (const rack of ["low", "mid", "high", "rig"] as const) {
    lines.push(...orderedSlots(rack, document.slots[rack]).map((slot) => formatSlot(rack, slot)));
    lines.push("");
  }

  // The rig separator above plus these two empty sections advance past unsupported
  // subsystem and service sections to the drone/fighter bay section.
  lines.push("", "");
  lines.push(...[...document.drones].sort(compareDrones).map(formatDrone));
  const cargo = normalizeCargo(document.cargo);
  if (cargo.length) {
    lines.push("");
    lines.push(...cargo.map((entry) => `${entry.typeName} x${entry.quantity}`));
  }

  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}
