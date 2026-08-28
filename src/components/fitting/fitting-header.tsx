import { StatusPip } from "@/components/module-visuals";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingHeaderProps = {
  conflict: { fittingName: string } | null;
  fittingName: string;
  isSaving: boolean;
  onFittingNameChange: (name: string) => void;
  onOpenEft: () => void;
  onReloadConflict: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  persistenceAvailable: boolean;
  persistenceMessage: { text: string; tone: "error" | "info" | "success" } | null;
  saveDisabled: boolean;
  selectedHull: FittingHullSummary | null;
  status: {
    kind: "not-saved" | "saved" | "unsaved-changes";
    label: string;
  };
};

export function FittingHeader({
  conflict,
  fittingName,
  isSaving,
  onFittingNameChange,
  onOpenEft,
  onReloadConflict,
  onSave,
  onSaveAs,
  persistenceAvailable,
  persistenceMessage,
  saveDisabled,
  selectedHull,
  status
}: FittingHeaderProps) {
  return (
    <header className="fitting-header">
      <div className="fitting-header-main">
        <div className="eyebrow">Vyraj Fitting Systems</div>
        <h1 className="page-title" id="fitting-bay-title">
          FITTING BAY
        </h1>
        <p className="page-copy">
          Ship Fitting Workspace
        </p>
      </div>
      <div className="fitting-header-state" aria-label="Fit controls and state">
        <label className="fitting-name-control">
          <span>Fitting name</span>
          <input
            aria-label="Fitting name"
            className="text-input"
            disabled={isSaving}
            maxLength={120}
            onChange={(event) => onFittingNameChange(event.target.value)}
            placeholder="Name this fitting"
            value={fittingName}
          />
        </label>
        <button
          className="command-button fitting-save-control"
          disabled={saveDisabled || isSaving || !persistenceAvailable}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <button
          className="secondary-button fitting-save-control"
          disabled={saveDisabled || isSaving || !persistenceAvailable}
          onClick={onSaveAs}
          type="button"
        >
          Save As
        </button>
        <button className="secondary-button fitting-eft-control" onClick={onOpenEft} type="button">
          EFT Import / Export
        </button>
        <StatusPip
          label={selectedHull ? "Hull Selected" : "Hull Selection Ready"}
          tone={selectedHull ? "verified" : "info"}
        />
        <span
          className="badge"
          data-state={status.kind === "saved" ? "ACTIVE" : status.kind === "unsaved-changes" ? "WARNING" : "PENDING"}
        >
          {status.label}
        </span>
        {!persistenceAvailable ? (
          <span className="fitting-save-message" data-tone="info">
            Verify an EVE identity to save fittings.
          </span>
        ) : null}
        {persistenceMessage ? (
          <span className="fitting-save-message" data-tone={persistenceMessage.tone} role="status">
            {persistenceMessage.text}
          </span>
        ) : null}
        {conflict ? (
          <span className="fitting-save-conflict" role="alert">
            <span>{conflict.fittingName} changed elsewhere. Reload the saved version or use Save As.</span>
            <button onClick={onReloadConflict} type="button">Reload Saved Version</button>
            <button onClick={onSaveAs} type="button">Save As</button>
          </span>
        ) : null}
      </div>
    </header>
  );
}
