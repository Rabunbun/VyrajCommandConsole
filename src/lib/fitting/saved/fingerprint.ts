import { canonicalizeSavedFittingSnapshot } from "./canonicalize";
import {
  SAVED_FITTING_SNAPSHOT_VERSION,
  type SavedFittingDomainResult
} from "./types";

/**
 * Fingerprint normalization deliberately permits an empty string. Persistence
 * metadata may later reject empty names, but whitespace-only names compare as
 * the same editor value here.
 */
export function normalizeSavedFittingName(name: string) {
  return name.trim();
}

/**
 * Uses the complete canonical serialization as the fingerprint. This is longer
 * than a short hash but collision-free for dirty-state equality and works in
 * both browser and server runtimes without a dependency.
 */
export function createSavedFittingFingerprint(
  name: string,
  snapshot: unknown
): SavedFittingDomainResult<string> {
  const canonical = canonicalizeSavedFittingSnapshot(snapshot);

  if (!canonical.ok) {
    return canonical;
  }

  return {
    diagnostics: canonical.diagnostics,
    ok: true,
    value: `saved-fitting-v${SAVED_FITTING_SNAPSHOT_VERSION}:${JSON.stringify({
      name: normalizeSavedFittingName(name),
      snapshot: canonical.value
    })}`
  };
}
