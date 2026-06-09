import "server-only";
import { CorpStatus } from "@prisma/client";
import { getDb } from "@/lib/db";

export const corpModuleOptions = [
  {
    key: "attendance",
    label: "Op Attendance",
    memberSafe: true
  },
  {
    key: "doctrine",
    label: "Doctrine Readiness",
    memberSafe: true
  },
  {
    key: "srp",
    label: "SRP Requests",
    memberSafe: true
  },
  {
    key: "recruitment",
    label: "Recruitment Review",
    memberSafe: false
  },
  {
    key: "lootSplits",
    label: "Loot Splits",
    memberSafe: false
  },
  {
    key: "dashboard",
    label: "Corp Dashboard",
    memberSafe: false
  }
] as const;

export type CorpModuleKey = (typeof corpModuleOptions)[number]["key"];
export type CorpModuleOption = (typeof corpModuleOptions)[number];

export type AdminEnabledModules = Record<CorpModuleKey, boolean>;

export type AdminCorpEveIdentityConfig = {
  eveCorporationId: string | null;
  eveCorporationName: string;
  eveTicker: string;
  ceoId: string | null;
  ceoName: string;
  memberCount: number | null;
  taxRate: number | null;
  creationDate: string | null;
  eveAllianceId: string | null;
  eveAllianceName: string;
  publicDescription: string;
  publicUrl: string;
  lastPublicEsiSyncAt: string | null;
  publicEsiSyncStatus: string;
  publicEsiSyncError: string;
  syncEnabled: boolean;
  lastVerifiedAt: string | null;
};

export type AdminCorpView = {
  id: string;
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
  announcements: string[];
  enabledModules: AdminEnabledModules;
  eveIdentityConfig: AdminCorpEveIdentityConfig | null;
  createdAt: string;
  updatedAt: string;
};

export type CorpManagementData = {
  corps: AdminCorpView[];
  moduleOptions: readonly CorpModuleOption[];
};

const defaultEnabledModules: AdminEnabledModules = {
  attendance: true,
  doctrine: true,
  srp: true,
  recruitment: false,
  lootSplits: false,
  dashboard: false
};

export function getDefaultEnabledModules(): AdminEnabledModules {
  return { ...defaultEnabledModules };
}

export async function getCorpManagementData(): Promise<CorpManagementData> {
  const corps = await getDb().corp.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
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
          eveTicker: true,
          ceoId: true,
          ceoName: true,
          memberCount: true,
          taxRate: true,
          creationDate: true,
          eveAllianceId: true,
          eveAllianceName: true,
          publicDescription: true,
          publicUrl: true,
          lastPublicEsiSyncAt: true,
          publicEsiSyncStatus: true,
          publicEsiSyncError: true,
          syncEnabled: true,
          lastVerifiedAt: true
        }
      },
      createdAt: true,
      updatedAt: true
    }
  });

  return {
    corps: corps.map((corp) => ({
      ...corp,
      announcements: asStringArray(corp.announcements),
      enabledModules: asEnabledModules(corp.enabledModules),
      eveIdentityConfig: corp.eveIdentityConfig
        ? {
            eveCorporationId:
              corp.eveIdentityConfig.eveCorporationId?.toString() ?? null,
            eveCorporationName: corp.eveIdentityConfig.eveCorporationName,
            eveTicker: corp.eveIdentityConfig.eveTicker,
            ceoId: corp.eveIdentityConfig.ceoId?.toString() ?? null,
            ceoName: corp.eveIdentityConfig.ceoName,
            memberCount: corp.eveIdentityConfig.memberCount,
            taxRate: corp.eveIdentityConfig.taxRate,
            creationDate:
              corp.eveIdentityConfig.creationDate?.toISOString() ?? null,
            eveAllianceId:
              corp.eveIdentityConfig.eveAllianceId?.toString() ?? null,
            eveAllianceName: corp.eveIdentityConfig.eveAllianceName,
            publicDescription: corp.eveIdentityConfig.publicDescription,
            publicUrl: corp.eveIdentityConfig.publicUrl,
            lastPublicEsiSyncAt:
              corp.eveIdentityConfig.lastPublicEsiSyncAt?.toISOString() ?? null,
            publicEsiSyncStatus: corp.eveIdentityConfig.publicEsiSyncStatus,
            publicEsiSyncError: corp.eveIdentityConfig.publicEsiSyncError,
            syncEnabled: corp.eveIdentityConfig.syncEnabled,
            lastVerifiedAt:
              corp.eveIdentityConfig.lastVerifiedAt?.toISOString() ?? null
          }
        : null,
      createdAt: corp.createdAt.toISOString(),
      updatedAt: corp.updatedAt.toISOString()
    })),
    moduleOptions: corpModuleOptions
  };
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function asEnabledModules(value: unknown): AdminEnabledModules {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultEnabledModules();
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
