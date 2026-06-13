import "server-only";
import { CorpStatus, OfficerRole, OfficerStatus } from "@prisma/client";
import { evaluateMemberCorpPortalAccess } from "@/lib/corp-portal-access";
import { getDb } from "@/lib/db";

export type AccessPolicyFilter =
  | "all"
  | "linked"
  | "matched"
  | "unmatched"
  | "missing-corp-id";

export type AccessPolicySummary = {
  totalIdentities: number;
  identitiesWithCorporationId: number;
  identitiesMatchedToConfiguredCorp: number;
  linkedOfficers: number;
  unlinkedVerifiedMembers: number;
  unmatchedIdentities: number;
  configuredCorpsWithEveIds: number;
  corpsMissingEveIds: number;
  officersWithoutLinkedIdentity: number;
};

export type AccessPolicyIdentityEvaluation = {
  id: string;
  characterId: string;
  characterName: string;
  corporationId: string;
  corporationName: string;
  allianceId: string;
  allianceName: string;
  linkedOfficer: {
    id: string;
    officerName: string;
    role: OfficerRole;
    status: OfficerStatus;
  } | null;
  matchedCorp: {
    id: string;
    name: string;
    slug: string;
    ticker: string;
  } | null;
  wouldAllowMemberPortal: boolean;
  wouldAllowOfficerTools: boolean;
  destination: string;
  reason: string;
};

export type AccessPolicyCorpReadiness = {
  id: string;
  name: string;
  slug: string;
  ticker: string;
  status: CorpStatus;
  eveCorporationId: string;
  eveCorporationName: string;
  matchedIdentityCount: number;
  readinessStatus: "Ready" | "Missing EVE corp ID" | "No matching identities yet";
};

export type AccessPolicyOfficerReadiness = {
  id: string;
  officerName: string;
  role: OfficerRole;
  status: OfficerStatus;
};

export type AccessPolicyPreviewData = {
  summary: AccessPolicySummary;
  identities: AccessPolicyIdentityEvaluation[];
  corps: AccessPolicyCorpReadiness[];
  officersWithoutLinkedIdentity: AccessPolicyOfficerReadiness[];
};

export async function getAccessPolicyPreviewData(): Promise<AccessPolicyPreviewData> {
  const [identities, corps, officers] = await Promise.all([
    getDb().eveIdentity.findMany({
      orderBy: [{ characterName: "asc" }],
      select: {
        id: true,
        characterId: true,
        characterName: true,
        corporationId: true,
        corporationName: true,
        allianceId: true,
        allianceName: true,
        officer: {
          select: {
            id: true,
            officerName: true,
            role: true,
            status: true
          }
        }
      }
    }),
    getDb().corp.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        ticker: true,
        status: true,
        eveIdentityConfig: {
          select: {
            eveCorporationId: true,
            eveCorporationName: true,
            eveAllianceId: true,
            eveAllianceName: true
          }
        }
      }
    }),
    getDb().officer.findMany({
      orderBy: [{ role: "asc" }, { officerName: "asc" }],
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true,
        eveIdentities: {
          select: {
            id: true
          },
          take: 1
        }
      }
    })
  ]);

  const corpByEveCorporationId = new Map(
    corps
      .filter((corp) => corp.eveIdentityConfig?.eveCorporationId)
      .map((corp) => [
        corp.eveIdentityConfig?.eveCorporationId?.toString(),
        {
          id: corp.id,
          name: corp.name,
          slug: corp.slug,
          ticker: corp.ticker,
          status: corp.status,
          eveIdentityConfig: corp.eveIdentityConfig
        }
      ])
  );
  const identityCountByEveCorporationId = new Map<string, number>();

  for (const identity of identities) {
    if (!identity.corporationId) {
      continue;
    }

    const corporationId = identity.corporationId.toString();
    identityCountByEveCorporationId.set(
      corporationId,
      (identityCountByEveCorporationId.get(corporationId) || 0) + 1
    );
  }

  const evaluatedIdentities = identities.map((identity) => {
    const matchedCorp = identity.corporationId
      ? corpByEveCorporationId.get(identity.corporationId.toString()) || null
      : null;

    return evaluateIdentityAccess({
      id: identity.id,
      characterId: identity.characterId.toString(),
      characterName: identity.characterName,
      corporationId: identity.corporationId?.toString() || "",
      corporationName: identity.corporationName,
      allianceId: identity.allianceId?.toString() || "",
      allianceName: identity.allianceName,
      linkedOfficer: identity.officer,
      matchedCorp: matchedCorp
        ? {
            id: matchedCorp.id,
            name: matchedCorp.name,
            slug: matchedCorp.slug,
            ticker: matchedCorp.ticker
          }
        : null,
      matchedPortal: matchedCorp
    });
  });
  const corpReadiness = corps.map((corp) => {
    const eveCorporationId = corp.eveIdentityConfig?.eveCorporationId?.toString() || "";
    const matchedIdentityCount = eveCorporationId
      ? identityCountByEveCorporationId.get(eveCorporationId) || 0
      : 0;
    const readinessStatus: AccessPolicyCorpReadiness["readinessStatus"] =
      !eveCorporationId
        ? "Missing EVE corp ID"
        : matchedIdentityCount > 0
          ? "Ready"
          : "No matching identities yet";

    return {
      id: corp.id,
      name: corp.name,
      slug: corp.slug,
      ticker: corp.ticker,
      status: corp.status,
      eveCorporationId,
      eveCorporationName: corp.eveIdentityConfig?.eveCorporationName || "",
      matchedIdentityCount,
      readinessStatus
    };
  });
  const officersWithoutLinkedIdentity = officers
    .filter((officer) => officer.eveIdentities.length === 0)
    .map((officer) => ({
      id: officer.id,
      officerName: officer.officerName,
      role: officer.role,
      status: officer.status
    }));

  return {
    summary: {
      totalIdentities: evaluatedIdentities.length,
      identitiesWithCorporationId: evaluatedIdentities.filter((identity) =>
        Boolean(identity.corporationId)
      ).length,
      identitiesMatchedToConfiguredCorp: evaluatedIdentities.filter(
        (identity) => identity.wouldAllowMemberPortal
      ).length,
      linkedOfficers: evaluatedIdentities.filter((identity) =>
        Boolean(identity.linkedOfficer)
      ).length,
      unlinkedVerifiedMembers: evaluatedIdentities.filter(
        (identity) => !identity.linkedOfficer
      ).length,
      unmatchedIdentities: evaluatedIdentities.filter(
        (identity) => !identity.wouldAllowMemberPortal
      ).length,
      configuredCorpsWithEveIds: corpReadiness.filter((corp) =>
        Boolean(corp.eveCorporationId)
      ).length,
      corpsMissingEveIds: corpReadiness.filter((corp) => !corp.eveCorporationId)
        .length,
      officersWithoutLinkedIdentity: officersWithoutLinkedIdentity.length
    },
    identities: evaluatedIdentities,
    corps: corpReadiness,
    officersWithoutLinkedIdentity
  };
}

