import "server-only";
import { OfficerRole, OfficerStatus } from "@prisma/client";
import { getDb } from "@/lib/db";

export type EveIdentityOfficerOption = {
  id: string;
  officerName: string;
  role: OfficerRole;
  status: OfficerStatus;
};

export type EveIdentityAdminView = {
  id: string;
  characterId: string;
  characterName: string;
  corporationId: string | null;
  corporationName: string;
  allianceId: string | null;
  allianceName: string;
  memberCorp: {
    id: string;
    slug: string;
    name: string;
    ticker: string;
  } | null;
  configuredCorpMatch: {
    id: string;
    slug: string;
    name: string;
    ticker: string;
  } | null;
  linkedAt: string | null;
  lastEveLoginAt: string | null;
  lastIdentityRefreshAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedOfficer: EveIdentityOfficerOption | null;
};

export type EveIdentityAdminData = {
  identities: EveIdentityAdminView[];
  officers: EveIdentityOfficerOption[];
};

export async function getEveIdentityAdminData(): Promise<EveIdentityAdminData> {
  const [identities, officers, corpConfigs] = await Promise.all([
    getDb().eveIdentity.findMany({
      orderBy: [
        {
          lastEveLoginAt: "desc"
        },
        {
          characterName: "asc"
        }
      ],
      select: {
        id: true,
        characterId: true,
        characterName: true,
        corporationId: true,
        corporationName: true,
        allianceId: true,
        allianceName: true,
        memberCorp: {
          select: {
            id: true,
            slug: true,
            name: true,
            ticker: true
          }
        },
        linkedAt: true,
        lastEveLoginAt: true,
        lastIdentityRefreshAt: true,
        createdAt: true,
        updatedAt: true,
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
    getDb().officer.findMany({
      orderBy: [
        {
          role: "asc"
        },
        {
          officerName: "asc"
        }
      ],
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true
      }
    }),
    getDb().corpEveIdentityConfig.findMany({
      where: {
        eveCorporationId: {
          not: null
        }
      },
      select: {
        eveCorporationId: true,
        corp: {
          select: {
            id: true,
            slug: true,
            name: true,
            ticker: true
          }
        }
      }
    })
  ]);
  const configuredCorpByEveCorporationId = new Map(
    corpConfigs
      .filter((config) => config.eveCorporationId)
      .map((config) => [config.eveCorporationId?.toString(), config.corp])
  );

  return {
    identities: identities.map((identity) => ({
      id: identity.id,
      characterId: identity.characterId.toString(),
      characterName: identity.characterName,
      corporationId: identity.corporationId?.toString() ?? null,
      corporationName: identity.corporationName,
      allianceId: identity.allianceId?.toString() ?? null,
      allianceName: identity.allianceName,
      memberCorp: identity.memberCorp,
      configuredCorpMatch: identity.corporationId
        ? configuredCorpByEveCorporationId.get(identity.corporationId.toString()) ?? null
        : null,
      linkedAt: identity.linkedAt?.toISOString() ?? null,
      lastEveLoginAt: identity.lastEveLoginAt?.toISOString() ?? null,
      lastIdentityRefreshAt:
        identity.lastIdentityRefreshAt?.toISOString() ?? null,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
      linkedOfficer: identity.officer
    })),
    officers
  };
}
