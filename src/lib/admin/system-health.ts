import "server-only";
import { CorpStatus, OfficerRole, OfficerStatus } from "@prisma/client";
import { checkDatabaseConnection, getDb, isDatabaseConfigured } from "@/lib/db";
import { getEveSsoConfigStatus, type EveSsoConfigStatus } from "@/lib/eve-sso/config";

export type HealthStatus = "OK" | "Warning" | "Error" | "Not configured";

export type HealthCheck = {
  label: string;
  status: HealthStatus;
  detail: string;
};

export type HealthWarning = {
  label: string;
  detail: string;
};

export type SystemHealthCounts = {
  corps: number;
  activeTrialCorps: number;
  officers: number;
  activeOfficers: number;
  superAdmins: number;
  activeSuperAdmins: number;
  allianceHubContent: number;
  operations: number;
  srpRequests: number;
  doctrineFits: number;
  recruitmentApplicants: number;
  lootSplits: number;
  auditLogEntries: number;
  eveTypeLookupRows: number;
  publishedShipTypeLookupRows: number;
  lastEveTypeLookupRefreshAt: string | null;
  corpEveCorporationIdsConfigured: number;
  corpEveSyncEnabled: number;
  corpMissingEveCorporationId: number;
  corpEveSyncEnabledMissingCorporationId: number;
  eveIdentities: number;
  eveIdentitiesWithCorporationId: number;
  eveIdentitiesWithAllianceId: number;
  eveIdentitiesWithMemberLandingSeen: number;
  eveIdentitiesMatchedToConfiguredCorp: number;
  corpPublicEsiProfilesSynced: number;
  corpPublicEsiProfilesNeverSynced: number;
  recentFailedCorpPublicEsiProfileRefreshes: number;
  lastSuccessfulCorpPublicEsiSyncAt: string | null;
  srpAssistFailedRequests: number;
  srpAssistPartialRequests: number;
  srpAssistSuccessfulRequests: number;
  srpInsuranceCachedTypes: number;
  srpInsuranceFailedTypes: number;
  srpInsuranceLastFetchedAt: string | null;
};

export type RecentAuditHeartbeat = {
  id: string;
  createdAt: string;
  officerName: string;
  module: string;
  action: string;
  summary: string;
};

export type SystemHealthData = {
  generatedAt: string;
  environmentName: string;
  checks: HealthCheck[];
  eveSso: EveSsoConfigStatus;
  counts: SystemHealthCounts | null;
  recentAudit: RecentAuditHeartbeat[];
  warnings: HealthWarning[];
};

