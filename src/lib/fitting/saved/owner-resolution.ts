declare const savedFittingOwnerBrand: unique symbol;

export type SavedFittingOwner = {
  eveIdentityId: string;
  readonly [savedFittingOwnerBrand]: true;
};

export type SavedFittingOwnerResolutionInput = {
  checkpointEveIdentityId: string | null;
  linkedEveIdentityIds: string[];
  officerId: string | null;
};

export type SavedFittingOwnerErrorCode =
  | "AMBIGUOUS_OFFICER_IDENTITY"
  | "OFFICER_IDENTITY_REQUIRED"
  | "UNAUTHENTICATED";

export class SavedFittingOwnerError extends Error {
  constructor(
    readonly code: SavedFittingOwnerErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SavedFittingOwnerError";
  }
}

/**
 * Resolves only server-observed identity sources. Extra properties, including a
 * client-provided owner ID, are deliberately ignored.
 */
export function resolveSavedFittingOwner(
  input: SavedFittingOwnerResolutionInput
): SavedFittingOwner {
  if (input.officerId) {
    if (input.linkedEveIdentityIds.length === 0) {
      throw new SavedFittingOwnerError(
        "OFFICER_IDENTITY_REQUIRED",
        "A linked EVE identity is required to access personal saved fittings."
      );
    }

    if (input.linkedEveIdentityIds.length !== 1) {
      throw new SavedFittingOwnerError(
        "AMBIGUOUS_OFFICER_IDENTITY",
        "Saved fitting ownership is ambiguous for this officer session."
      );
    }

    return { eveIdentityId: input.linkedEveIdentityIds[0] } as SavedFittingOwner;
  }

  if (input.checkpointEveIdentityId) {
    return { eveIdentityId: input.checkpointEveIdentityId } as SavedFittingOwner;
  }

  throw new SavedFittingOwnerError(
    "UNAUTHENTICATED",
    "A verified EVE identity is required to access personal saved fittings."
  );
}
