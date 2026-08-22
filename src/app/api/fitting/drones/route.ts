import { searchFittingDrones } from "@/lib/fitting/drones";

export const dynamic = "force-dynamic";

const defaultResultLimit = 200;
const maximumResultLimit = 200;
const maximumQueryLength = 120;

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

function parseLimit(value: string | null) {
  const parsedValue = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsedValue)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsedValue));
}
