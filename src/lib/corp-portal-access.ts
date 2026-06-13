import "server-only";
import { CorpStatus, OfficerRole } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getUnlinkedIdentityFromCookie } from "@/lib/eve-sso/oauth";
import { hasPermission } from "@/lib/permissions";
import {
  getCurrentOfficerSession,
  isSuperAdminSession,
  type CurrentOfficerSession
} from "@/lib/session";

export type CorpPortalAccessLevel =
  | "super_admin"
  | "officer"
  | "verified_member"
  | "denied";

export type CorpPortalAccessCorp = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
  eveIdentityConfig: {
    eveCorporationId: bigint | null;
    eveCorporationName: string;
    eveAllianceId: bigint | null;
    eveAllianceName: string;
  } | null;
};

export type CorpPortalAccessIdentity = {
  id: string;
  characterId: bigint;
  characterName: string;
  corporationId: bigint | null;
  corporationName: string;
  allianceId: bigint | null;
  allianceName: string;
  memberCorp: {
    id: string;
    slug: string;
    name: string;
    ticker: string;
  } | null;
};

export type CorpPortalAccessContext = {
  allowed: boolean;
  accessLevel: CorpPortalAccessLevel;
  reason: string;
  loginRequired: boolean;
  corp: CorpPortalAccessCorp | null;
  session: CurrentOfficerSession | null;
  identity: CorpPortalAccessIdentity | null;
  matchedCorp: {
    id: string;
    slug: string;
    name: string;
    ticker: string;
  } | null;
};

const memberPortalStatuses = new Set<CorpStatus>([
  CorpStatus.ACTIVE,
  CorpStatus.TRIAL
]);

const corpPortalOfficerPermissions = [
  "corpDetailsEdit",
  "corpDashboardView",
  "recruitmentReview",
  "lootSplitManage",
  "srpReview",
  "doctrineManage",
  "operationsManage"
];

export async function getCorpPortalAccessContext(
  corpSlug: string,
  options: {
    session?: CurrentOfficerSession | null;
  } = {}
): Promise<CorpPortalAccessContext> {
  const session = options.session === undefined
    ? await getCurrentOfficerSession()
    : options.session;
  const [corp, identity] = await Promise.all([
    getCorpForPortalAccess(corpSlug),
    getUnlinkedIdentityFromCookie()
  ]);

  if (!corp) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "Corp portal was not found.",
      loginRequired: false,
      corp: null,
      session,
      identity,
      matchedCorp: null
    };
  }

  if (isSuperAdminSession(session)) {
    return {
      allowed: true,
      accessLevel: "super_admin",
      reason: "Super Admin access allows all corp portals.",
      loginRequired: false,
      corp,
      session,
      identity,
      matchedCorp: corpSummary(corp)
    };
  }

  if (session && officerCanAccessCorpPortal(session, corp.id)) {
    return {
      allowed: true,
      accessLevel: "officer",
      reason: "Officer access is allowed by assigned corp or internal corp permission.",
      loginRequired: false,
      corp,
      session,
      identity,
      matchedCorp: corpSummary(corp)
    };
  }

  const memberEvaluation = evaluateMemberCorpPortalAccess({
    corp,
    identity
  });

  return {
    ...memberEvaluation,
    corp,
    session,
    identity
  };
}

export function officerCanAccessCorpPortal(
  session: CurrentOfficerSession | null,
  corpId: string
) {
  if (!session) {
    return false;
  }

  if (session.officer.role === OfficerRole.SUPER_ADMIN) {
    return true;
  }

  if (session.assignedCorps.some((corp) => corp.corpId === corpId)) {
    return true;
  }

  return corpPortalOfficerPermissions.some((permission) =>
    hasPermission(session, permission, corpId)
  );
}

export function evaluateMemberCorpPortalAccess(input: {
  corp: CorpPortalAccessCorp;
  identity: CorpPortalAccessIdentity | null;
}): Pick<
  CorpPortalAccessContext,
  "allowed" | "accessLevel" | "reason" | "loginRequired" | "matchedCorp"
> {
  if (!memberPortalStatuses.has(input.corp.status)) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "This corp portal is not active for member access.",
      loginRequired: false,
      matchedCorp: null
    };
  }

  if (!input.identity) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "Login with EVE or an officer account is required for corp portal access.",
      loginRequired: true,
      matchedCorp: null
    };
  }

  if (!input.identity.corporationId) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "Your verified EVE identity does not have a current corporation ID.",
      loginRequired: false,
      matchedCorp: null
    };
  }

  if (!input.corp.eveIdentityConfig?.eveCorporationId) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "This corp portal has no EVE corporation ID configured for member matching.",
      loginRequired: false,
      matchedCorp: null
    };
  }

  if (input.identity.corporationId !== input.corp.eveIdentityConfig.eveCorporationId) {
    return {
      allowed: false,
      accessLevel: "denied",
      reason: "Your current EVE corporation does not match this corp portal.",
      loginRequired: false,
      matchedCorp: input.identity.memberCorp
    };
  }

  return {
    allowed: true,
    accessLevel: "verified_member",
    reason: "Verified EVE corporation membership matches this corp portal.",
    loginRequired: false,
    matchedCorp: corpSummary(input.corp)
  };
}

export async function getOfficerOnlyDeniedContext(corpSlug: string) {
  const access = await getCorpPortalAccessContext(corpSlug);

  return {
    ...access,
    allowed: false,
    accessLevel: "denied" as const,
    reason: access.loginRequired
      ? access.reason
      : "Officer permissions are required for this module."
  };
}

async function getCorpForPortalAccess(corpSlug: string) {
  return await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
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
  });
}

function corpSummary(corp: CorpPortalAccessCorp) {
  return {
    id: corp.id,
    slug: corp.slug,
    name: corp.name,
    ticker: corp.ticker
  };
}
