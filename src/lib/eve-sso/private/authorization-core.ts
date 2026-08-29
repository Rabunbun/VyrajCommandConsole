import { resolveSavedFittingOwner } from "@/lib/fitting/saved/owner-resolution";
import type { PrivateEsiActor } from "./types";

export type PrivateEsiAuthoritativeIdentity = {
  characterId: string;
  characterName: string;
  id: string;
};

export type ResolvePrivateEsiActorInput = {
  checkpointEveIdentityId: string | null;
  identities: PrivateEsiAuthoritativeIdentity[];
  linkedEveIdentityIds: string[];
  officerId: string | null;
  sessionContextId: string;
};

/** Resolves only server-observed identity/session inputs. Extra client fields are ignored. */
export function resolvePrivateEsiActor(
  input: ResolvePrivateEsiActorInput
): PrivateEsiActor {
  const owner = resolveSavedFittingOwner({
    checkpointEveIdentityId: input.checkpointEveIdentityId,
    linkedEveIdentityIds: input.linkedEveIdentityIds,
    officerId: input.officerId
  });
  const identity = input.identities.find(
    (candidate) => candidate.id === owner.eveIdentityId
  );

  if (!identity || !input.sessionContextId) {
    throw new Error("An authoritative EVE identity context is required.");
  }

  return {
    characterId: identity.characterId,
    characterName: identity.characterName,
    contextKey: input.officerId
      ? `officer:${input.sessionContextId}:${identity.id}`
      : `member:${input.sessionContextId}:${identity.id}`,
    eveIdentityId: identity.id
  } as PrivateEsiActor;
}
