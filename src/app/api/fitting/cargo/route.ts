import { analyzeCargoHold, searchFittingCargo } from "@/lib/fitting/cargo";
import type { CargoInputEntry } from "@/lib/fitting/types";

export const dynamic = "force-dynamic";

const defaultResultLimit = 40;
const maximumResultLimit = 40;
const maximumQueryLength = 120;
const maximumCargoTypes = 512;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = (searchParams.get("q") ?? "").slice(0, maximumQueryLength);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    return Response.json(
      { results: await searchFittingCargo({ limit, query }) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.warn(
      "Fitting cargo search unavailable. Run migrations and refresh fitting cargo-item data."
    );

    return Response.json(
      { error: "Cargo search is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const input = await parseCargoHoldRequest(request);

  if (!input.ok) {
    return Response.json({ error: input.message }, { status: 400 });
  }

  try {
    const response = await analyzeCargoHold(input.value);

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
      status: response.allowed ? 200 : 409
    });
  } catch {
    console.warn(
      "Fitting cargo analysis unavailable. Run migrations and refresh fitting data."
    );

    return Response.json(
      { error: "Cargo Hold analysis is temporarily unavailable." },
      { status: 503 }
    );
  }
}

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsed)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsed));
}

async function parseCargoHoldRequest(request: Request): Promise<
  | { message: string; ok: false }
  | {
      ok: true;
      value: { cargo: CargoInputEntry[]; hullTypeId: number | null };
    }
> {
  const value = await request.json().catch(() => null);

  if (value === null || typeof value !== "object") {
    return { message: "A JSON Cargo Hold request is required.", ok: false };
  }

  const hullTypeId = "hullTypeId" in value ? value.hullTypeId : null;
  const cargo = "cargo" in value ? value.cargo : null;

  if (
    hullTypeId !== null &&
    (typeof hullTypeId !== "number" ||
      !Number.isInteger(hullTypeId) ||
      hullTypeId <= 0)
  ) {
    return { message: "hullTypeId must be a positive integer or null.", ok: false };
  }

  if (!Array.isArray(cargo) || cargo.length > maximumCargoTypes) {
    return {
      message: `cargo must be an array containing at most ${maximumCargoTypes} entries.`,
      ok: false
    };
  }

  const seenTypeIds = new Set<number>();
  const entries: CargoInputEntry[] = [];

  for (const entry of cargo) {
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
        message: "Every Cargo Hold entry must have a positive typeId and safe positive quantity.",
        ok: false
      };
    }

    if (seenTypeIds.has(entry.typeId)) {
      return {
        message: `Cargo type ${entry.typeId} appears more than once.`,
        ok: false
      };
    }

    seenTypeIds.add(entry.typeId);
    entries.push({ quantity: entry.quantity, typeId: entry.typeId });
  }

  return { ok: true, value: { cargo: entries, hullTypeId } };
}
