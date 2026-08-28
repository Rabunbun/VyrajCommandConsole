import Link from "next/link";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type { FittingHullSummary } from "@/lib/fitting/types";
import type {
  SavedFittingLibraryState,
  SavedFittingSummary
} from "@/lib/fitting/saved/ui-types";

type SavedFittingLibraryProps = {
  activeSavedFittingId: string | null;
  activeSavedFittingIsDirty: boolean;
  busyFittingId: string | null;
  hulls: FittingHullSummary[];
  library: SavedFittingLibraryState;
  message: { text: string; tone: "error" | "info" | "success" } | null;
  onDelete: (fitting: SavedFittingSummary) => void;
  onLoad: (fitting: SavedFittingSummary) => void;
};

export function SavedFittingLibrary({
  activeSavedFittingId,
  activeSavedFittingIsDirty,
  busyFittingId,
  hulls,
  library,
  message,
  onDelete,
  onLoad
}: SavedFittingLibraryProps) {
  const hullsByTypeId = new Map(hulls.map((hull) => [hull.typeId, hull]));

  if (library.status === "unavailable") {
    return (
      <section className="saved-fitting-library" aria-label="Personal saved fittings">
        <div className="fitting-empty-note">
          <strong>Saved fittings require a verified EVE identity.</strong>
          <span>{library.message}</span>
          <Link href="/login?returnTo=%2Ffitting">Verify identity</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="saved-fitting-library" aria-label="Personal saved fittings">
      <div className="fitting-panel-heading">
        <h3 className="fit-stat-title">Saved Fittings</h3>
        <span className="card-copy">{library.fittings.length} personal</span>
      </div>

      {message ? (
        <div className="saved-fitting-message" data-tone={message.tone} role="status">
          {message.text}
        </div>
      ) : null}

      {library.invalidRecordCount > 0 ? (
        <div className="saved-fitting-message" data-tone="error">
          {library.invalidRecordCount} saved record{library.invalidRecordCount === 1 ? "" : "s"} could not be indexed.
        </div>
      ) : null}

      {library.fittings.length ? (
        <div className="saved-fitting-list">
          {library.fittings.map((fitting) => {
            const hull = hullsByTypeId.get(fitting.hullTypeId) ?? null;
            const current = activeSavedFittingId === fitting.id;
            const busy = busyFittingId === fitting.id;

            return (
              <article className="saved-fitting-row" data-current={current} key={fitting.id}>
                <button
                  className="saved-fitting-open"
                  disabled={busy}
                  onClick={() => onLoad(fitting)}
                  type="button"
                >
                  <EveModuleIcon
                    typeId={fitting.hullTypeId}
                    typeName={hull?.typeName ?? `Hull type ${fitting.hullTypeId}`}
                  />
                  <span className="saved-fitting-copy">
                    <strong>{fitting.name}</strong>
                    <span>{hull?.typeName ?? `Hull type ${fitting.hullTypeId}`}</span>
                    <small>Updated {formatSavedTimestamp(fitting.updatedAt)}</small>
                  </span>
                  {current ? (
                    <span className="saved-fitting-current" data-dirty={activeSavedFittingIsDirty}>
                      {activeSavedFittingIsDirty ? "Unsaved" : "Current"}
                    </span>
                  ) : null}
                </button>
                <button
                  aria-label={`Delete ${fitting.name}`}
                  className="saved-fitting-delete"
                  disabled={busy}
                  onClick={() => onDelete(fitting)}
                  type="button"
                >
                  Delete
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="fitting-empty-note">
          No personal fittings saved yet. Select a hull, name the fit, and use Save.
        </div>
      )}
    </section>
  );
}

function formatSavedTimestamp(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "unknown"
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone: "UTC",
        timeZoneName: "short",
        year: "numeric"
      }).format(date);
}
