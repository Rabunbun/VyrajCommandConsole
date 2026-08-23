import type {
  DroneBayValidationResponse,
  FittedModuleAddress,
  FittingAnalysisResponse,
} from "@/lib/fitting/types";
import type {
  EftImportDiagnostic,
  EftImportDiagnosticCode,
  EftImportStatus,
  EftParseDiagnostic,
  EftParsedDocument,
  EftParsedModuleLine,
  EftResolutionResult,
  EftSourceLine,
  EftSupportedRack,
  ResolvedEftDrone,
  ResolvedEftSlot,
} from "./types";

type NamedCatalogRecord = {
  typeId: number;
  typeName: string;
};

export type EftHullCatalogRecord = NamedCatalogRecord & {
  droneCapacity: number | null;
  highSlots: number;
  lowSlots: number;
  midSlots: number;
  rigSlots: number;
};

export type EftModuleCatalogRecord = NamedCatalogRecord & {
  rack: EftSupportedRack | "subsystem";
};

export type EftChargeCatalogRecord = NamedCatalogRecord;
export type EftDroneCatalogRecord = NamedCatalogRecord;

export type EftResolutionCatalog = {
  charges: EftChargeCatalogRecord[];
  drones: EftDroneCatalogRecord[];
  hulls: EftHullCatalogRecord[];
  modules: EftModuleCatalogRecord[];
};

type ChargeValidationResult =
  | { quantity: number; status: "ready" }
  | { message: string; status: "error" };

export type EftDraftValidationDependencies = {
  analyzeFit: (input: {
    fittedModules: FittedModuleAddress[];
    hullTypeId: number;
  }) => Promise<FittingAnalysisResponse>;
  validateCharge: (
    moduleTypeId: number,
    chargeTypeId: number,
  ) => Promise<ChargeValidationResult>;
  validateDroneBay: (input: {
    drones: ResolvedEftDrone[];
    hullTypeId: number;
  }) => Promise<DroneBayValidationResponse>;
};

type NameResolution<T extends NamedCatalogRecord> =
  | { kind: "resolved"; normalized: boolean; record: T }
  | { kind: "ambiguous"; records: T[] }
  | { kind: "unresolved" };

type PendingSlot = {
  chargeTypeId: number | null;
  index: number;
  moduleTypeId: number | null;
  rack: EftSupportedRack;
  source: EftSourceLine | null;
};

type ResolvedModuleLine = {
  chargeTypeId: number | null;
  moduleTypeId: number;
};

const RACKS = ["low", "mid", "high", "rig"] as const;

