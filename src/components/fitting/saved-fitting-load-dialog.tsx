"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedFittingLoadResult } from "@/lib/fitting/saved/load-types";

type LoadedSavedFitting = Extract<SavedFittingLoadResult, { ok: true }>;

type SavedFittingLoadDialogProps = {
  confirmReplacement: boolean;
  load: LoadedSavedFitting;
  onApply: () => void;
  onClose: () => void;
};

export function SavedFittingLoadDialog({
  confirmReplacement,
  load,
  onApply,
  onClose
}: SavedFittingLoadDialogProps) {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const dialogRef = useRef<HTMLElement | null>(null);
  const blocked = load.status === "blocked";
  const requiresReview = load.status === "review";

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function copyOriginalSnapshot() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(load.original, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div
      className="saved-fitting-dialog-layer"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="saved-fitting-dialog-title"
        aria-modal="true"
        className="saved-fitting-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <div className="eyebrow">Personal Fitting</div>
            <h2 className="section-title" id="saved-fitting-dialog-title">
              {blocked ? "Saved fitting blocked" : requiresReview ? "Review saved fitting" : "Replace current fit?"}
            </h2>
            <p className="card-copy">{load.savedFitting.name}</p>
          </div>
          <button className="secondary-button" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="saved-fitting-dialog-body">
          {blocked ? (
            <p className="saved-fitting-dialog-summary" data-tone="error">
              Static-data references prevent this fitting from loading. Your current editor was not changed.
            </p>
          ) : requiresReview ? (
            <p className="saved-fitting-dialog-summary" data-tone="warning">
              Static data changed since this fitting was saved. Review the details before replacing the editor.
            </p>
          ) : confirmReplacement ? (
            <p className="saved-fitting-dialog-summary" data-tone="warning">
              The current editor has unsaved content. Loading this fitting will replace it atomically.
            </p>
          ) : null}

          {load.diagnostics.length ? (
            <ul className="saved-fitting-diagnostics">
              {load.diagnostics.map((diagnostic, index) => (
                <li data-disposition={diagnostic.disposition} key={`${diagnostic.code}-${diagnostic.path ?? index}`}>
                  <strong>{diagnostic.code.replaceAll("_", " ")}</strong>
                  <span>{diagnostic.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-copy">No static-data drift was detected.</p>
          )}
        </div>

        <footer>
          <button className="secondary-button" onClick={() => void copyOriginalSnapshot()} type="button">
            {copyState === "copied" ? "Snapshot Copied" : "Copy Original Snapshot"}
          </button>
          {copyState === "error" ? (
            <span className="saved-fitting-copy-error" role="status">Clipboard access failed.</span>
          ) : null}
          <span className="saved-fitting-dialog-spacer" />
          {!blocked ? (
            <button className="command-button" onClick={onApply} type="button">
              Load Fitting
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
