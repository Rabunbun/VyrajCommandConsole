import {
  validateSavedFittingWrite,
  type SavedFittingMetadataIssue
} from "./metadata";
import type { SavedFittingOwner } from "./owner-resolution";
import {
  decodeSavedFittingRow,
  type SavedFittingReadRecord,
  type SavedFittingReadRow
} from "./repository-core";
import type {
  SavedFittingSnapshotDiagnostic,
  SavedFittingSnapshotV1
} from "./types";

export type CreateSavedFittingInput = {
  name: unknown;
  snapshot: unknown;
};

export type UpdateSavedFittingInput = CreateSavedFittingInput & {
  expectedRevision: unknown;
  id: unknown;
};

export type DeleteSavedFittingInput = {
  expectedRevision: unknown;
  id: unknown;
};

export type SavedFittingMutationValidationIssue = SavedFittingMetadataIssue | {
  code: "INVALID_EXPECTED_REVISION" | "INVALID_FITTING_ID";
  message: string;
  path: "expectedRevision" | "id";
};

export type SavedFittingMutationFailure =
  | { code: "UNAVAILABLE"; ok: false }
  | {
      code: "REVISION_CONFLICT";
      currentRevision: number;
      ok: false;
    }
  | {
      code: "INVALID_INPUT";
      issues: SavedFittingMutationValidationIssue[];
      ok: false;
      snapshotDiagnostics: SavedFittingSnapshotDiagnostic[];
    };

export type SavedFittingMutationResult =
  | { fitting: SavedFittingReadRecord; ok: true }
  | SavedFittingMutationFailure;

export type SavedFittingDeleteResult =
  | {
      deletedFitting: {
        id: string;
        revision: number;
      };
      ok: true;
    }
  | SavedFittingMutationFailure;

export type SavedFittingCreateData = {
  hullTypeId: number;
  name: string;
  ownerEveIdentityId: string;
  revision: 1;
  snapshot: SavedFittingSnapshotV1;
  snapshotVersion: number;
};

export type SavedFittingUpdateData = {
  expectedRevision: number;
  hullTypeId: number;
  id: string;
  name: string;
  ownerEveIdentityId: string;
  snapshot: SavedFittingSnapshotV1;
  snapshotVersion: number;
};

export type SavedFittingRevisionScope = {
  expectedRevision: number;
  id: string;
  ownerEveIdentityId: string;
};

export type SavedFittingMutationRepository = {
  create(data: SavedFittingCreateData): Promise<SavedFittingReadRow>;
  deleteIfRevisionMatches(data: SavedFittingRevisionScope): Promise<boolean>;
  findRevisionByOwnerAndId(
    ownerEveIdentityId: string,
    fittingId: string
  ): Promise<number | null>;
  /** Must compare owner, ID, and revision and increment revision atomically. */
  updateIfRevisionMatches(
    data: SavedFittingUpdateData
  ): Promise<SavedFittingReadRow | null>;
};

export async function createSavedFittingFromRepository(
  owner: SavedFittingOwner,
  input: CreateSavedFittingInput,
  repository: SavedFittingMutationRepository
): Promise<SavedFittingMutationResult> {
  const validated = validateSavedFittingWrite(input);

  if (!validated.ok) {
    return invalidInput(validated.issues, validated.snapshotDiagnostics);
  }

  const row = await repository.create({
    ...validated.value,
    ownerEveIdentityId: owner.eveIdentityId,
    revision: 1
  });

  return successfulMutation(row, 1);
}

export async function updateSavedFittingFromRepository(
  owner: SavedFittingOwner,
  input: UpdateSavedFittingInput,
  repository: SavedFittingMutationRepository
): Promise<SavedFittingMutationResult> {
  const identity = validateMutationIdentity(input);
  const validated = validateSavedFittingWrite(input);
  const issues = [...identity.issues, ...validated.issues];

  if (!validated.ok || !identity.ok || issues.length > 0) {
    return invalidInput(issues, validated.snapshotDiagnostics);
  }

  const row = await repository.updateIfRevisionMatches({
    ...validated.value,
    expectedRevision: identity.expectedRevision,
    id: identity.id,
    ownerEveIdentityId: owner.eveIdentityId
  });

  if (!row) {
    return classifyUnavailableOrConflict(
      owner,
      identity.id,
      repository
    );
  }

  return successfulMutation(row, identity.expectedRevision + 1);
}

export async function deleteSavedFittingFromRepository(
  owner: SavedFittingOwner,
  input: DeleteSavedFittingInput,
  repository: SavedFittingMutationRepository
): Promise<SavedFittingDeleteResult> {
  const identity = validateMutationIdentity(input);

  if (!identity.ok) {
    return invalidInput(identity.issues, []);
  }

  const deleted = await repository.deleteIfRevisionMatches({
    expectedRevision: identity.expectedRevision,
    id: identity.id,
    ownerEveIdentityId: owner.eveIdentityId
  });

  if (!deleted) {
    return classifyUnavailableOrConflict(
      owner,
      identity.id,
      repository
    );
  }

  return {
    deletedFitting: {
      id: identity.id,
      revision: identity.expectedRevision
    },
    ok: true
  };
}

async function classifyUnavailableOrConflict(
  owner: SavedFittingOwner,
  fittingId: string,
  repository: SavedFittingMutationRepository
): Promise<SavedFittingMutationFailure> {
  const currentRevision = await repository.findRevisionByOwnerAndId(
    owner.eveIdentityId,
    fittingId
  );

  return currentRevision === null
    ? { code: "UNAVAILABLE", ok: false }
    : { code: "REVISION_CONFLICT", currentRevision, ok: false };
}

function successfulMutation(
  row: SavedFittingReadRow,
  expectedRevision: number
): SavedFittingMutationResult {
  const decoded = decodeSavedFittingRow(row);

  if (!decoded.ok || decoded.fitting.revision !== expectedRevision) {
    throw new Error("Saved fitting repository returned an invalid mutation row.");
  }

  return { fitting: decoded.fitting, ok: true };
}

function invalidInput(
  issues: SavedFittingMutationValidationIssue[],
  snapshotDiagnostics: SavedFittingSnapshotDiagnostic[]
): Extract<SavedFittingMutationFailure, { code: "INVALID_INPUT" }> {
  return {
    code: "INVALID_INPUT",
    issues,
    ok: false,
    snapshotDiagnostics
  };
}

function validateMutationIdentity(input: {
  expectedRevision: unknown;
  id: unknown;
}):
  | { expectedRevision: number; id: string; issues: []; ok: true }
  | { issues: SavedFittingMutationValidationIssue[]; ok: false } {
  const issues: SavedFittingMutationValidationIssue[] = [];
  const id = typeof input.id === "string" ? input.id : "";
  const expectedRevision = input.expectedRevision;

  if (!isUuid(id)) {
    issues.push({
      code: "INVALID_FITTING_ID",
      message: "Saved fitting ID must be a UUID.",
      path: "id"
    });
  }

  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision <= 0 ||
    expectedRevision === Number.MAX_SAFE_INTEGER
  ) {
    issues.push({
      code: "INVALID_EXPECTED_REVISION",
      message: "expectedRevision must be a positive safe integer that can be incremented.",
      path: "expectedRevision"
    });
  }

  return issues.length > 0
    ? { issues, ok: false }
    : {
        expectedRevision: expectedRevision as number,
        id,
        issues: [],
        ok: true
      };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
