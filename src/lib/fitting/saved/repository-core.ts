import { validateSavedFittingMetadata } from "./metadata";
import type { SavedFittingOwner } from "./owner-resolution";
import type {
  SavedFittingMetadataIssue,
  ValidatedSavedFittingMetadata
} from "./metadata";
import type { SavedFittingSnapshotDiagnostic } from "./types";

export type SavedFittingReadRow = {
  createdAt: Date;
  hullTypeId: number;
  id: string;
  name: string;
  revision: number;
  snapshot: unknown;
  snapshotVersion: number;
  updatedAt: Date;
};

export type SavedFittingReadRecord = ValidatedSavedFittingMetadata & {
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type SavedFittingInvalidRecord = {
  fittingId: string;
  issues: SavedFittingMetadataIssue[];
  snapshotDiagnostics: SavedFittingSnapshotDiagnostic[];
};

export type SavedFittingReadRepository = {
  findByOwnerAndId(
    ownerEveIdentityId: string,
    fittingId: string
  ): Promise<SavedFittingReadRow | null>;
  listByOwner(ownerEveIdentityId: string): Promise<SavedFittingReadRow[]>;
};

export type SavedFittingListResult = {
  fittings: SavedFittingReadRecord[];
  invalidRecords: SavedFittingInvalidRecord[];
};

export type SavedFittingGetResult =
  | { fitting: SavedFittingReadRecord; ok: true }
  | { code: "INVALID_RECORD"; invalidRecord: SavedFittingInvalidRecord; ok: false }
  | { code: "UNAVAILABLE"; ok: false };

export async function listSavedFittingsFromRepository(
  owner: SavedFittingOwner,
  repository: SavedFittingReadRepository
): Promise<SavedFittingListResult> {
  const rows = await repository.listByOwner(owner.eveIdentityId);
  const fittings: SavedFittingReadRecord[] = [];
  const invalidRecords: SavedFittingInvalidRecord[] = [];

  for (const row of rows) {
    const decoded = decodeSavedFittingRow(row);

    if (decoded.ok) {
      fittings.push(decoded.fitting);
    } else {
      invalidRecords.push(decoded.invalidRecord);
    }
  }

  return { fittings, invalidRecords };
}

export async function getSavedFittingFromRepository(
  owner: SavedFittingOwner,
  fittingId: string,
  repository: SavedFittingReadRepository
): Promise<SavedFittingGetResult> {
  const row = await repository.findByOwnerAndId(
    owner.eveIdentityId,
    fittingId
  );

  if (!row) {
    return { code: "UNAVAILABLE", ok: false };
  }

  const decoded = decodeSavedFittingRow(row);

  return decoded.ok
    ? { fitting: decoded.fitting, ok: true }
    : { code: "INVALID_RECORD", invalidRecord: decoded.invalidRecord, ok: false };
}

export function decodeSavedFittingRow(row: SavedFittingReadRow):
  | { fitting: SavedFittingReadRecord; ok: true }
  | { invalidRecord: SavedFittingInvalidRecord; ok: false } {
  const validated = validateSavedFittingMetadata({
    hullTypeId: row.hullTypeId,
    name: row.name,
    revision: row.revision,
    snapshot: row.snapshot,
    snapshotVersion: row.snapshotVersion
  });

  if (!validated.ok) {
    return {
      invalidRecord: {
        fittingId: row.id,
        issues: validated.issues,
        snapshotDiagnostics: validated.snapshotDiagnostics
      },
      ok: false
    };
  }

  return {
    fitting: {
      ...validated.value,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      updatedAt: row.updatedAt.toISOString()
    },
    ok: true
  };
}
