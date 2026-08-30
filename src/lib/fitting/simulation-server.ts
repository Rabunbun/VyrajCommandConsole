import "server-only";

import { requirePrivateEsiActor } from "@/lib/eve-sso/private/authorization";
import { getPrivateEsiCredentialStatus } from "@/lib/eve-sso/private/service";
import { getCurrentCharacterSkillSnapshot } from "@/lib/eve-sso/private/skills/service";
import type { FittingSimulationBootstrap } from "./simulation";

export async function getCurrentFittingSimulationBootstrap(): Promise<FittingSimulationBootstrap> {
  try {
    const actor = await requirePrivateEsiActor();
    const [connection, linkedSnapshot] = await Promise.all([
      getPrivateEsiCredentialStatus(actor),
      getCurrentCharacterSkillSnapshot(actor)
    ]);

    return { connection, linkedSnapshot };
  } catch {
    return { connection: null, linkedSnapshot: null };
  }
}
