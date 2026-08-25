import {
  savedFittingRackOrder,
  type SavedFittingDomainResult,
  type SavedFittingQuantityEntry,
  type SavedFittingRack,
  type SavedFittingSlotV1,
  type SavedFittingSnapshotDiagnostic,
  type SavedFittingSnapshotDiagnosticCode,
  type SavedFittingSnapshotV1
} from "./types";

const rootFields = ["cargo", "drones", "hullTypeId", "slots"] as const;
const quantityFields = ["quantity", "typeId"] as const;
const slotFields = ["index", "module"] as const;
const moduleFields = ["charge", "typeId"] as const;

/**
 * Strictly validates and canonicalizes a V1 snapshot without consulting static
 * EVE data. Input is never mutated. Duplicate drone/cargo rows are aggregated;
 * all other structural faults are rejected.
 */
export function canonicalizeSavedFittingSnapshot(
  input: unknown
): SavedFittingDomainResult<SavedFittingSnapshotV1> {
  const diagnostics: SavedFittingSnapshotDiagnostic[] = [];
  const root = readObject(input, "$", diagnostics);

  if (!root) {
    return failure(diagnostics);
  }

  inspectFields(root, rootFields, "$", diagnostics);
  const hullTypeId = readPositiveTypeId(root.hullTypeId, "hullTypeId", diagnostics);
  const slotsObject = readObject(root.slots, "slots", diagnostics);
  const slots = {} as Record<SavedFittingRack, SavedFittingSlotV1[]>;

  if (slotsObject) {
    inspectFields(slotsObject, savedFittingRackOrder, "slots", diagnostics);

    for (const rack of savedFittingRackOrder) {
      slots[rack] = readRack(slotsObject[rack], rack, diagnostics);
    }
  }

  const drones = readQuantityEntries(root.drones, "drones", diagnostics);
  const cargo = readQuantityEntries(root.cargo, "cargo", diagnostics);

  if (
    hullTypeId === null ||
    !slotsObject ||
    hasErrors(diagnostics)
  ) {
    return failure(diagnostics);
  }

  return {
    diagnostics,
    ok: true,
    value: {
      cargo,
      drones,
      hullTypeId,
      slots: {
        high: slots.high,
        mid: slots.mid,
        low: slots.low,
        rig: slots.rig
      }
    }
  };
}

function readRack(
  value: unknown,
  rack: SavedFittingRack,
  diagnostics: SavedFittingSnapshotDiagnostic[]
): SavedFittingSlotV1[] {
  const path = `slots.${rack}`;

  if (!Array.isArray(value)) {
    addDiagnostic(
      diagnostics,
      "MALFORMED_RACK_TOPOLOGY",
      path,
      `${rack} slots must be an array.`
    );
    return [];
  }

  const slots: SavedFittingSlotV1[] = [];
  const indices = new Set<number>();

  value.forEach((item, sourceIndex) => {
    const slotPath = `${path}[${sourceIndex}]`;
    const slot = readObject(item, slotPath, diagnostics);

    if (!slot) {
      return;
    }

    inspectFields(slot, slotFields, slotPath, diagnostics);
    const index = readSlotIndex(slot.index, `${slotPath}.index`, diagnostics);
    const fittedModule = readModule(
      slot.module,
      `${slotPath}.module`,
      diagnostics
    );

    if (index === null) {
      return;
    }

    if (indices.has(index)) {
      addDiagnostic(
        diagnostics,
        "DUPLICATE_SLOT_INDEX",
        `${slotPath}.index`,
        `${rack} slot index ${index} appears more than once.`
      );
    }

    indices.add(index);

    if (fittedModule === undefined) {
      return;
    }

    slots.push({ index, module: fittedModule });
  });

  for (let index = 0; index < value.length; index += 1) {
    if (!indices.has(index)) {
      addDiagnostic(
        diagnostics,
        "MISSING_SLOT_INDEX",
        path,
        `${rack} rack is missing contiguous slot index ${index}.`
      );
    }
  }

  for (const index of indices) {
    if (index >= value.length) {
      addDiagnostic(
        diagnostics,
        "MALFORMED_RACK_TOPOLOGY",
        path,
        `${rack} slot index ${index} is outside the contiguous zero-based topology.`
      );
    }
  }

  return slots.toSorted((left, right) => left.index - right.index);
}

function readModule(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
): SavedFittingSlotV1["module"] | undefined {
  if (value === null) {
    return null;
  }

  const fittedModule = readObject(value, path, diagnostics);

  if (!fittedModule) {
    return undefined;
  }

  inspectFields(fittedModule, moduleFields, path, diagnostics);

  const typeId = readPositiveTypeId(
    fittedModule.typeId,
    `${path}.typeId`,
    diagnostics
  );
  const charge = readCharge(
    fittedModule.charge,
    `${path}.charge`,
    diagnostics
  );

  if (typeId === null || charge === undefined) {
    return undefined;
  }

  return { charge, typeId };
}