export async function getSystemHealthData(): Promise<SystemHealthData> {
  const generatedAt = new Date().toISOString();
  const environmentName = getEnvironmentName();
  const database = await checkDatabaseConnection();
  const authSecretLength = process.env.AUTH_SESSION_SECRET?.trim().length || 0;
  const cookieNameConfigured = Boolean(process.env.AUTH_COOKIE_NAME?.trim());
  const sessionDurationRaw = process.env.SESSION_DURATION_HOURS?.trim();
  const sessionDuration = Number(sessionDurationRaw || 6);
  const sessionDurationConfigured = Boolean(sessionDurationRaw);
  const sessionDurationValid = Number.isFinite(sessionDuration) && sessionDuration > 0;
  const databaseUrlConfigured = isDatabaseConfigured();
  const eveSso = getEveSsoConfigStatus();

  const checks: HealthCheck[] = [
    {
      label: "App runtime loaded",
      status: "OK",
      detail: "Server component runtime responded."
    },
    {
      label: "Current environment",
      status: environmentName === "Unknown" ? "Warning" : "OK",
      detail: environmentName
    },
    {
      label: "Server time",
      status: "OK",
      detail: generatedAt
    },
    {
      label: "DATABASE_URL configured",
      status: databaseUrlConfigured ? "OK" : "Not configured",
      detail: databaseUrlConfigured ? "Configured" : "Missing"
    },
    {
      label: "Database connection",
      status: database.status === "connected" ? "OK" : database.status === "not_configured" ? "Not configured" : "Error",
      detail: database.status === "connected" ? "Database connection succeeded." : "Database check did not complete successfully."
    },
    {
      label: "Prisma query check",
      status: database.status === "connected" ? "OK" : database.status === "not_configured" ? "Not configured" : "Error",
      detail: database.status === "connected" ? "SELECT 1 completed." : "Prisma query unavailable."
    },
    {
      label: "Auth configured",
      status: authSecretLength >= 32 ? "OK" : "Error",
      detail: authSecretLength >= 32 ? "Session secret length is valid." : "Session secret is missing or too short."
    },
    {
      label: "AUTH_SESSION_SECRET",
      status: authSecretLength >= 32 ? "OK" : authSecretLength > 0 ? "Error" : "Not configured",
      detail: authSecretLength >= 32 ? "Present with valid length." : "Missing or shorter than 32 characters."
    },
    {
      label: "AUTH_COOKIE_NAME",
      status: cookieNameConfigured ? "OK" : "Warning",
      detail: cookieNameConfigured ? "Configured." : "Using application default."
    },
    {
      label: "SESSION_DURATION_HOURS",
      status: sessionDurationValid ? sessionDurationConfigured ? "OK" : "Warning" : "Error",
      detail: sessionDurationValid
        ? sessionDurationConfigured
          ? "Configured with a positive value."
          : "Using application default."
        : "Invalid session duration."
    }
  ];

  const { counts, recentAudit, databaseReadFailed } = database.status === "connected"
    ? await readDatabaseSummary()
    : { counts: null, recentAudit: [], databaseReadFailed: false };

  if (databaseReadFailed) {
    checks.push({
      label: "Database summary query",
      status: "Error",
      detail: "One or more database summary queries failed."
    });
  }

  const warnings = buildWarnings({
    checks,
    counts,
    databaseUrlConfigured,
    authSecretLength,
    sessionDurationValid
  });

  return {
    generatedAt,
    environmentName,
    checks,
    eveSso,
    counts,
    recentAudit,
    warnings
  };
}

