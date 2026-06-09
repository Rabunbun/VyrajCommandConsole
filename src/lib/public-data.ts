import {
  ContentAudience,
  ContentStatus,
  CorpStatus,
  type AllianceContentPriority,
  type AllianceContentType
} from "@prisma/client";
import { getDb } from "@/lib/db";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export type PublicCorpCard = {
  slug: string;
  name: string;
  ticker: string;
  description: string;
  status: CorpStatus;
  recruitmentStatus: string;
  activeMembers: number;
  recentOps: number;
  pendingSrp: number;
  doctrineReadinessPercent: number;
  eveIdentity: PublicCorpEveIdentity | null;
};

export type PublicCorpEveIdentity = {
  eveCorporationId: string | null;
  eveCorporationName: string;
  eveAllianceId: string | null;
  eveAllianceName: string;
  syncEnabled: boolean;
};

export type PublicAllianceHubContent = {
  id: string;
  contentType: AllianceContentType;
  title: string;
  body: string;
  priority: AllianceContentPriority;
  createdAt: string;
  startDate: string | null;
  endDate: string | null;
};

export type PublicAllianceHubData = {
  corps: PublicCorpCard[];
  content: PublicAllianceHubContent[];
};

export type PublicCorpPortal = PublicCorpCard & {
  id: string;
  announcements: string[];
  enabledModules: PublicEnabledModules;
};

export type PublicCorpPortalResult =
  | {
      status: "public";
      corp: PublicCorpPortal;
    }
  | {
      status: "not_found";
    }
  | {
      status: "access_denied";
    };

export type PublicEnabledModules = {
  attendance: boolean;
  doctrine: boolean;
  srp: boolean;
  recruitment: boolean;
  lootSplits: boolean;
  dashboard: boolean;
};

const defaultEnabledModules: PublicEnabledModules = {
  attendance: false,
  doctrine: false,
  srp: false,
  recruitment: false,
  lootSplits: false,
  dashboard: false
};

export async function getActivePublicCorps(): Promise<PublicCorpCard[]> {
  const corps = await getDb().corp.findMany({
    where: {
      status: {
        in: publicCorpStatuses
      }
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      description: true,
      status: true,
      recruitmentStatus: true,
      activeMembers: true,
      recentOps: true,
      pendingSrp: true,
      doctrineReadinessPercent: true,
      eveIdentityConfig: {
        select: {
          eveCorporationId: true,
          eveCorporationName: true,
          eveAllianceId: true,
          eveAllianceName: true,
          syncEnabled: true
        }
      }
    }
  });

  return corps.map((corp) => ({
    ...corp,
    eveIdentity: formatPublicEveIdentity(corp.eveIdentityConfig)
  }));
}

export async function getPublicAllianceHubContent(): Promise<PublicAllianceHubContent[]> {
  const now = new Date();
  const content = await getDb().allianceHubContent.findMany({
    where: {
      status: ContentStatus.ACTIVE,
      audience: ContentAudience.ALL_MEMBERS,
      AND: [
        {
          OR: [{ startDate: null }, { startDate: { lte: now } }]
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: now } }]
        }
      ]
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      contentType: true,
      title: true,
      body: true,
      priority: true,
      createdAt: true,
      startDate: true,
      endDate: true
    }
  });

  return content.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    startDate: item.startDate ? item.startDate.toISOString() : null,
    endDate: item.endDate ? item.endDate.toISOString() : null
  }));
}

export async function getPublicAllianceHubData(): Promise<PublicAllianceHubData> {
  const [corps, content] = await Promise.all([
    getActivePublicCorps(),
    getPublicAllianceHubContent()
  ]);

  return { corps, content };
}

export async function getPublicCorpPortalData(
  corpSlug: string
): Promise<PublicCorpPortalResult> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      description: true,
      status: true,
      recruitmentStatus: true,
      activeMembers: true,
      recentOps: true,
      pendingSrp: true,
      doctrineReadinessPercent: true,
      announcements: true,
      enabledModules: true,
      eveIdentityConfig: {
        select: {
          eveCorporationId: true,
          eveCorporationName: true,
          eveAllianceId: true,
          eveAllianceName: true,
          syncEnabled: true
        }
      }
    }
  });

  if (!corp) {
    return { status: "not_found" };
  }

  if (!publicCorpStatuses.includes(corp.status)) {
    return { status: "access_denied" };
  }

  return {
    status: "public",
    corp: {
      ...corp,
      announcements: asStringArray(corp.announcements),
      enabledModules: asEnabledModules(corp.enabledModules),
      eveIdentity: formatPublicEveIdentity(corp.eveIdentityConfig)
    }
  };
}

export function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

function asEnabledModules(value: unknown): PublicEnabledModules {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultEnabledModules;
  }

  const source = value as Record<string, unknown>;

  return {
    attendance: source.attendance === true,
    doctrine: source.doctrine === true,
    srp: source.srp === true,
    recruitment: source.recruitment === true,
    lootSplits: source.lootSplits === true || source.loot === true,
    dashboard: source.dashboard === true
  };
}

function formatPublicEveIdentity(config: {
  eveCorporationId: bigint | null;
  eveCorporationName: string;
  eveAllianceId: bigint | null;
  eveAllianceName: string;
  syncEnabled: boolean;
} | null): PublicCorpEveIdentity | null {
  if (!config) {
    return null;
  }

  return {
    eveCorporationId: config.eveCorporationId?.toString() ?? null,
    eveCorporationName: config.eveCorporationName,
    eveAllianceId: config.eveAllianceId?.toString() ?? null,
    eveAllianceName: config.eveAllianceName,
    syncEnabled: config.syncEnabled
  };
}
