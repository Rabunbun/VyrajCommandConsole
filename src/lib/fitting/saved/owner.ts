import "server-only";

import { getDb } from "@/lib/db";
import { getUnlinkedIdentityFromCookie } from "@/lib/eve-sso/oauth";
import { getCurrentOfficerSession } from "@/lib/session";
import {
  resolveSavedFittingOwner,
  type SavedFittingOwner
} from "./owner-resolution";

export async function requireSavedFittingOwner(): Promise<SavedFittingOwner> {
  const session = await getCurrentOfficerSession();

  if (session) {
    const linkedIdentities = await getDb().eveIdentity.findMany({
      where: { officerId: session.officer.id },
      orderBy: { id: "asc" },
      select: { id: true }
    });

    return resolveSavedFittingOwner({
      checkpointEveIdentityId: null,
      linkedEveIdentityIds: linkedIdentities.map((identity) => identity.id),
      officerId: session.officer.id
    });
  }

  const checkpointIdentity = await getUnlinkedIdentityFromCookie();

  return resolveSavedFittingOwner({
    checkpointEveIdentityId: checkpointIdentity?.id ?? null,
    linkedEveIdentityIds: [],
    officerId: null
  });
}