async function readDatabaseSummary() {
  try {
    const [
      corps,
      activeTrialCorps,
      officers,
      activeOfficers,
      superAdmins,
      activeSuperAdmins,
      allianceHubContent,
      operations,
      srpRequests,
      doctrineFits,
      recruitmentApplicants,
      lootSplits,
      auditLogEntries,
      eveTypeLookupRows,
      publishedShipTypeLookupRows,
      lastEveTypeLookupRefresh,
      corpEveCorporationIdsConfigured,
      corpEveSyncEnabled,
      corpEveSyncEnabledMissingCorporationId,
      eveIdentities,
      eveIdentitiesWithCorporationId,
      eveIdentitiesWithAllianceId,
      eveIdentitiesWithMemberLandingSeen,
      corpPublicEsiProfilesSynced,
      corpPublicEsiProfilesNeverSynced,
      recentFailedCorpPublicEsiProfileRefreshes,
      lastSuccessfulPublicProfileSync,
      srpAssistSuccessfulRequests,
      srpAssistPartialRequests,
      srpAssistFailedRequests,
      srpInsuranceCachedTypes,
      srpInsuranceFailedTypes,
      srpInsuranceLastFetched,
      recentAuditRows
    ] = await Promise.all([
      getDb().corp.count(),
      getDb().corp.count({
        where: { status: { in: [CorpStatus.ACTIVE, CorpStatus.TRIAL] } }
      }),
      getDb().officer.count(),
      getDb().officer.count({ where: { status: OfficerStatus.ACTIVE } }),
      getDb().officer.count({ where: { role: OfficerRole.SUPER_ADMIN } }),
      getDb().officer.count({
        where: {
          role: OfficerRole.SUPER_ADMIN,
          status: OfficerStatus.ACTIVE
        }
      }),
      getDb().allianceHubContent.count(),
      getDb().operation.count(),
      getDb().srpRequest.count(),
      getDb().doctrineFit.count(),
      getDb().recruitmentApplicant.count(),
      getDb().lootSplit.count(),
      getDb().officerAuditLog.count(),
      getDb().eveTypeLookup.count(),
      getDb().eveTypeLookup.count({
        where: {
          typeId: {
            not: null
          },
          isPublished: true,
          OR: [
            {
              categoryName: {
                equals: "Ship",
                mode: "insensitive"
              }
            },
            {
              category: {
                equals: "Ship",
                mode: "insensitive"
              }
            },
            {
              category: {
                equals: "Ships",
                mode: "insensitive"
              }
            }
          ]
        }
      }),
      getDb().eveTypeLookup.findFirst({
        where: {
          lastRefreshedAt: {
            not: null
          }
        },
        orderBy: {
          lastRefreshedAt: "desc"
        },
        select: {
          lastRefreshedAt: true
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          eveCorporationId: {
            not: null
          }
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          syncEnabled: true
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          syncEnabled: true,
          eveCorporationId: null
        }
      }),
      getDb().eveIdentity.count(),
      getDb().eveIdentity.count({
        where: {
          corporationId: {
            not: null
          }
        }
      }),
      getDb().eveIdentity.count({
        where: {
          allianceId: {
            not: null
          }
        }
      }),
      getDb().eveIdentity.count({
        where: {
          memberLandingSeenAt: {
            not: null
          }
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          eveCorporationId: {
            not: null
          },
          lastPublicEsiSyncAt: {
            not: null
          }
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          eveCorporationId: {
            not: null
          },
          lastPublicEsiSyncAt: null
        }
      }),
      getDb().corpEveIdentityConfig.count({
        where: {
          publicEsiSyncStatus: "Failed"
        }
      }),
      getDb().corpEveIdentityConfig.findFirst({
        where: {
          lastPublicEsiSyncAt: {
            not: null
          },
          publicEsiSyncStatus: {
            in: ["Success", "Partial"]
          }
        },
        orderBy: {
          lastPublicEsiSyncAt: "desc"
        },
        select: {
          lastPublicEsiSyncAt: true
        }
      }),
      getDb().srpRequest.count({
        where: {
          srpAssistStatus: "success"
        }
      }),
      getDb().srpRequest.count({
        where: {
          srpAssistStatus: "partial"
        }
      }),
      getDb().srpRequest.count({
        where: {
          srpAssistStatus: "failed"
        }
      }),
      getDb().srpInsurancePrice.count({
        where: {
          platinumPayout: {
            not: null
          }
        }
      }),
      getDb().srpInsurancePrice.count({
        where: {
          fetchStatus: "failed"
        }
      }),
      getDb().srpInsurancePrice.findFirst({
        where: {
          lastFetchedAt: {
            not: null
          }
        },
        orderBy: {
          lastFetchedAt: "desc"
        },
        select: {
          lastFetchedAt: true
        }
      }),
      getDb().officerAuditLog.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          createdAt: true,
          officerName: true,
          module: true,
          action: true,
          summary: true
        }
      })
    ]);
    const configuredCorporationIds = await getDb().corpEveIdentityConfig.findMany({
      where: {
        eveCorporationId: {
          not: null
        }
      },
      select: {
        eveCorporationId: true
      }
    });
    const eveIdentitiesMatchedToConfiguredCorp = configuredCorporationIds.length
      ? await getDb().eveIdentity.count({
          where: {
            corporationId: {
              in: configuredCorporationIds
                .map((config) => config.eveCorporationId)
                .filter((id): id is bigint => Boolean(id))
            }
          }
        })
      : 0;

    return {
      counts: {
        corps,
        activeTrialCorps,
        officers,
        activeOfficers,
        superAdmins,
        activeSuperAdmins,
        allianceHubContent,
        operations,
        srpRequests,
        doctrineFits,
        recruitmentApplicants,
        lootSplits,
        auditLogEntries,
        eveTypeLookupRows,
        publishedShipTypeLookupRows,
        lastEveTypeLookupRefreshAt:
          lastEveTypeLookupRefresh?.lastRefreshedAt?.toISOString() ?? null,
        corpEveCorporationIdsConfigured,
        corpEveSyncEnabled,
        corpMissingEveCorporationId:
          corps - corpEveCorporationIdsConfigured,
        corpEveSyncEnabledMissingCorporationId,
        eveIdentities,
        eveIdentitiesWithCorporationId,
        eveIdentitiesWithAllianceId,
        eveIdentitiesWithMemberLandingSeen,
        eveIdentitiesMatchedToConfiguredCorp,
        corpPublicEsiProfilesSynced,
        corpPublicEsiProfilesNeverSynced,
        recentFailedCorpPublicEsiProfileRefreshes,
        lastSuccessfulCorpPublicEsiSyncAt:
          lastSuccessfulPublicProfileSync?.lastPublicEsiSyncAt?.toISOString() ?? null,
        srpAssistFailedRequests,
        srpAssistPartialRequests,
        srpAssistSuccessfulRequests,
        srpInsuranceCachedTypes,
        srpInsuranceFailedTypes,
        srpInsuranceLastFetchedAt:
          srpInsuranceLastFetched?.lastFetchedAt?.toISOString() ?? null
      },
      recentAudit: recentAuditRows.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString()
      })),
      databaseReadFailed: false
    };
  } catch {
    return {
      counts: null,
      recentAudit: [],
      databaseReadFailed: true
    };
  }
}

