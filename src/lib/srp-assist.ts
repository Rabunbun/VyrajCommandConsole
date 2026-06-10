import "server-only";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getEveSsoServerConfig } from "@/lib/eve-sso/config";

const datasource = "tranquility";
const platinumInsuranceLevel = "platinum";
const insuranceCacheTtlMs = 24 * 60 * 60 * 1000;

export type KillmailParseResult = {
  input: string;
  isValid: boolean;
  killmailHash: string;
  killmailId: string;
  message: string;
  source: "esi" | "raw" | "zkillboard" | "invalid" | "empty";
};

export type SrpAssistInput = {
  killmailUrl: string;
  lossValue: Prisma.Decimal | null;
  requestedAmount: Prisma.Decimal | null;
  selectedShipName: string;
  selectedShipTypeId: number | null;
};

export type SrpAssistResult = {
  assistStatus: "not_checked" | "success" | "partial" | "failed" | "manual";
  calculationSource: "killmail" | "manual" | "mixed" | "none";
  calculatedEligibleAmount: Prisma.Decimal | null;
  detectedShipName: string;
  detectedShipTypeId: number | null;
  insuranceLevelUsed: "Platinum";
  insurancePayout: Prisma.Decimal | null;
  killmailHash: string;
  killmailId: string;
  killmailTotalValue: Prisma.Decimal | null;
  lossValue: Prisma.Decimal | null;
  parseResult: KillmailParseResult;
  selectedShipName: string;
  selectedShipTypeId: number | null;
  shipDetectionSource: "killmail" | "manual" | "none";
  warnings: string[];
  error: string;
};

type EsiKillmailResponse = {
  victim?: {
    ship_type_id?: number;
  };
};

type ZkillboardResponse = Array<{
  killmail_id?: number;
  victim?: {
    ship_type_id?: number;
  };
  zkb?: {
    hash?: string;
    totalValue?: number;
  };
}>;

type InsurancePriceResponse = Array<{
  levels?: Array<{
    cost?: number;
    name?: string;
    payout?: number;
  }>;
  type_id: number;
}>;

export function parseKillmailInput(input: string): KillmailParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      input: trimmed,
      isValid: false,
      killmailHash: "",
      killmailId: "",
      message: "No killmail URL entered.",
      source: "empty"
    };
  }

  const rawMatch = trimmed.match(/^(\d+)[\s,:/]+([a-zA-Z0-9_-]{8,})$/);

  if (rawMatch) {
    return {
      input: trimmed,
      isValid: true,
      killmailHash: rawMatch[2],
      killmailId: rawMatch[1],
      message: "Raw killmail ID and hash detected.",
      source: "raw"
    };
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return {
      input: trimmed,
      isValid: false,
      killmailHash: "",
      killmailId: "",
      message: "Enter a zKillboard kill URL or official ESI killmail URL.",
      source: "invalid"
    };
  }

  const zkillMatch = url.pathname.match(/^\/kill\/(\d+)\/?$/i);

  if (url.hostname.toLowerCase().endsWith("zkillboard.com") && zkillMatch) {
    return {
      input: trimmed,
      isValid: true,
      killmailHash: "",
      killmailId: zkillMatch[1],
      message:
        "zKillboard killmail ID detected. Hash will be requested from the public zKillboard JSON API if available.",
      source: "zkillboard"
    };
  }

  const esiMatch = url.pathname.match(/\/killmails\/(\d+)\/([a-zA-Z0-9_-]+)\/?$/i);

  if (url.hostname.toLowerCase().includes("esi.evetech.net") && esiMatch) {
    return {
      input: trimmed,
      isValid: true,
      killmailHash: esiMatch[2],
      killmailId: esiMatch[1],
      message: "Official ESI killmail URL detected.",
      source: "esi"
    };
  }

  return {
    input: trimmed,
    isValid: false,
    killmailHash: "",
    killmailId: "",
    message: "Unsupported killmail URL format.",
    source: "invalid"
  };
}

