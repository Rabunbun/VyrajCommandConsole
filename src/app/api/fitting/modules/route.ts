import { searchFittingModules } from "@/lib/fitting/modules";
import type { RackType } from "@/lib/fitting/fit-state";
import type {
  BrowsableFittingRack,
  FittedModuleAddress
} from "@/lib/fitting/types";
import { validateFittingModulePlacement } from "@/lib/fitting/validation";

export const dynamic = "force-dynamic";

const defaultResultLimit = 40;
const maximumResultLimit = 40;
const maximumQueryLength = 120;
const maximumFittedModuleCount = 64;
const browserRacks = new Set<BrowsableFittingRack>([
  "high",
  "mid",
  "low",
  "rig"
]);
const fittingRacks = new Set<RackType>([
  "high",
  "mid",
  "low",
  "rig",
  "subsystem"
]);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const rack = parseRack(searchParams.get("rack"));

  if (!rack) {
    return Response.json(
      { error: "rack must be one of: high, mid, low, rig." },
      { status: 400 }
    );
  }

  const query = (searchParams.get("q") ?? "").slice(0, maximumQueryLength);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const results = await searchFittingModules({ limit, query, rack });

    return Response.json(
      { results },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch {
    console.warn("Fitting module search unavailable. Run migrations and refresh module data.");

    return Response.json(
      { error: "Module search is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required." }, { status: 400 });
  }

  if (!isRequestObject(body)) {
    return Response.json({ error: "Invalid module placement request." }, { status: 400 });
  }

  const rack = parseFittingRack(typeof body.rack === "string" ? body.rack : null);
  const fittedModules = parseFittedModules(body.fittedModules);
  const hullTypeId = body.hullTypeId;
  const index = body.index;
  const typeId = body.typeId;

  if (
    !rack ||
    fittedModules === null ||
    !(
      hullTypeId === null ||
      (typeof hullTypeId === "number" &&
        Number.isInteger(hullTypeId) &&
        hullTypeId > 0)
    ) ||
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    typeof typeId !== "number" ||
    !Number.isInteger(typeId) ||
    typeId <= 0
  ) {
    return Response.json(
      { error: "A valid hull, target socket, module typeId, and current fit are required." },
      { status: 400 }
    );
  }

  try {
    const result = await validateFittingModulePlacement({
      fittedModules,
      hullTypeId,
      index,
      rack,
      typeId
    });

    return Response.json(
      result,
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: result.allowed ? 200 : 409
      }
    );
  } catch {
    console.warn(
      "Fitting module placement validation unavailable. Run migrations and refresh module data."
    );

    return Response.json(
      { error: "Module placement validation is temporarily unavailable." },
      { status: 503 }
    );
  }
}

function parseRack(value: string | null): BrowsableFittingRack | null {
  const normalizedValue = value?.trim().toLocaleLowerCase("en-US");

  return normalizedValue && browserRacks.has(normalizedValue as BrowsableFittingRack)
    ? (normalizedValue as BrowsableFittingRack)
    : null;
}

function parseFittingRack(value: string | null): RackType | null {
  const normalizedValue = value?.trim().toLocaleLowerCase("en-US");

  return normalizedValue && fittingRacks.has(normalizedValue as RackType)
    ? (normalizedValue as RackType)
    : null;
}

function parseFittedModules(value: unknown): FittedModuleAddress[] | null {
  if (!Array.isArray(value) || value.length > maximumFittedModuleCount) {
    return null;
  }

  const fittedModules: FittedModuleAddress[] = [];

  for (const item of value) {
    if (!isRequestObject(item)) {
      return null;
    }

    const rack = parseFittingRack(typeof item.rack === "string" ? item.rack : null);

    if (
      !rack ||
      typeof item.index !== "number" ||
      !Number.isInteger(item.index) ||
      typeof item.typeId !== "number" ||
      !Number.isInteger(item.typeId) ||
      item.typeId <= 0
    ) {
      return null;
    }

    fittedModules.push({
      index: item.index,
      rack,
      typeId: item.typeId
    });
  }

  return fittedModules;
}

function parseLimit(value: string | null) {
  const parsedValue = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsedValue)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsedValue));
}

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