function buildWarnings(input: {
  checks: HealthCheck[];
  counts: SystemHealthCounts | null;
  databaseUrlConfigured: boolean;
  authSecretLength: number;
  sessionDurationValid: boolean;
}) {
  const warnings: HealthWarning[] = [];

  if (!input.databaseUrlConfigured) {
    warnings.push({
      label: "DATABASE_URL missing",
      detail: "Database-backed pages and auth cannot operate without DATABASE_URL."
    });
  }

  if (input.authSecretLength < 32) {
    warnings.push({
      label: "AUTH_SESSION_SECRET invalid",
      detail: "Set AUTH_SESSION_SECRET to a random value of at least 32 characters."
    });
  }

  if (!input.sessionDurationValid) {
    warnings.push({
      label: "SESSION_DURATION_HOURS invalid",
      detail: "Use a positive numeric value."
    });
  }

  if (input.counts) {
    if (input.counts.activeSuperAdmins === 0) {
      warnings.push({
        label: "No active Super Admins",
        detail: "At least one active Super Admin is required for administration."
      });
    }

    if (input.counts.corps === 0) {
      warnings.push({
        label: "No corps",
        detail: "Corp Portal and module data require Corp Registry records."
      });
    }

    if (input.counts.eveTypeLookupRows === 0) {
      warnings.push({
        label: "No EVE type lookup rows",
        detail: "Doctrine image/type helpers may be limited until lookup rows are seeded."
      });
    }

    if (input.counts.publishedShipTypeLookupRows === 0) {
      warnings.push({
        label: "No cached EVE ship types",
        detail:
          "Run the public ESI ship type refresh before relying on full doctrine ship selection."
      });
    }

    if (input.counts.corpEveSyncEnabledMissingCorporationId > 0) {
      warnings.push({
        label: "Corp EVE sync flag without corporation ID",
        detail:
          "One or more corps have future sync enabled without an EVE corporation ID."
      });
    }

    if (input.counts.corpEveCorporationIdsConfigured === 0) {
      warnings.push({
        label: "No configured EVE corp portal matches",
        detail:
          "Identity-aware member landing needs Corp Management EVE corporation IDs to match verified characters to corp portals."
      });
    }

    if (
      input.counts.eveIdentities > 0 &&
      input.counts.eveIdentitiesMatchedToConfiguredCorp === 0
    ) {
      warnings.push({
        label: "EVE identities are not matching corp portals",
        detail:
          "Verified identities exist, but none currently match configured Corp EVE corporation IDs."
      });
    }
  }

  for (const check of input.checks) {
    if (check.status === "Error") {
      warnings.push({
        label: `${check.label} failed`,
        detail: check.detail
      });
    }
  }

  return warnings;
}

function getEnvironmentName() {
  return process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV?.trim() || "Unknown";
}