export async function analyzeSrpAssist(input: SrpAssistInput): Promise<SrpAssistResult> {
  const warnings: string[] = [];
  const parseResult = parseKillmailInput(input.killmailUrl);
  let killmailHash = parseResult.killmailHash;
  const killmailId = parseResult.killmailId;
  let killmailTotalValue: Prisma.Decimal | null = null;
  let detectedShipTypeId: number | null = null;
  let detectedShipName = "";
  let selectedShipTypeId = input.selectedShipTypeId;
  let selectedShipName = input.selectedShipName;
  let shipDetectionSource: SrpAssistResult["shipDetectionSource"] = "none";
  let error = "";

  if (parseResult.source === "zkillboard" && killmailId) {
    const zkillResult = await fetchZkillboardKillmail(killmailId);

    if (zkillResult.ok) {
      killmailHash = zkillResult.hash || "";
      killmailTotalValue = zkillResult.totalValue;
      detectedShipTypeId = zkillResult.shipTypeId;
    } else {
      warnings.push(zkillResult.message);
    }
  }

  if (killmailId && killmailHash) {
    const esiResult = await fetchEsiKillmail(killmailId, killmailHash);

    if (esiResult.ok) {
      detectedShipTypeId = esiResult.shipTypeId || detectedShipTypeId;
    } else {
      warnings.push(esiResult.message);
    }
  } else if (parseResult.source === "zkillboard" && killmailId) {
    warnings.push(
      "Killmail ID detected, but hash is required for official ESI killmail lookup. Select ship manually or paste an ESI killmail URL."
    );
  }

  if (detectedShipTypeId) {
    const detectedShip = await findShipTypeByTypeId(detectedShipTypeId);
    detectedShipName = detectedShip?.typeName || "";

    if (!detectedShipName) {
      warnings.push(
        `Killmail ship Type ID ${detectedShipTypeId} was not found in the cached EVE ship lookup.`
      );
    }
  }

  if (selectedShipTypeId) {
    const selectedShip = await findShipTypeByTypeId(selectedShipTypeId);
    selectedShipName = selectedShip?.typeName || selectedShipName;

    if (!selectedShip) {
      warnings.push(
        `Selected ship Type ID ${selectedShipTypeId} was not found in the cached EVE ship lookup.`
      );
    }
  } else if (selectedShipName) {
    const selectedShip = await findShipTypeByName(selectedShipName);
    selectedShipTypeId = selectedShip?.typeId || null;
    selectedShipName = selectedShip?.typeName || selectedShipName;
  }

  const effectiveShipTypeId = selectedShipTypeId || detectedShipTypeId;
  const effectiveShipName = selectedShipName || detectedShipName;

  if (selectedShipTypeId) {
    shipDetectionSource = "manual";
  } else if (detectedShipTypeId) {
    shipDetectionSource = "killmail";
  }

  const insurancePayout = effectiveShipTypeId
    ? await getPlatinumInsurancePayout(effectiveShipTypeId, effectiveShipName)
    : {
        payout: null,
        warning: "No ship Type ID available for Platinum insurance lookup."
      };

  if (insurancePayout.warning) {
    warnings.push(insurancePayout.warning);
  }

  const baseLossValue = killmailTotalValue || input.lossValue || input.requestedAmount;
  const calculationSource = getCalculationSource({
    hasKillmailValue: Boolean(killmailTotalValue),
    hasManualValue: Boolean(input.lossValue || input.requestedAmount),
    hasShip: Boolean(effectiveShipTypeId)
  });
  const calculatedEligibleAmount = baseLossValue
    ? calculateEligibleAmount(baseLossValue, insurancePayout.payout)
    : null;

  if (!baseLossValue) {
    warnings.push("No loss value entered and no public killmail total value was found.");
  }

  if (!parseResult.isValid && input.killmailUrl.trim()) {
    error = parseResult.message;
  }

  const assistStatus = getAssistStatus({
    hasCalculation: Boolean(calculatedEligibleAmount),
    hasManualShip: Boolean(selectedShipTypeId || selectedShipName),
    hasWarnings: warnings.length > 0,
    parseResult
  });

  return {
    assistStatus,
    calculationSource,
    calculatedEligibleAmount,
    detectedShipName,
    detectedShipTypeId,
    insuranceLevelUsed: "Platinum",
    insurancePayout: insurancePayout.payout,
    killmailHash,
    killmailId,
    killmailTotalValue,
    lossValue: input.lossValue || input.requestedAmount,
    parseResult,
    selectedShipName,
    selectedShipTypeId,
    shipDetectionSource,
    warnings,
    error
  };
}