function readCharge(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
): SavedFittingQuantityEntry | null | undefined {
  if (value === null) {
    return null;
  }

  const charge = readObject(value, path, diagnostics);

  if (!charge) {
    return undefined;
  }

  inspectFields(charge, quantityFields, path, diagnostics);
  const typeId = readPositiveTypeId(charge.typeId, `${path}.typeId`, diagnostics);
  const quantity = readPositiveQuantity(
    charge.quantity,
    `${path}.quantity`,
    diagnostics
  );

  return typeId === null || quantity === null ? undefined : { quantity, typeId };
}

function readQuantityEntries(
  value: unknown,
  path: "cargo" | "drones",
  diagnostics: SavedFittingSnapshotDiagnostic[]
): SavedFittingQuantityEntry[] {
  if (!Array.isArray(value)) {
    addDiagnostic(
      diagnostics,
      "MALFORMED_SNAPSHOT",
      path,
      `${path} must be an array.`
    );
    return [];
  }

  const quantities = new Map<number, number>();
  const duplicateTypeIds = new Set<number>();

  value.forEach((item, index) => {
    const entryPath = `${path}[${index}]`;
    const entry = readObject(item, entryPath, diagnostics);

    if (!entry) {
      return;
    }

    inspectFields(entry, quantityFields, entryPath, diagnostics);
    const typeId = readPositiveTypeId(entry.typeId, `${entryPath}.typeId`, diagnostics);
    const quantity = readPositiveQuantity(
      entry.quantity,
      `${entryPath}.quantity`,
      diagnostics
    );

    if (typeId === null || quantity === null) {
      return;
    }

    const current = quantities.get(typeId) ?? 0;

    if (quantity > Number.MAX_SAFE_INTEGER - current) {
      addDiagnostic(
        diagnostics,
        "QUANTITY_OVERFLOW",
        entryPath,
        `Aggregated quantity for type ${typeId} exceeds Number.MAX_SAFE_INTEGER.`
      );
      return;
    }

    if (quantities.has(typeId)) {
      duplicateTypeIds.add(typeId);
    }

    quantities.set(typeId, current + quantity);
  });

  for (const typeId of duplicateTypeIds) {
    addDiagnostic(
      diagnostics,
      "DUPLICATE_ENTRY_AGGREGATED",
      path,
      `Duplicate ${path} entries for type ${typeId} were aggregated.`,
      "warning"
    );
  }

  return Array.from(quantities, ([typeId, quantity]) => ({ quantity, typeId }))
    .toSorted((left, right) => left.typeId - right.typeId);
}

function readObject(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    addDiagnostic(
      diagnostics,
      "MALFORMED_SNAPSHOT",
      path,
      `${path} must be an object.`
    );
    return null;
  }

  return value as Record<string, unknown>;
}

function inspectFields(
  value: Record<string, unknown>,
  expectedFields: readonly string[],
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
) {
  const expected = new Set(expectedFields);

  for (const field of expectedFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      addDiagnostic(
        diagnostics,
        "MALFORMED_SNAPSHOT",
        `${path}.${field}`,
        `Required field ${field} is missing.`
      );
    }
  }

  for (const field of Object.keys(value)) {
    if (!expected.has(field)) {
      addDiagnostic(
        diagnostics,
        field === "instanceId" ? "RUNTIME_FIELD_PRESENT" : "UNEXPECTED_FIELD",
        `${path}.${field}`,
        field === "instanceId"
          ? "Runtime module instanceId must not be persisted."
          : `Unexpected field ${field} is not part of SavedFittingSnapshotV1.`
      );
    }
  }
}

function readPositiveTypeId(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    addDiagnostic(
      diagnostics,
      "INVALID_TYPE_ID",
      path,
      `${path} must be a positive safe integer.`
    );
    return null;
  }

  return value as number;
}

function readSlotIndex(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    addDiagnostic(
      diagnostics,
      "INVALID_SLOT_INDEX",
      path,
      `${path} must be a non-negative safe integer.`
    );
    return null;
  }

  return value as number;
}

function readPositiveQuantity(
  value: unknown,
  path: string,
  diagnostics: SavedFittingSnapshotDiagnostic[]
) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    addDiagnostic(
      diagnostics,
      "INVALID_QUANTITY",
      path,
      `${path} must be a positive safe integer.`
    );
    return null;
  }

  return value as number;
}

function addDiagnostic(
  diagnostics: SavedFittingSnapshotDiagnostic[],
  code: SavedFittingSnapshotDiagnosticCode,
  path: string,
  message: string,
  severity: SavedFittingSnapshotDiagnostic["severity"] = "error"
) {
  diagnostics.push({ code, message, path, severity });
}

function hasErrors(diagnostics: SavedFittingSnapshotDiagnostic[]) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function failure<T>(
  diagnostics: SavedFittingSnapshotDiagnostic[]
): SavedFittingDomainResult<T> {
  return { diagnostics, ok: false, value: null };
}