export async function resolveAndValidateEftDraft(input: {
  catalog: EftResolutionCatalog;
  dependencies: EftDraftValidationDependencies;
  document: EftParsedDocument;
  parseDiagnostics?: EftParseDiagnostic[];
}): Promise<EftResolutionResult> {
  const diagnostics = convertBlockingParseDiagnostics(input.parseDiagnostics ?? []);

  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { diagnostics, draft: null, status: "error" };
  }

  const hullResolution = resolveName(input.document.header.hullName, input.catalog.hulls);
  if (hullResolution.kind !== "resolved") {
    diagnostics.push(
      makeDiagnostic(
        "error",
        hullResolution.kind === "ambiguous" ? "HULL_AMBIGUOUS" : "HULL_UNRESOLVED",
        hullResolution.kind === "ambiguous"
          ? `Hull name ${quote(input.document.header.hullName)} matches multiple authoritative hull records.`
          : `Hull name ${quote(input.document.header.hullName)} is not present in the authoritative fitting-hull cache.`,
        input.document.header.source,
      ),
    );
    return { diagnostics, draft: null, status: "error" };
  }

  addNormalizationWarning(
    diagnostics,
    hullResolution,
    input.document.header.hullName,
    "hull",
    input.document.header.source,
  );
  addUnsupportedDiagnostics(input.document, diagnostics);

  const hull = hullResolution.record;
  const rackCapacity: Record<EftSupportedRack, number> = {
    high: hull.highSlots,
    low: hull.lowSlots,
    mid: hull.midSlots,
    rig: hull.rigSlots,
  };
  const pendingSlots = Object.fromEntries(
    RACKS.map((rack) => [
      rack,
      Array.from({ length: rackCapacity[rack] }, (_, index): PendingSlot => ({
        chargeTypeId: null,
        index,
        moduleTypeId: null,
        rack,
        source: null,
      })),
    ]),
  ) as Record<EftSupportedRack, PendingSlot[]>;
  let resolutionFailed = false;

  for (const rack of RACKS) {
    const parsedLines = input.document.slots[rack];
    if (parsedLines.length > rackCapacity[rack]) {
      const firstOverflow = parsedLines[rackCapacity[rack]];
      diagnostics.push(
        makeDiagnostic(
          "error",
          "TOO_MANY_SLOTS",
          `${hull.typeName} has ${rackCapacity[rack]} ${rack} slot${rackCapacity[rack] === 1 ? "" : "s"}, but the EFT section contains ${parsedLines.length} entries.`,
          firstOverflow?.source ?? null,
        ),
      );
      resolutionFailed = true;
    }

    for (const parsedLine of parsedLines.slice(0, rackCapacity[rack])) {
      if (parsedLine.kind === "empty") {
        continue;
      }

      if (parsedLine.offlineRequested) {
        diagnostics.push(
          makeDiagnostic(
            "warning",
            "OFFLINE_UNSUPPORTED",
            `${quote(parsedLine.unresolvedText)} requested /offline, but current fitting state cannot preserve module online state.`,
            parsedLine.source,
          ),
        );
      }

      const resolved = resolveModuleLine(
        parsedLine,
        input.catalog.modules,
        input.catalog.charges,
        diagnostics,
      );
      if (!resolved) {
        resolutionFailed = true;
        continue;
      }

      pendingSlots[rack][parsedLine.index] = {
        chargeTypeId: resolved.chargeTypeId,
        index: parsedLine.index,
        moduleTypeId: resolved.moduleTypeId,
        rack,
        source: parsedLine.source,
      };
    }
  }

  const drones = resolveDrones(input.document, input.catalog.drones, diagnostics);
  if (!drones) {
    resolutionFailed = true;
  }

  const chargeQuantities = await validateLoadedCharges(
    pendingSlots,
    input.dependencies,
    diagnostics,
  );
  if (!chargeQuantities) {
    resolutionFailed = true;
  }

  if (resolutionFailed || !drones || !chargeQuantities) {
    return { diagnostics, draft: null, status: "error" };
  }

  const slots = Object.fromEntries(
    RACKS.map((rack) => [
      rack,
      pendingSlots[rack].map<ResolvedEftSlot>((slot) => ({
        index: slot.index,
        module:
          slot.moduleTypeId === null
            ? null
            : {
                charge:
                  slot.chargeTypeId === null
                    ? null
                    : {
                        quantity: chargeQuantities.get(
                          chargePairKey(slot.moduleTypeId, slot.chargeTypeId),
                        )!,
                        typeId: slot.chargeTypeId,
                      },
                typeId: slot.moduleTypeId,
              },
        rack,
      })),
    ]),
  ) as Record<EftSupportedRack, ResolvedEftSlot[]>;
  const fittedModules = RACKS.flatMap((rack) =>
    slots[rack].flatMap<FittedModuleAddress>((slot) =>
      slot.module
        ? [{ index: slot.index, rack: slot.rack, typeId: slot.module.typeId }]
        : [],
    ),
  );

  const [fitting, droneBayResponse] = await Promise.all([
    input.dependencies.analyzeFit({ fittedModules, hullTypeId: hull.typeId }),
    drones.length > 0
      ? input.dependencies.validateDroneBay({ drones, hullTypeId: hull.typeId })
      : Promise.resolve<DroneBayValidationResponse>({
          allowed: true,
          analysis: {
            capacity: hull.droneCapacity,
            entries: [],
            remainingVolume: hull.droneCapacity,
            usedVolume: 0,
          },
          errors: [],
        }),
  ]);

  for (const issue of fitting.errors) {
    diagnostics.push(
      makeDiagnostic("error", "FIT_VALIDATION", `${issue.code}: ${issue.message}`, null),
    );
  }
  for (const issue of fitting.warnings) {
    diagnostics.push(
      makeDiagnostic("warning", "FIT_WARNING", `${issue.code}: ${issue.message}`, null),
    );
  }
  for (const issue of droneBayResponse.errors) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "DRONE_BAY_VALIDATION",
        `${issue.code}: ${issue.message}`,
        null,
      ),
    );
  }

  const status = deriveStatus(diagnostics);
  const draft = {
    analysis: { droneBay: droneBayResponse.analysis, fitting },
    diagnostics,
    drones,
    fitName: input.document.header.fitName,
    hullTypeId: hull.typeId,
    slots,
    status,
  };

  return { diagnostics, draft, status };
}