export async function getSrpShipTypes() {
  const types = await getDb().eveTypeLookup.findMany({
    where: {
      isPublished: true,
      typeId: {
        not: null
      },
      OR: [
        { categoryName: { equals: "Ship", mode: "insensitive" } },
        { category: { equals: "Ship", mode: "insensitive" } },
        { category: { equals: "Ships", mode: "insensitive" } }
      ]
    },
    orderBy: [{ groupName: "asc" }, { typeName: "asc" }],
    select: {
      groupName: true,
      iconUrl: true,
      renderUrl: true,
      typeId: true,
      typeName: true
    }
  });

  return types.map((type) => ({
    groupName: type.groupName,
    iconUrl: type.iconUrl || buildEveTypeIconUrl(type.typeId),
    renderUrl: type.renderUrl || buildEveTypeImageUrl(type.typeId),
    typeId: type.typeId as number,
    typeName: type.typeName
  }));
}

export function calculateEligibleAmount(
  baseLossValue: Prisma.Decimal,
  platinumInsurancePayout: Prisma.Decimal | null
) {
  const payout = platinumInsurancePayout || new Prisma.Decimal(0);
  const calculated = baseLossValue.minus(payout);

  return calculated.lessThan(0) ? new Prisma.Decimal(0) : calculated;
}

async function fetchEsiKillmail(killmailId: string, killmailHash: string) {
  const { esiBaseUrl } = getEveSsoServerConfig();
  const url = new URL(
    `${normalizeBaseUrl(esiBaseUrl)}/latest/killmails/${killmailId}/${killmailHash}/`
  );
  url.searchParams.set("datasource", datasource);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "VyrajCommandConsoleV2/srp-assist"
      }
    });

    if (!response.ok) {
      return {
        ok: false as const,
        message: `Official ESI killmail lookup failed with HTTP ${response.status}.`
      };
    }

    const payload = await response.json() as EsiKillmailResponse;

    return {
      ok: true as const,
      shipTypeId: payload.victim?.ship_type_id || null
    };
  } catch {
    return {
      ok: false as const,
      message: "Official ESI killmail lookup failed due to a network or parsing issue."
    };
  }
}

async function fetchZkillboardKillmail(killmailId: string) {
  const url = new URL(`https://zkillboard.com/api/killID/${killmailId}/`);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "VyrajCommandConsoleV2/srp-assist"
      }
    });

    if (!response.ok) {
      return {
        ok: false as const,
        message: `zKillboard public JSON lookup failed with HTTP ${response.status}.`
      };
    }

    const payload = await response.json() as ZkillboardResponse;
    const killmail = payload[0];

    if (!killmail) {
      return {
        ok: false as const,
        message: "zKillboard public JSON lookup did not return a killmail."
      };
    }

    return {
      ok: true as const,
      hash: killmail.zkb?.hash || "",
      shipTypeId: killmail.victim?.ship_type_id || null,
      totalValue: Number.isFinite(killmail.zkb?.totalValue)
        ? new Prisma.Decimal(String(killmail.zkb?.totalValue))
        : null
    };
  } catch {
    return {
      ok: false as const,
      message: "zKillboard public JSON lookup failed due to a network or parsing issue."
    };
  }
}

