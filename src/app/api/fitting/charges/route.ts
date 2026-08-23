import {
  browseFittingChargeBranch,
  getFittingChargeHierarchy,
  searchFittingCharges,
  searchCompatibleFittingCharges,
  validateFittingChargeBulkLoad,
  validateFittingChargeLoad
} from "@/lib/fitting/charges";

export const dynamic = "force-dynamic";

const defaultResultLimit = 40;
const maximumResultLimit = 40;
const maximumQueryLength = 120;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const browse = searchParams.get("browse");

  try {
    if (browse === "hierarchy") {
      return Response.json(await getFittingChargeHierarchy(), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (browse === "branch") {
      const fallback = searchParams.get("fallback") === "true";
      const groupId = parsePositiveInteger(searchParams.get("groupId"));
      const marketGroupId = parsePositiveInteger(searchParams.get("marketGroupId"));
      const results = await browseFittingChargeBranch({
        fallback,
        groupId,
        marketGroupId
      });

      return Response.json({ results }, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (browse) {
      return Response.json(
        { error: "browse must be hierarchy or branch." },
        { status: 400 }
      );
    }

    const moduleTypeId = parsePositiveInteger(searchParams.get("moduleTypeId"));
    const query = (searchParams.get("q") ?? "").slice(0, maximumQueryLength);
    const limit = parseLimit(searchParams.get("limit"));

    if (!moduleTypeId) {
      return Response.json(await searchFittingCharges({ limit, query }), {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const result = await searchCompatibleFittingCharges({ limit, moduleTypeId, query });

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

  if ("moduleTypeIds" in body) {
    const chargeTypeId = parsePositiveNumberProperty(body, "chargeTypeId");
    const moduleTypeIds = parsePositiveIntegerArrayProperty(body, "moduleTypeIds");

    if (!chargeTypeId || !moduleTypeIds) {
      return Response.json(
        { error: "Valid chargeTypeId and moduleTypeIds values are required." },
        { status: 400 }
      );
    }

    try {
      const result = await validateFittingChargeBulkLoad(
        moduleTypeIds,
        chargeTypeId
      );
      if (result.status !== "ready") {
        return Response.json({ error: result.message }, { status: 404 });
      }

      return Response.json(result, {
        headers: { "Cache-Control": "no-store" }
      });
    } catch {
      console.warn(
        "Fitting bulk charge validation unavailable. Run migrations and refresh fitting static data."
      );
      return Response.json(
        { error: "Charge validation is temporarily unavailable." },
        { status: 503 }
      );
    }
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

function parsePositiveIntegerArrayProperty(
  value: object,
  property: "moduleTypeIds"
) {
  if (!(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  if (!Array.isArray(propertyValue) || propertyValue.length > 256) {
    return null;
  }

  return propertyValue.every(
    (entry) => typeof entry === "number" && Number.isInteger(entry) && entry > 0
  )
    ? propertyValue as number[]
    : null;
}
