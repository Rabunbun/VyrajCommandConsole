import "server-only";
import { getEveSsoServerConfig } from "@/lib/eve-sso/config";

export type PublicEsiStage = "corporation" | "ceo" | "alliance";

export class PublicEsiError extends Error {
  constructor(
    message: string,
    readonly stage: PublicEsiStage,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "PublicEsiError";
  }
}

type EveCorporationPublicData = {
  alliance_id?: number;
  ceo_id?: number;
  date_founded?: string;
  description?: string;
  member_count?: number;
  name?: string;
  tax_rate?: number;
  ticker?: string;
  url?: string;
};

type EveCharacterPublicData = {
  name?: string;
};

type EveAlliancePublicData = {
  name?: string;
};

export type CorpPublicEsiProfile = {
  eveCorporationId: bigint;
  corporationName: string;
  ticker: string;
  ceoId: bigint | null;
  ceoName: string;
  memberCount: number | null;
  taxRate: number | null;
  creationDate: Date | null;
  allianceId: bigint | null;
  allianceName: string;
  description: string;
  url: string;
  warnings: Array<{
    stage: PublicEsiStage;
    httpStatus?: number;
    message: string;
  }>;
};

export async function fetchCorpPublicEsiProfile(
  eveCorporationId: bigint
): Promise<CorpPublicEsiProfile> {
  const config = getEveSsoServerConfig();
  const warnings: CorpPublicEsiProfile["warnings"] = [];
  const corporation = await fetchPublicEsiJson<EveCorporationPublicData>(
    `/latest/corporations/${eveCorporationId.toString()}/`,
    "corporation",
    config
  );
  const ceoId = corporation.ceo_id ? BigInt(corporation.ceo_id) : null;
  const allianceId = corporation.alliance_id ? BigInt(corporation.alliance_id) : null;
  let ceoName = "";
  let allianceName = "";

  if (ceoId) {
    const ceo = await fetchOptionalPublicEsiJson<EveCharacterPublicData>(
      `/latest/characters/${ceoId.toString()}/`,
      "ceo",
      config,
      warnings
    );
    ceoName = cleanText(ceo?.name);
  }

  if (allianceId) {
    const alliance = await fetchOptionalPublicEsiJson<EveAlliancePublicData>(
      `/latest/alliances/${allianceId.toString()}/`,
      "alliance",
      config,
      warnings
    );
    allianceName = cleanText(alliance?.name);
  }

  return {
    eveCorporationId,
    corporationName: cleanText(corporation.name),
    ticker: cleanText(corporation.ticker),
    ceoId,
    ceoName,
    memberCount: Number.isInteger(corporation.member_count)
      ? corporation.member_count ?? null
      : null,
    taxRate:
      typeof corporation.tax_rate === "number" && Number.isFinite(corporation.tax_rate)
        ? corporation.tax_rate
        : null,
    creationDate: parseDate(corporation.date_founded),
    allianceId,
    allianceName,
    description: cleanText(corporation.description),
    url: cleanText(corporation.url),
    warnings
  };
}

async function fetchPublicEsiJson<T>(
  path: string,
  stage: PublicEsiStage,
  config: ReturnType<typeof getEveSsoServerConfig>
) {
  const response = await fetchPublicEsi(path, config, stage);

  if (!response.ok) {
    throw new PublicEsiError(
      `Public ESI ${stage} request failed with status ${response.status}.`,
      stage,
      response.status
    );
  }

  return await response.json() as T;
}

async function fetchOptionalPublicEsiJson<T>(
  path: string,
  stage: PublicEsiStage,
  config: ReturnType<typeof getEveSsoServerConfig>,
  warnings: CorpPublicEsiProfile["warnings"]
) {
  try {
    const response = await fetchPublicEsi(path, config, stage);

    if (!response.ok) {
      warnings.push({
        stage,
        httpStatus: response.status,
        message: `Optional public ESI ${stage} request failed.`
      });

      return null;
    }

    return await response.json() as T;
  } catch (error) {
    warnings.push({
      stage,
      httpStatus: error instanceof PublicEsiError ? error.httpStatus : undefined,
      message:
        error instanceof Error
          ? error.message
          : `Optional public ESI ${stage} request failed.`
    });

    return null;
  }
}

async function fetchPublicEsi(
  path: string,
  config: ReturnType<typeof getEveSsoServerConfig>,
  stage: PublicEsiStage
) {
  const baseUrl = config.esiBaseUrl.replace(/\/$/, "");
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("datasource", "tranquility");
  url.searchParams.set("language", "en");

  if (config.esiCompatibilityDate) {
    url.searchParams.set("compatibility_date", config.esiCompatibilityDate);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "VyrajCommandConsoleV2 public corp profile refresh"
  };

  if (config.esiCompatibilityDate) {
    headers["X-Compatibility-Date"] = config.esiCompatibilityDate;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, {
      cache: "no-store",
      headers,
      signal: controller.signal
    });
  } catch (error) {
    throw new PublicEsiError(
      error instanceof Error ? error.message : "Public ESI request failed.",
      stage
    );
  } finally {
    clearTimeout(timeout);
  }
}

function cleanText(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
