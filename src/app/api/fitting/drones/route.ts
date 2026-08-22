import { searchFittingDrones, validateDroneBay } from "@/lib/fitting/drones";
import type { DroneBayInputEntry } from "@/lib/fitting/types";

export const dynamic = "force-dynamic";

const defaultResultLimit = 200;
const maximumResultLimit = 200;
const maximumQueryLength = 120;
const maximumDroneTypes = 256;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = (searchParams.get("q") ?? "").slice(0, maximumQueryLength);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const response = await searchFittingDrones({ limit, query });

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    console.warn(
      "Fitting drone search unavailable. Run migrations and refresh fitting drone data."
    );

    return Response.json(
      { error: "Drone search is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const input = await parseDroneBayRequest(request);

  if (!input.ok) {
    return Response.json({ error: input.message }, { status: 400 });
  }

  try {
    const response = await validateDroneBay(input.value);

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
      status: response.allowed ? 200 : 409
    });
  } catch {
    console.warn(
      "Fitting drone validation unavailable. Run migrations and refresh fitting data."
    );

    return Response.json(
      { error: "Drone Bay validation is temporarily unavailable." },
      { status: 503 }
    );
  }
}

function parseLimit(value: string | null) {
  const parsedValue = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsedValue)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsedValue));
}

async function parseDroneBayRequest(request: Request): Promise<
  | { message: string; ok: false }
  | {
      ok: true;
      value: { drones: DroneBayInputEntry[]; hullTypeId: number | null };
    }
> {
  const value = await request.json().catch(() => null);

  if (value === null || typeof value !== "object") {
    return { message: "A JSON Drone Bay request is required.", ok: false };
  }

  const hullTypeId = "hullTypeId" in value ? value.hullTypeId : null;
  const drones = "drones" in value ? value.drones : null;

  if (
    hullTypeId !== null &&
    (typeof hullTypeId !== "number" || !Number.isInteger(hullTypeId) || hullTypeId <= 0)
  ) {
    return { message: "hullTypeId must be a positive integer or null.", ok: false };
  }

  if (!Array.isArray(drones) || drones.length > maximumDroneTypes) {
    return {
      message: `drones must be an array containing at most ${maximumDroneTypes} entries.`,
      ok: false
    };
  }

  const seenTypeIds = new Set<number>();
  const parsedDrones: DroneBayInputEntry[] = [];

  for (const entry of drones) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !("typeId" in entry) ||
      !("quantity" in entry) ||
      typeof entry.typeId !== "number" ||
      !Number.isInteger(entry.typeId) ||
      entry.typeId <= 0 ||
      typeof entry.quantity !== "number" ||
      !Number.isSafeInteger(entry.quantity) ||
      entry.quantity <= 0
    ) {
      return {
        message: "Every Drone Bay entry must have a positive typeId and quantity.",
        ok: false
      };
    }

    if (seenTypeIds.has(entry.typeId)) {
      return {
        message: `Drone type ${entry.typeId} appears more than once.`,
        ok: false
      };
    }

    seenTypeIds.add(entry.typeId);
    parsedDrones.push({ quantity: entry.quantity, typeId: entry.typeId });
  }

  return { ok: true, value: { drones: parsedDrones, hullTypeId } };
}
