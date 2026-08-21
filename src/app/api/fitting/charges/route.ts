import {
  searchCompatibleFittingCharges,
  validateFittingChargeLoad
} from "@/lib/fitting/charges";

export const dynamic = "force-dynamic";

const defaultResultLimit = 40;
const maximumResultLimit = 40;
const maximumQueryLength = 120;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const moduleTypeId = parsePositiveInteger(searchParams.get("moduleTypeId"));

  if (!moduleTypeId) {
    return Response.json(
      { error: "A valid moduleTypeId is required." },
      { status: 400 }
    );
  }

  const query = (searchParams.get("q") ?? "").slice(0, maximumQueryLength);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const result = await searchCompatibleFittingCharges({
      limit,
      moduleTypeId,
      query
    });

    if (result.status === "module-not-found") {
      return Response.json(
        { error: "The selected fitted module is not available in the module cache." },
        { status: 404 }
      );
    }

    if (result.status === "capacity-unavailable") {
      return Response.json({ error: result.message }, { status: 409 });
    }

    return Response.json({ module: result.module, results: result.results }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    console.warn(
      "Fitting charge search unavailable. Run migrations and refresh fitting static data."
    );

    return Response.json(
      { error: "Charge search is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const moduleTypeId = parsePositiveNumberProperty(body, "moduleTypeId");
  const chargeTypeId = parsePositiveNumberProperty(body, "chargeTypeId");

  if (!moduleTypeId || !chargeTypeId) {
    return Response.json(
      { error: "Valid moduleTypeId and chargeTypeId values are required." },
      { status: 400 }
    );
  }

  try {
    const result = await validateFittingChargeLoad(moduleTypeId, chargeTypeId);

    if (result.status !== "ready") {
      const status =
        result.status === "module-not-found" || result.status === "charge-not-found"
          ? 404
          : 409;

      return Response.json({ error: result.message }, { status });
    }

    return Response.json(
      { charge: result.charge, module: result.module },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.warn(
      "Fitting charge validation unavailable. Run migrations and refresh fitting static data."
    );

    return Response.json(
      { error: "Charge validation is temporarily unavailable." },
      { status: 503 }
    );
  }
}

function parsePositiveInteger(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function parseLimit(value: string | null) {
  const parsedValue = value ? Number.parseInt(value, 10) : defaultResultLimit;

  if (!Number.isFinite(parsedValue)) {
    return defaultResultLimit;
  }

  return Math.min(maximumResultLimit, Math.max(1, parsedValue));
}

function parsePositiveNumberProperty(
  value: object,
  property: "chargeTypeId" | "moduleTypeId"
) {
  if (!(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];

  return typeof propertyValue === "number" &&
    Number.isInteger(propertyValue) &&
    propertyValue > 0
    ? propertyValue
    : null;
}
