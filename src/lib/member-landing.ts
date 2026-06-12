import "server-only";
import { OfficerRole, OfficerStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getUnlinkedIdentityFromCookie } from "@/lib/eve-sso/oauth";
import { getCurrentOfficerSession, type CurrentOfficerSession } from "@/lib/session";

export type MemberLandingCorp = {
  id: string;
  name: string;
  slug: string;
  ticker: string;
};

export type MemberLandingIdentity = {
  id: string;
  characterId: string;
  characterName: string;
  corporationId: string;
  corporationName: string;
  allianceId: string;
  allianceName: string;
  lastEveLoginAt: string;
  lastIdentityRefreshAt: string;
  memberLandingSeenAt: string;
};

export type MemberLandingContext = {
  accessMode: "linked_officer" | "verified_member" | "missing_identity";
  session: CurrentOfficerSession | null;
  identity: MemberLandingIdentity | null;
  matchedCorp: MemberLandingCorp | null;
  matchedBy: "corporation_id" | "member_corp_id" | "none";
  explanation: string;
};

export type AllianceAccessIdentityContext = {
  characterId: string;
  characterName: string;
  statusLabel: string;
  detailLabel: string;
} | null;

export async function getMemberLandingContext(): Promise<MemberLandingContext> {
  const session = await getCurrentOfficerSession();

  if (session) {
    const identity = await getLatestLinkedIdentityForOfficer(session.officer.id);

    return {
      accessMode: "linked_officer",
      session,
      identity: identity ? formatIdentity(identity) : null,
      matchedCorp: identity?.memberCorp ? formatCorp(identity.memberCorp) : null,
      matchedBy: identity?.memberCorp ? "member_corp_id" : "none",
      explanation:
        "An active Vyraj officer session is already unlocked. EVE identity can confirm character context, but internal officer permissions still control command access."
    };
  }

  const identity = await getUnlinkedIdentityFromCookie();

  if (!identity) {
    return {
      accessMode: "missing_identity",
      session: null,
      identity: null,
      matchedCorp: null,
      matchedBy: "none",
      explanation:
        "No active EVE identity checkpoint is available. Use EVE SSO to verify a character or officer login for command access."
    };
  }

  const matchedByCorporation = identity.corporationId
    ? await getCorpMatchByCorporationId(identity.corporationId)
    : null;
  const matchedCorp = identity.memberCorp || matchedByCorporation;

  return {
    accessMode: "verified_member",
    session: null,
    identity: formatIdentity(identity),
    matchedCorp: matchedCorp ? formatCorp(matchedCorp) : null,
    matchedBy: identity.memberCorp
      ? "member_corp_id"
      : matchedByCorporation
        ? "corporation_id"
        : "none",
    explanation: matchedCorp
      ? "Your EVE corporation matches a configured Vyraj corp portal. This enables safe member navigation only; officer and admin powers still require an explicit Super Admin link."
      : "Your EVE identity is verified, but your current corporation does not match a configured Vyraj corp portal. No officer or admin access has been granted."
  };
}

export async function markMemberLandingSeen(identityId: string) {
  await getDb().eveIdentity.updateMany({
    where: {
      id: identityId,
      memberLandingSeenAt: null
    },
    data: {
      memberLandingSeenAt: new Date()
    }
  });
}

export async function getAllianceAccessIdentityContext(
  session: CurrentOfficerSession | null
): Promise<AllianceAccessIdentityContext> {
  if (session) {
    const identity = await getLatestLinkedIdentityForOfficer(session.officer.id);

    if (identity) {
      return {
        characterId: identity.characterId.toString(),
        characterName: identity.characterName,
        statusLabel:
          session.officer.role === OfficerRole.SUPER_ADMIN
            ? "Alliance Admin / Super Admin"
            : "Alliance Officer",
        detailLabel: "Linked EVE SSO identity"
      };
    }

    return null;
  }

  const identity = await getUnlinkedIdentityFromCookie();

  if (!identity) {
    return null;
  }

  return {
    characterId: identity.characterId.toString(),
    characterName: identity.characterName,
    statusLabel: "Verified EVE Member",
    detailLabel: identity.memberCorp
      ? `${identity.memberCorp.name} portal match`
      : "No matched Vyraj corp"
  };
}

async function getLatestLinkedIdentityForOfficer(officerId: string) {
  return await getDb().eveIdentity.findFirst({
    where: {
      officerId,
      officer: {
        status: OfficerStatus.ACTIVE
      }
    },
    orderBy: [
      { lastEveLoginAt: "desc" },
      { updatedAt: "desc" }
    ],
    select: identitySelect()
  });
}

async function getCorpMatchByCorporationId(corporationId: bigint) {
  const config = await getDb().corpEveIdentityConfig.findUnique({
    where: {
      eveCorporationId: corporationId
    },
    select: {
      corp: {
        select: corpSelect()
      }
    }
  });

  return config?.corp ?? null;
}

function identitySelect() {
  return {
    id: true,
    characterId: true,
    characterName: true,
    corporationId: true,
    corporationName: true,
    allianceId: true,
    allianceName: true,
    lastEveLoginAt: true,
    lastIdentityRefreshAt: true,
    memberLandingSeenAt: true,
    memberCorp: {
      select: corpSelect()
    }
  };
}

function corpSelect() {
  return {
    id: true,
    name: true,
    slug: true,
    ticker: true
  };
}

function formatIdentity(identity: {
  id: string;
  characterId: bigint;
  characterName: string;
  corporationId: bigint | null;
  corporationName: string;
  allianceId: bigint | null;
  allianceName: string;
  lastEveLoginAt: Date | null;
  lastIdentityRefreshAt: Date | null;
  memberLandingSeenAt: Date | null;
}) {
  return {
    id: identity.id,
    characterId: identity.characterId.toString(),
    characterName: identity.characterName,
    corporationId: identity.corporationId?.toString() || "",
    corporationName: identity.corporationName,
    allianceId: identity.allianceId?.toString() || "",
    allianceName: identity.allianceName,
    lastEveLoginAt: identity.lastEveLoginAt?.toISOString() || "",
    lastIdentityRefreshAt: identity.lastIdentityRefreshAt?.toISOString() || "",
    memberLandingSeenAt: identity.memberLandingSeenAt?.toISOString() || ""
  };
}

function formatCorp(corp: MemberLandingCorp) {
  return {
    id: corp.id,
    name: corp.name,
    slug: corp.slug,
    ticker: corp.ticker
  };
}

export function getOfficerDestination(session: CurrentOfficerSession) {
  if (session.officer.role === OfficerRole.SUPER_ADMIN) {
    return "/admin/super";
  }

  return session.assignedCorps[0]
    ? `/corp/${session.assignedCorps[0].corpSlug}`
    : "/";
}