function resolveModuleLine(
  line: EftParsedModuleLine,
  modules: EftModuleCatalogRecord[],
  charges: EftChargeCatalogRecord[],
  diagnostics: EftImportDiagnostic[],
): ResolvedModuleLine | null {
  const wholeResolution = resolveName(line.unresolvedText, modules);
  if (wholeResolution.kind === "resolved") {
    addNormalizationWarning(
      diagnostics,
      wholeResolution,
      line.unresolvedText,
      "module",
      line.source,
    );
    return { chargeTypeId: null, moduleTypeId: wholeResolution.record.typeId };
  }

  const attempts = [...line.chargeSplitCandidates].reverse().map((candidate) => ({
    candidate,
    charge: resolveName(candidate.chargeName, charges),
    module: resolveName(candidate.moduleName, modules),
  }));
  const successful = attempts.filter(
    (attempt) => attempt.module.kind === "resolved" && attempt.charge.kind === "resolved",
  );

  if (successful.length === 1) {
    const selected = successful[0];
    if (selected.module.kind !== "resolved" || selected.charge.kind !== "resolved") {
      return null;
    }
    addNormalizationWarning(
      diagnostics,
      selected.module,
      selected.candidate.moduleName,
      "module",
      line.source,
    );
    addNormalizationWarning(
      diagnostics,
      selected.charge,
      selected.candidate.chargeName,
      "charge",
      line.source,
    );
    return {
      chargeTypeId: selected.charge.record.typeId,
      moduleTypeId: selected.module.record.typeId,
    };
  }

  if (successful.length > 1) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "MODULE_CHARGE_AMBIGUOUS",
        `Fitted line ${quote(line.unresolvedText)} has multiple authoritative module and charge interpretations.`,
        line.source,
      ),
    );
    return null;
  }

  const uniqueModuleAttempt = attempts.find((attempt) => attempt.module.kind === "resolved");
  if (uniqueModuleAttempt) {
    const chargeCode =
      uniqueModuleAttempt.charge.kind === "ambiguous"
        ? "CHARGE_AMBIGUOUS"
        : "CHARGE_UNRESOLVED";
    diagnostics.push(
      makeDiagnostic(
        "error",
        chargeCode,
        chargeCode === "CHARGE_AMBIGUOUS"
          ? `Charge name ${quote(uniqueModuleAttempt.candidate.chargeName)} matches multiple authoritative charge records.`
          : `Charge name ${quote(uniqueModuleAttempt.candidate.chargeName)} is not present in the authoritative fitting-charge cache.`,
        line.source,
      ),
    );
    return null;
  }

  const moduleAmbiguous =
    wholeResolution.kind === "ambiguous" ||
    attempts.some((attempt) => attempt.module.kind === "ambiguous");
  diagnostics.push(
    makeDiagnostic(
      "error",
      moduleAmbiguous ? "MODULE_AMBIGUOUS" : "MODULE_UNRESOLVED",
      moduleAmbiguous
        ? `Fitted line ${quote(line.unresolvedText)} matches multiple authoritative module records.`
        : `Fitted line ${quote(line.unresolvedText)} does not resolve to an authoritative fitting module.`,
      line.source,
    ),
  );
  return null;
}

