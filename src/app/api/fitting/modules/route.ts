import { searchFittingModules } from "@/lib/fitting/modules";
import type { BrowsableFittingRack } from "@/lib/fitting/types";

export const dynamic = "force-dynamic";

const defaultResultLimit = 40;
const maximumResultLimit = 40;
const maximumQueryLength = 120;
const browserRacks = new Set<BrowsableFittingRack>([
  "high",
  "mid",
  "low",
  "rig"
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

function parseRack(value: string | null): BrowsableFittingRack | null {
  const normalizedValue = value?.trim().toLocaleLowerCase("en-US");

  return normalizedValue && browserRacks.has(normalizedValue as BrowsableFittingRack)
    ? (normalizedValue as BrowsableFittingRack)
    : null;
}

function parseLimit(value: string | null) {
  const parsedValue = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsedValue)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsedValue));
}
