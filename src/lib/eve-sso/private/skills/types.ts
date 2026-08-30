import type { PrivateEsiActor } from "../types";

export type CharacterSkillSnapshotStatus =
  | "AVAILABLE"
  | "STALE"
  | "UNAVAILABLE"
  | "REAUTHORIZATION_REQUIRED"
  | "REVOKED";

export type CharacterSkillLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type StoredCharacterSkill = {
  activeLevel: CharacterSkillLevel;
  skillTypeId: number;
  skillpoints: number | null;
  trainedLevel: CharacterSkillLevel;
  trainedLevelSource: "skills" | "completed-queue";
};

export type CharacterSkillCacheMetadata = {
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
};

export type CharacterSkillSnapshotRecord = {
  checkedAt: Date | null;
  eveIdentityId: string;
  fetchedAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  queueMetadata: CharacterSkillCacheMetadata;
  refreshAfter: Date | null;
  refreshVersion: number;
  skills: StoredCharacterSkill[] | null;
  skillsMetadata: CharacterSkillCacheMetadata;
  source: "ESI";
  status: CharacterSkillSnapshotStatus;
};

export type CharacterSkillSnapshotWrite = Omit<
  CharacterSkillSnapshotRecord,
  "eveIdentityId" | "refreshVersion"
>;

export type CharacterSkillSnapshotRepository = {
  beginRefresh(eveIdentityId: string): Promise<CharacterSkillSnapshotRecord>;
  commitFailure(input: {
    eveIdentityId: string;
    lastErrorAt: Date;
    lastErrorCode: string;
    refreshVersion: number;
    status: Exclude<CharacterSkillSnapshotStatus, "AVAILABLE">;
  }): Promise<boolean>;
  commitSuccess(input: {
    eveIdentityId: string;
    refreshVersion: number;
    snapshot: CharacterSkillSnapshotWrite;
  }): Promise<boolean>;
  findByEveIdentityId(
    eveIdentityId: string
  ): Promise<CharacterSkillSnapshotRecord | null>;
};

export type CharacterSkillsConditionalResponse =
  | {
      kind: "modified";
      metadata: CharacterSkillCacheMetadata;
      payload: unknown;
    }
  | {
      kind: "not-modified";
      metadata: CharacterSkillCacheMetadata;
    };

export type CharacterSkillSnapshotDiagnostic = {
  code: "QUEUE_TRAINED_LEVEL_EXCEEDS_ACTIVE" | "REFRESH_SUPERSEDED";
  message: string;
  skillTypeId?: number;
};

export type CharacterSkillSnapshotSafeResult = {
  characterId: string;
  characterName: string;
  checkedAt: string | null;
  diagnostics: CharacterSkillSnapshotDiagnostic[];
  eveIdentityId: string;
  fetchedAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  refreshAfter: string | null;
  snapshot: {
    complete: true;
    skills: Array<{
      activeLevel: CharacterSkillLevel;
      skillTypeId: number;
      skillpoints: number | null;
      trainedLevel: CharacterSkillLevel;
    }>;
    stale: boolean;
  } | null;
  source: "esi";
  status:
    | "available"
    | "stale"
    | "unavailable"
    | "reauthorization-required"
    | "revoked";
};

export type CharacterSkillSyncDependencies = {
  fetchQueue(input: {
    accessToken: string;
    actor: PrivateEsiActor;
    validators: CharacterSkillCacheMetadata | null;
  }): Promise<CharacterSkillsConditionalResponse>;
  fetchSkills(input: {
    accessToken: string;
    actor: PrivateEsiActor;
    validators: CharacterSkillCacheMetadata | null;
  }): Promise<CharacterSkillsConditionalResponse>;
  getAccessToken(actor: PrivateEsiActor): Promise<string>;
  now(): Date;
  repository: CharacterSkillSnapshotRepository;
};

export type CharacterSkillSyncErrorCode =
  | "ESI_QUEUE_REQUEST_FAILED"
  | "ESI_SKILLS_REQUEST_FAILED"
  | "INVALID_QUEUE_RESPONSE"
  | "INVALID_SKILLS_RESPONSE"
  | "NOT_MODIFIED_WITHOUT_SNAPSHOT";

export class CharacterSkillSyncError extends Error {
  constructor(
    readonly code: CharacterSkillSyncErrorCode,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = "CharacterSkillSyncError";
  }
}