function resolveDrones(
  document: EftParsedDocument,
  catalog: EftDroneCatalogRecord[],
  diagnostics: EftImportDiagnostic[],
): ResolvedEftDrone[] | null {
  const quantities = new Map<number, number>();
  let failed = false;

  for (const line of document.droneAndFighterBay) {
    if (line.quantity === null || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          "DRONE_QUANTITY_INVALID",
          `Drone or fighter line ${quote(line.source.text)} does not contain a valid positive quantity.`,
          line.source,
        ),
      );
      failed = true;
      continue;
    }

    const resolution = resolveName(line.itemName, catalog);
    if (resolution.kind !== "resolved") {
      diagnostics.push(
        makeDiagnostic(
          "error",
          resolution.kind === "ambiguous" ? "DRONE_AMBIGUOUS" : "DRONE_UNRESOLVED",
          resolution.kind === "ambiguous"
            ? `Drone name ${quote(line.itemName)} matches multiple ordinary fitting-drone records.`
            : `Drone or fighter name ${quote(line.itemName)} is not present in the ordinary fitting-drone cache; fighters and Abyssal drones are unsupported.`,
          line.source,
        ),
      );
      failed = true;
      continue;
    }

    addNormalizationWarning(diagnostics, resolution, line.itemName, "drone", line.source);
    const nextQuantity = (quantities.get(resolution.record.typeId) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(nextQuantity)) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          "DRONE_QUANTITY_OVERFLOW",
          `Aggregated quantity for ${resolution.record.typeName} exceeds the safe integer range.`,
          line.source,
        ),
      );
      failed = true;
      continue;
    }
    quantities.set(resolution.record.typeId, nextQuantity);
  }

  return failed
    ? null
    : Array.from(quantities, ([typeId, quantity]) => ({ quantity, typeId }));
}

async function validateLoadedCharges(
  slots: Record<EftSupportedRack, PendingSlot[]>,
  dependencies: EftDraftValidationDependencies,
  diagnostics: EftImportDiagnostic[],
): Promise<Map<string, number> | null> {
  const loadedSlots = RACKS.flatMap((rack) =>
    slots[rack].filter(
      (slot): slot is PendingSlot & { chargeTypeId: number; moduleTypeId: number } =>
        slot.chargeTypeId !== null && slot.moduleTypeId !== null,
    ),
  );
  const validationByPair = new Map<string, Promise<ChargeValidationResult>>();

  for (const slot of loadedSlots) {
    const key = chargePairKey(slot.moduleTypeId, slot.chargeTypeId);
    if (!validationByPair.has(key)) {
      validationByPair.set(
        key,
        dependencies.validateCharge(slot.moduleTypeId, slot.chargeTypeId),
      );
    }
  }

  const results = new Map<string, ChargeValidationResult>();
  await Promise.all(
    Array.from(validationByPair, async ([key, result]) => {
      results.set(key, await result);
    }),
  );

  const quantities = new Map<string, number>();
  let failed = false;
  for (const slot of loadedSlots) {
    const key = chargePairKey(slot.moduleTypeId, slot.chargeTypeId);
    const validation = results.get(key)!;
    if (
      validation.status === "error" ||
      !Number.isSafeInteger(validation.quantity) ||
      validation.quantity <= 0
    ) {
      diagnostics.push(
        makeDiagnostic(
          "error",
          "CHARGE_INCOMPATIBLE",
          validation.status === "error"
            ? validation.message
            : "The authoritative charge validator returned an invalid magazine quantity.",
          slot.source,
        ),
      );
      failed = true;
    } else {
      quantities.set(key, validation.quantity);
    }
  }

  return failed ? null : quantities;
}

