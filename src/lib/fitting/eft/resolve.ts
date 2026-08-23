import "server-only";

import { FittingRack, Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import { validateFittingChargeLoad } from "@/lib/fitting/charges";
import { analyzeCargoHold } from "@/lib/fitting/cargo";
import { validateDroneBay } from "@/lib/fitting/drones";
import { analyzeFittingFit } from "@/lib/fitting/validation";
import type {
  EftImportDiagnostic,
  EftParseResult,
  EftResolutionResult,
  EftSupportedRack,
} from "./types";
import {
  resolveAndValidateEftDraft,
  type EftResolutionCatalog,
} from "./validate";

const rackByDatabaseRack: Record<
  FittingRack,
  EftSupportedRack | "subsystem"
> = {
  [FittingRack.HIGH]: "high",
  [FittingRack.LOW]: "low",
  [FittingRack.MID]: "mid",
  [FittingRack.RIG]: "rig",
  [FittingRack.SUBSYSTEM]: "subsystem",
};

export async function resolveEftDraft(
  parsed: EftParseResult,
): Promise<EftResolutionResult> {
  if (!parsed.document) {
    const diagnostics = parsed.diagnostics.map<EftImportDiagnostic>((entry) => ({
      code: "PARSE_ERROR",
      lineNumber: entry.lineNumber,
      message: `${entry.code}: ${entry.message}`,
      rawText: entry.rawText,
      severity: entry.severity === "error" ? "error" : "warning",
    }));
    return { diagnostics, draft: null, status: "error" };
  }

  const emptyCatalog: EftResolutionCatalog = {
    cargo: [],
    charges: [],
    drones: [],
    hulls: [],
    modules: [],
  };
  if (parsed.diagnostics.some((entry) => entry.severity === "error")) {
    return resolveAndValidateEftDraft({
      catalog: emptyCatalog,
      dependencies: authoritativeDependencies,
      document: parsed.document,
      parseDiagnostics: parsed.diagnostics,
    });
  }

  if (!isDatabaseConfigured()) {
    throw new Error("The fitting static-data cache is unavailable.");
  }

  const db = getDb();
  const hulls = await db.fittingHull.findMany({
    select: {
      cargoCapacityBase: true,
      droneCapacity: true,
      highSlots: true,
      lowSlots: true,
      midSlots: true,
      rigSlots: true,
      typeId: true,
      typeName: true,
    },
    where: {
      typeName: {
        equals: parsed.document.header.hullName,
        mode: Prisma.QueryMode.insensitive,
      },
    },
  });

  if (!hasUniqueResolution(parsed.document.header.hullName, hulls)) {
    return resolveAndValidateEftDraft({
      catalog: { ...emptyCatalog, hulls },
      dependencies: authoritativeDependencies,
      document: parsed.document,
      parseDiagnostics: parsed.diagnostics,
    });
  }

  const names = collectReferencedNames(parsed.document);
  const [modules, charges, drones, cargo] = await Promise.all([
    names.modules.length
      ? db.fittingModule.findMany({
          select: { rack: true, typeId: true, typeName: true },
          where: { OR: insensitiveNameConditions(names.modules) },
        })
      : [],
    names.charges.length
      ? db.fittingCharge.findMany({
          select: { typeId: true, typeName: true },
          where: { OR: insensitiveNameConditions(names.charges) },
        })
      : [],
    names.drones.length
      ? db.fittingDrone.findMany({
          select: { typeId: true, typeName: true },
          where: { OR: insensitiveNameConditions(names.drones) },
        })
      : [],
    names.cargo.length
      ? db.fittingCargoItem.findMany({
          select: {
            categoryId: true,
            metaGroupId: true,
            packagedVolume: true,
            typeId: true,
            typeName: true,
            volume: true,
          },
          where: { OR: insensitiveNameConditions(names.cargo) },
        })
      : [],
  ]);

  return resolveAndValidateEftDraft({
    catalog: {
      cargo,
      charges,
      drones,
      hulls,
      modules: modules.map((module) => ({
        ...module,
        rack: rackByDatabaseRack[module.rack],
      })),
    },
    dependencies: authoritativeDependencies,
    document: parsed.document,
    parseDiagnostics: parsed.diagnostics,
  });
}

const authoritativeDependencies = {
  analyzeCargo: analyzeCargoHold,
  analyzeFit: analyzeFittingFit,
  async validateCharge(moduleTypeId: number, chargeTypeId: number) {
    const result = await validateFittingChargeLoad(moduleTypeId, chargeTypeId);
    return result.status === "ready"
      ? { quantity: result.charge.quantity, status: "ready" as const }
      : { message: result.message, status: "error" as const };
  },
  validateDroneBay,
};

function collectReferencedNames(document: NonNullable<EftParseResult["document"]>) {
  const moduleNames = new Set<string>();
  const chargeNames = new Set<string>();
  const droneNames = new Set<string>();
  const cargoNames = new Set<string>();

  for (const rack of ["low", "mid", "high", "rig"] as const) {
    for (const line of document.slots[rack]) {
      if (line.kind === "empty") {
        continue;
      }
      moduleNames.add(line.unresolvedText);
      for (const candidate of line.chargeSplitCandidates) {
        moduleNames.add(candidate.moduleName);
        chargeNames.add(candidate.chargeName);
      }
    }
  }
  for (const line of document.droneAndFighterBay) {
    droneNames.add(line.itemName);
  }
  for (const line of document.cargo) {
    cargoNames.add(line.itemName);
  }

  return {
    cargo: [...cargoNames],
    charges: [...chargeNames],
    drones: [...droneNames],
    modules: [...moduleNames],
  };
}

function insensitiveNameConditions(names: string[]) {
  return names.map((typeName) => ({
    typeName: { equals: typeName, mode: Prisma.QueryMode.insensitive },
  }));
}

function hasUniqueResolution(
  requestedName: string,
  candidates: Array<{ typeName: string }>,
): boolean {
  const exact = candidates.filter((candidate) => candidate.typeName === requestedName);
  if (exact.length > 0) {
    return exact.length === 1;
  }
  const normalized = requestedName.toLocaleLowerCase("en-US");
  return (
    candidates.filter(
      (candidate) => candidate.typeName.toLocaleLowerCase("en-US") === normalized,
    ).length === 1
  );
}