async function getPlatinumInsurancePayout(typeId: number, typeName: string) {
  const cached = await getDb().srpInsurancePrice.findUnique({
    where: { typeId },
    select: {
      lastFetchedAt: true,
      platinumPayout: true
    }
  });

  if (
    cached?.lastFetchedAt &&
    Date.now() - cached.lastFetchedAt.getTime() < insuranceCacheTtlMs
  ) {
    return {
      payout: cached.platinumPayout,
      warning: cached.platinumPayout ? "" : "Cached Platinum insurance payout is unavailable."
    };
  }

  const { esiBaseUrl } = getEveSsoServerConfig();
  const url = new URL(`${normalizeBaseUrl(esiBaseUrl)}/latest/insurance/prices/`);
  url.searchParams.set("datasource", datasource);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "VyrajCommandConsoleV2/srp-assist"
      }
    });

    if (!response.ok) {
      await upsertInsurancePrice({
        error: `Public ESI insurance lookup failed with HTTP ${response.status}.`,
        levels: [],
        payout: null,
        status: "failed",
        typeId,
        typeName
      });

      return {
        payout: cached?.platinumPayout || null,
        warning: "Public ESI insurance lookup failed. Officer review required."
      };
    }

    const prices = await response.json() as InsurancePriceResponse;
    const entry = prices.find((price) => price.type_id === typeId);
    const platinum = entry?.levels?.find(
      (level) => level.name?.toLocaleLowerCase("en-US") === platinumInsuranceLevel
    );
    const payout = Number.isFinite(platinum?.payout)
      ? new Prisma.Decimal(String(platinum?.payout))
      : null;

    await upsertInsurancePrice({
      error: payout ? "" : "Platinum insurance payout not found.",
      levels: entry?.levels || [],
      payout,
      status: payout ? "success" : "partial",
      typeId,
      typeName
    });

    return {
      payout,
      warning: payout ? "" : "Platinum insurance payout was not found for this ship."
    };
  } catch {
    await upsertInsurancePrice({
      error: "Public ESI insurance lookup failed due to a network or parsing issue.",
      levels: [],
      payout: null,
      status: "failed",
      typeId,
      typeName
    });

    return {
      payout: cached?.platinumPayout || null,
      warning: "Public ESI insurance lookup failed. Officer review required."
    };
  }
}

async function upsertInsurancePrice(input: {
  error: string;
  levels: unknown[];
  payout: Prisma.Decimal | null;
  status: string;
  typeId: number;
  typeName: string;
}) {
  await getDb().srpInsurancePrice.upsert({
    where: { typeId: input.typeId },
    create: {
      fetchError: input.error,
      fetchStatus: input.status,
      lastFetchedAt: new Date(),
      platinumPayout: input.payout,
      rawLevels: input.levels as Prisma.InputJsonValue,
      typeId: input.typeId,
      typeName: input.typeName
    },
    update: {
      fetchError: input.error,
      fetchStatus: input.status,
      lastFetchedAt: new Date(),
      platinumPayout: input.payout,
      rawLevels: input.levels as Prisma.InputJsonValue,
      typeName: input.typeName
    }
  });
}

async function findShipTypeByTypeId(typeId: number) {
  return getDb().eveTypeLookup.findUnique({
    where: { typeId },
    select: {
      iconUrl: true,
      renderUrl: true,
      typeId: true,
      typeName: true
    }
  });
}

async function findShipTypeByName(typeName: string) {
  return getDb().eveTypeLookup.findFirst({
    where: {
      typeName: {
        equals: typeName,
        mode: "insensitive"
      }
    },
    select: {
      iconUrl: true,
      renderUrl: true,
      typeId: true,
      typeName: true
    }
  });
}

function getAssistStatus(input: {
  hasCalculation: boolean;
  hasManualShip: boolean;
  hasWarnings: boolean;
  parseResult: KillmailParseResult;
}): SrpAssistResult["assistStatus"] {
  if (!input.parseResult.isValid && input.parseResult.source !== "empty") {
    return input.hasManualShip || input.hasCalculation ? "partial" : "failed";
  }

  if (input.hasManualShip && input.parseResult.source === "empty") {
    return input.hasCalculation ? "manual" : "partial";
  }

  if (input.hasWarnings) {
    return input.hasCalculation ? "partial" : "failed";
  }

  return input.hasCalculation ? "success" : "not_checked";
}

function getCalculationSource(input: {
  hasKillmailValue: boolean;
  hasManualValue: boolean;
  hasShip: boolean;
}): SrpAssistResult["calculationSource"] {
  if (input.hasKillmailValue && input.hasManualValue) {
    return "mixed";
  }

  if (input.hasKillmailValue) {
    return "killmail";
  }

  if (input.hasManualValue || input.hasShip) {
    return "manual";
  }

  return "none";
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildEveTypeImageUrl(typeId: number | null | undefined) {
  return typeId
    ? `https://images.evetech.net/types/${typeId}/render?size=512`
    : "";
}

function buildEveTypeIconUrl(typeId: number | null | undefined) {
  return typeId
    ? `https://images.evetech.net/types/${typeId}/icon?size=128`
    : "";
}