function addUnsupportedDiagnostics(
  document: EftParsedDocument,
  diagnostics: EftImportDiagnostic[],
): void {
  for (const line of document.subsystems) {
    diagnostics.push(
      makeDiagnostic(
        "error",
        "SUBSYSTEM_UNSUPPORTED",
        "Strategic Cruiser subsystem sections are not supported and cannot be safely omitted during import.",
        line,
      ),
    );
  }
  for (const line of document.services) {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "SERVICE_UNSUPPORTED",
        "Structure service content was retained for review but will not be applied.",
        line,
      ),
    );
  }
  for (const line of document.cargo) {
    diagnostics.push(
      makeDiagnostic(
        "warning",
        "CARGO_UNSUPPORTED",
        "Cargo content was retained for review but will not be applied or loaded into modules.",
        line.source,
      ),
    );
  }
  for (const block of document.unsupportedBlocks.filter(
    (unsupported) => unsupported.kind === "extension",
  )) {
    for (const line of block.lines) {
      diagnostics.push(
        makeDiagnostic(
          "warning",
          "EXTENSION_UNSUPPORTED",
          "Tool-specific extension, implant, booster, or mutation content was retained for review but will not be applied.",
          line,
        ),
      );
    }
  }
}

function resolveName<T extends NamedCatalogRecord>(
  requestedName: string,
  catalog: T[],
): NameResolution<T> {
  const exact = catalog.filter((record) => record.typeName === requestedName);
  if (exact.length === 1) {
    return { kind: "resolved", normalized: false, record: exact[0] };
  }
  if (exact.length > 1) {
    return { kind: "ambiguous", records: exact };
  }

  const normalizedName = normalizeName(requestedName);
  const insensitive = catalog.filter(
    (record) => normalizeName(record.typeName) === normalizedName,
  );
  if (insensitive.length === 1) {
    return { kind: "resolved", normalized: true, record: insensitive[0] };
  }
  if (insensitive.length > 1) {
    return { kind: "ambiguous", records: insensitive };
  }
  return { kind: "unresolved" };
}

function addNormalizationWarning<T extends NamedCatalogRecord>(
  diagnostics: EftImportDiagnostic[],
  resolution: Extract<NameResolution<T>, { kind: "resolved" }>,
  requestedName: string,
  kind: "charge" | "drone" | "hull" | "module",
  source: EftSourceLine,
): void {
  if (!resolution.normalized) {
    return;
  }
  diagnostics.push(
    makeDiagnostic(
      "warning",
      "NORMALIZED_NAME",
      `${capitalize(kind)} name ${quote(requestedName)} was normalized to canonical name ${quote(resolution.record.typeName)}.`,
      source,
    ),
  );
}

function convertBlockingParseDiagnostics(
  diagnostics: EftParseDiagnostic[],
): EftImportDiagnostic[] {
  return diagnostics
    .filter((entry) => entry.severity === "error")
    .map((entry) => ({
      code: "PARSE_ERROR",
      lineNumber: entry.lineNumber,
      message: `${entry.code}: ${entry.message}`,
      rawText: entry.rawText,
      severity: "error",
    }));
}

function makeDiagnostic(
  severity: "error" | "warning",
  code: EftImportDiagnosticCode,
  message: string,
  source: EftSourceLine | null,
): EftImportDiagnostic {
  return {
    code,
    lineNumber: source?.lineNumber ?? null,
    message,
    rawText: source?.rawText ?? null,
    severity,
  };
}

function deriveStatus(diagnostics: EftImportDiagnostic[]): EftImportStatus {
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return "error";
  }
  return diagnostics.some((entry) => entry.severity === "warning")
    ? "review"
    : "ready";
}

function chargePairKey(moduleTypeId: number, chargeTypeId: number): string {
  return `${moduleTypeId}:${chargeTypeId}`;
}

function normalizeName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function quote(value: string): string {
  return `“${value}”`;
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
