"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FitOperationAttemptResult } from "@/components/fitting/use-fitting-state";
import { fitStateToEftExportSnapshot } from "@/lib/fitting/eft/export-snapshot";
import {
  getEftImportConfirmation,
  isApplicableEftPreview,
  isEftPreviewResponse,
} from "@/lib/fitting/eft/ui";
import type {
  EftExportResponse,
  EftPreviewResponse,
  EftSupportedRack,
} from "@/lib/fitting/eft/types";
import type { FitState } from "@/lib/fitting/fit-state";

type EftDrawerProps = {
  fitState: FitState;
  isOpen: boolean;
  onApplyPreview: (preview: EftPreviewResponse) => FitOperationAttemptResult;
  onClose: () => void;
};

type DrawerTab = "import" | "export";

const rackLabels: Record<EftSupportedRack, string> = {
  high: "High",
  low: "Low",
  mid: "Mid",
  rig: "Rig",
};
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function EftDrawer({ fitState, isOpen, onApplyPreview, onClose }: EftDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("import");
  const [eftText, setEftText] = useState("");
  const [preview, setPreview] = useState<EftPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [fitName, setFitName] = useState("");
  const [exportText, setExportText] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const requestEpochRef = useRef(0);
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeDrawer = useCallback(() => {
    requestEpochRef.current += 1;
    setIsPreviewing(false);
    setConfirmationPending(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    drawerRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [closeDrawer, isOpen]);

  if (!isOpen) return null;

  const confirmation = preview
    ? getEftImportConfirmation(preview.status, fitState)
    : "none";

  const handlePreview = async () => {
    const requestEpoch = ++requestEpochRef.current;
    setIsPreviewing(true);
    setPreviewError(null);
    setImportMessage(null);
    setConfirmationPending(false);
    try {
      const response = await fetch("/api/fitting/eft/preview", {
        body: JSON.stringify({ eftText }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (requestEpoch !== requestEpochRef.current) return;
      if (!response.ok || !isEftPreviewResponse(payload)) {
        setPreview(null);
        setPreviewError(readApiError(payload, "EFT preview could not be generated."));
        return;
      }
      setPreview(payload);
    } catch {
      if (requestEpoch === requestEpochRef.current) {
        setPreview(null);
        setPreviewError("EFT preview is temporarily unavailable.");
      }
    } finally {
      if (requestEpoch === requestEpochRef.current) setIsPreviewing(false);
    }
  };

  const handleReplace = () => {
    if (!isApplicableEftPreview(preview)) return;
    if (confirmation !== "none" && !confirmationPending) {
      setConfirmationPending(true);
      return;
    }
    const result = onApplyPreview(preview);
    if (!result.ok) {
      setImportMessage(result.message);
      return;
    }
    setFitName(preview.fitName?.trim() || preview.hull?.typeName || "");
    setExportText("");
    setConfirmationPending(false);
    setImportMessage("Current fit replaced from the authoritative EFT preview.");
  };

  const handleExport = async () => {
    const snapshot = fitStateToEftExportSnapshot(fitState, fitName);
    if (!snapshot) return;
    setIsExporting(true);
    setExportError(null);
    setCopyMessage(null);
    try {
      const response = await fetch("/api/fitting/eft/export", {
        body: JSON.stringify(snapshot),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isEftExportResponse(payload)) {
        setExportError(readApiError(payload, "EFT export could not be generated."));
        return;
      }
      setFitName(payload.fitName);
      setExportText(payload.eftText);
    } catch {
      setExportError("EFT export is temporarily unavailable.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    setCopyMessage(null);
    if (!navigator.clipboard?.writeText) {
      setCopyMessage("Clipboard access is unavailable. The generated EFT remains selected below.");
      return;
    }
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyMessage("EFT copied to clipboard.");
    } catch {
      setCopyMessage("Clipboard permission was denied. The generated EFT remains available below.");
    }
  };

  return (
    <div className="eft-drawer-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) closeDrawer();
    }}>
      <aside className="eft-drawer" aria-label="EFT Import and Export" aria-modal="true" ref={drawerRef} role="dialog" tabIndex={-1}>
        <header className="eft-drawer-header">
          <div>
            <span className="eyebrow">Fitting Interchange</span>
            <h2>EFT Import / Export</h2>
          </div>
          <button className="secondary-button" type="button" onClick={closeDrawer}>Close</button>
        </header>

        <div className="eft-drawer-tabs" role="tablist" aria-label="EFT operation">
          {(["import", "export"] as const).map((tab) => (
            <button
              aria-selected={activeTab === tab}
              aria-controls={`eft-${tab}-panel`}
              id={`eft-${tab}-tab`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              type="button"
            >
              {tab === "import" ? "Paste EFT" : "Copy EFT"}
            </button>
          ))}
        </div>

        {activeTab === "import" ? (
          <section aria-labelledby="eft-import-tab" className="eft-drawer-body" id="eft-import-panel" role="tabpanel">
            <label className="eft-field">
              <span>Paste EFT</span>
              <textarea
                aria-label="EFT text to import"
                onChange={(event) => {
                  setEftText(event.target.value);
                  setPreview(null);
                  setPreviewError(null);
                  setConfirmationPending(false);
                  setImportMessage(null);
                }}
                placeholder="[Hull Name, Fit Name]"
                spellCheck={false}
                value={eftText}
              />
            </label>
            <button className="command-button" disabled={isPreviewing || !eftText.trim()} onClick={() => void handlePreview()} type="button">
              {isPreviewing ? "Previewing…" : "Preview"}
            </button>
            {previewError ? <p className="eft-message" data-tone="error">{previewError}</p> : null}
            {preview ? <EftPreviewPanel preview={preview} /> : null}
            {isApplicableEftPreview(preview) ? (
              <div className="eft-apply-actions">
                {confirmationPending ? (
                  <p className="eft-confirmation" data-tone="review">
                    {confirmationMessage(confirmation)} This operation replaces the current fitting in one step.
                  </p>
                ) : null}
                <button
                  className={confirmationPending ? "danger-button" : "command-button"}
                  onClick={handleReplace}
                  type="button"
                >
                  {confirmationPending ? "Confirm Replacement" : "Replace Current Fit"}
                </button>
                {confirmationPending ? (
                  <button className="secondary-button" onClick={() => setConfirmationPending(false)} type="button">Cancel</button>
                ) : null}
              </div>
            ) : null}
            {importMessage ? <p className="eft-message" data-tone={importMessage.startsWith("Current") ? "success" : "error"}>{importMessage}</p> : null}
          </section>
        ) : (
          <section aria-labelledby="eft-export-tab" className="eft-drawer-body" id="eft-export-panel" role="tabpanel">
            <label className="eft-field eft-field-compact">
              <span>Fit name</span>
              <input
                maxLength={120}
                onChange={(event) => {
                  setFitName(event.target.value);
                  setExportText("");
                  setCopyMessage(null);
                }}
                placeholder={fitState.hullTypeId ? "Defaults to hull name" : "Select a hull first"}
                type="text"
                value={fitName}
              />
            </label>
            {fitState.hullTypeId === null ? (
              <p className="eft-message" data-tone="review">Select a hull before generating EFT.</p>
            ) : (
              <button className="command-button" disabled={isExporting} onClick={() => void handleExport()} type="button">
                {isExporting ? "Hydrating…" : "Generate EFT"}
              </button>
            )}
            {exportError ? <p className="eft-message" data-tone="error">{exportError}</p> : null}
            {exportText ? (
              <>
                <label className="eft-field">
                  <span>Authoritative EFT</span>
                  <textarea aria-label="Generated EFT" readOnly spellCheck={false} value={exportText} />
                </label>
                <button className="secondary-button" onClick={() => void handleCopy()} type="button">Copy EFT</button>
              </>
            ) : null}
            {copyMessage ? <p className="eft-message" data-tone={copyMessage.includes("copied") ? "success" : "review"}>{copyMessage}</p> : null}
          </section>
        )}
      </aside>
    </div>
  );
}

function EftPreviewPanel({ preview }: { preview: EftPreviewResponse }) {
  return (
    <div className="eft-preview" data-status={preview.status}>
      <div className="eft-preview-heading">
        <span className="eft-status">{preview.status === "ready" ? "Ready" : preview.status === "review" ? "Review" : "Error"}</span>
        <div>
          <strong>{preview.hull?.typeName ?? "Unresolved hull"}</strong>
          <small>{preview.fitName?.trim() || "Unnamed fit"}</small>
        </div>
      </div>
      {preview.analysis ? (
        <div className="eft-analysis-summary">
          <span>CPU {formatNumber(preview.analysis.fitting.analysis.cpuUsed)}</span>
          <span>PG {formatNumber(preview.analysis.fitting.analysis.powergridUsed)}</span>
          <span>Calibration {formatNumber(preview.analysis.fitting.analysis.calibrationUsed)}</span>
        </div>
      ) : null}
      <div className="eft-rack-summary">
        {(["low", "mid", "high", "rig"] as const).map((rack) => {
          const fitted = preview.racks[rack].filter((slot) => slot.module);
          return (
            <section key={rack}>
              <strong>{rackLabels[rack]} · {fitted.length}/{preview.racks[rack].length}</strong>
              {fitted.length ? (
                <ul>{fitted.map((slot) => (
                  <li key={slot.index}>
                    {slot.module!.typeName}
                    {slot.module!.charge ? <small> · {slot.module!.charge.typeName}</small> : null}
                  </li>
                ))}</ul>
              ) : <small>No fitted items</small>}
            </section>
          );
        })}
      </div>
      <div className="eft-carry-summary">
        <PreviewQuantityList label="Drones" entries={preview.drones} />
        <PreviewQuantityList label="Cargo" entries={preview.cargo} />
      </div>
      {preview.diagnostics.length ? (
        <div className="eft-diagnostics">
          {preview.diagnostics.map((diagnostic, index) => (
            <article data-tone={diagnostic.disposition} key={`${diagnostic.code}-${diagnostic.lineNumber ?? "fit"}-${index}`}>
              <strong>{diagnostic.disposition === "blocking" ? "Blocking error" : diagnostic.disposition === "review" ? "Review" : "Warning"}</strong>
              <span>{diagnostic.message}</span>
              {diagnostic.lineNumber ? <small>Line {diagnostic.lineNumber}{diagnostic.rawText ? ` · ${diagnostic.rawText}` : ""}</small> : null}
            </article>
          ))}
        </div>
      ) : <p className="eft-message" data-tone="success">No import diagnostics.</p>}
    </div>
  );
}

function PreviewQuantityList({ entries, label }: {
  entries: Array<{ quantity: number; typeId: number; typeName: string }>;
  label: string;
}) {
  return (
    <section>
      <strong>{label}</strong>
      {entries.length ? <ul>{entries.map((entry) => <li key={entry.typeId}>{entry.typeName} ×{entry.quantity}</li>)}</ul> : <small>None</small>}
    </section>
  );
}

function confirmationMessage(confirmation: ReturnType<typeof getEftImportConfirmation>) {
  if (confirmation === "review-and-replace-current") return "This preview needs review and the current fit contains modules, drones, or cargo.";
  if (confirmation === "review") return "This preview contains warnings or content that cannot be preserved exactly.";
  return "The current fit contains modules, drones, or cargo.";
}

function isEftExportResponse(value: unknown): value is EftExportResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "eftText" in value &&
      "fitName" in value &&
      "hullName" in value &&
      typeof value.eftText === "string" &&
      typeof value.fitName === "string" &&
      typeof value.hullName === "string",
  );
}

function readApiError(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}