export function filterAccessPolicyIdentities(
  identities: AccessPolicyIdentityEvaluation[],
  input: {
    filter: AccessPolicyFilter;
    query: string;
  }
) {
  const query = input.query.trim().toLocaleLowerCase("en-US");

  return identities.filter((identity) => {
    const matchesFilter =
      input.filter === "all" ||
      (input.filter === "linked" && Boolean(identity.linkedOfficer)) ||
      (input.filter === "matched" && identity.wouldAllowMemberPortal) ||
      (input.filter === "unmatched" && !identity.wouldAllowMemberPortal) ||
      (input.filter === "missing-corp-id" && !identity.corporationId);

    if (!matchesFilter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      identity.characterName,
      identity.characterId,
      identity.corporationName,
      identity.corporationId,
      identity.allianceName,
      identity.allianceId,
      identity.linkedOfficer?.officerName || "",
      identity.matchedCorp?.name || "",
      identity.matchedCorp?.ticker || ""
    ].some((value) => value.toLocaleLowerCase("en-US").includes(query));
  });
}

export function parseAccessPolicyFilter(value?: string): AccessPolicyFilter {
  const allowed: AccessPolicyFilter[] = [
    "all",
    "linked",
    "matched",
    "unmatched",
    "missing-corp-id"
  ];

  return allowed.includes(value as AccessPolicyFilter)
    ? value as AccessPolicyFilter
    : "all";
}

function evaluateIdentityAccess(input: Omit<
  AccessPolicyIdentityEvaluation,
  "destination" | "reason" | "wouldAllowMemberPortal" | "wouldAllowOfficerTools"
> & {
  matchedPortal: {
    id: string;
    name: string;
    slug: string;
    ticker: string;
    status: CorpStatus;
    eveIdentityConfig: {
      eveCorporationId: bigint | null;
      eveCorporationName: string;
      eveAllianceId: bigint | null;
      eveAllianceName: string;
    } | null;
  } | null;
}): AccessPolicyIdentityEvaluation {
  const linkedActiveOfficer = input.linkedOfficer?.status === OfficerStatus.ACTIVE;
  const memberEvaluation = input.matchedPortal
    ? evaluateMemberCorpPortalAccess({
        corp: input.matchedPortal,
        identity: {
          id: input.id,
          characterId: BigInt(input.characterId),
          characterName: input.characterName,
          corporationId: input.corporationId ? BigInt(input.corporationId) : null,
          corporationName: input.corporationName,
          allianceId: input.allianceId ? BigInt(input.allianceId) : null,
          allianceName: input.allianceName,
          memberCorp: input.matchedCorp
        }
      })
    : null;
  const wouldAllowMemberPortal = Boolean(memberEvaluation?.allowed);
  const wouldAllowOfficerTools = Boolean(linkedActiveOfficer);
  const destination = wouldAllowMemberPortal && input.matchedCorp
    ? `/corp/${input.matchedCorp.slug}`
    : "";
  let reason = "";

  if (!input.corporationId) {
    reason = "Identity has no current corporation ID.";
  } else if (memberEvaluation?.allowed && input.matchedCorp) {
    reason = `Corporation ID matches ${input.matchedCorp.name}.`;
  } else if (memberEvaluation) {
    reason = memberEvaluation.reason;
  } else {
    reason = "No configured corp match.";
  }

  if (input.linkedOfficer) {
    reason = linkedActiveOfficer
      ? `${reason} Officer tools depend on linked active officer ${input.linkedOfficer.officerName}.`
      : `${reason} Officer link exists, but officer is not active.`;
  }

  return {
    id: input.id,
    characterId: input.characterId,
    characterName: input.characterName,
    corporationId: input.corporationId,
    corporationName: input.corporationName,
    allianceId: input.allianceId,
    allianceName: input.allianceName,
    linkedOfficer: input.linkedOfficer,
    matchedCorp: input.matchedCorp,
    destination,
    reason,
    wouldAllowMemberPortal,
    wouldAllowOfficerTools
  };
}
