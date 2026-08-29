import "server-only";

import { getDb } from "@/lib/db";
import { getUnlinkedIdentityFromCookie } from "@/lib/eve-sso/oauth";
import { getCurrentOfficerSession } from "@/lib/session";
import { resolvePrivateEsiActor } from "./authorization-core";
import { PrivateEsiCredentialError } from "./types";

export async function requirePrivateEsiActor() {
  const session = await getCurrentOfficerSession();

  try {
    if (session) {
      const identities = await getDb().eveIdentity.findMany({
        where: { officerId: session.officer.id },
        orderBy: { id: "asc" },
        select: { characterId: true, characterName: true, id: true }
      });

      return resolvePrivateEsiActor({
        checkpointEveIdentityId: null,
        identities: identities.map((identity) => ({
          characterId: identity.characterId.toString(),
          characterName: identity.characterName,
          id: identity.id
        })),
        linkedEveIdentityIds: identities.map((identity) => identity.id),
        officerId: session.officer.id,
        sessionContextId: session.sessionId
      });
    }

    const checkpointIdentity = await getUnlinkedIdentityFromCookie();

    return resolvePrivateEsiActor({
      checkpointEveIdentityId: checkpointIdentity?.id ?? null,
      identities: checkpointIdentity
        ? [
            {
              characterId: checkpointIdentity.characterId.toString(),
              characterName: checkpointIdentity.characterName,
              id: checkpointIdentity.id
            }
          ]
        : [],
      linkedEveIdentityIds: [],
      officerId: null,
      sessionContextId: checkpointIdentity?.id ?? ""
    });
  } catch {
    throw new PrivateEsiCredentialError(
      "AUTHORIZATION_REQUIRED",
      "A single verified EVE identity is required for private character data."
    );
  }
}
