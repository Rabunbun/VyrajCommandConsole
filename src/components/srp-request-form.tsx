"use client";

import { useActionState } from "react";
import {
  analyzeSrpRequestAssistAction,
  submitSrpRequestAction
} from "@/app/corp/[corpId]/srp/actions";
import { EveShipImage } from "@/components/eve-ship-image";
import type { SrpCorpView, SrpShipTypeOption } from "@/lib/modules/srp";
import { formatStatusLabel } from "@/lib/public-data";
import {
  initialSrpAssistActionState,
  type SrpAssistActionState
} from "@/lib/srp-assist-state";

type SrpRequestFormProps = {
  corp: SrpCorpView;
  shipTypes: SrpShipTypeOption[];
};

export function SrpRequestForm({ corp, shipTypes }: SrpRequestFormProps) {
  const [state, analyzeAction, isPending] = useActionState(
    analyzeSrpRequestAssistAction,
    initialSrpAssistActionState
  );
  const previewShipTypeId =
    parseOptionalNumber(state.assist.selectedShipTypeId) ||
    parseOptionalNumber(state.assist.detectedShipTypeId);
  const previewShipName =
    state.assist.selectedShipName || state.assist.detectedShipName;
  const previewShip = previewShipTypeId
    ? shipTypes.find((shipType) => shipType.typeId === previewShipTypeId)
    : shipTypes.find(
        (shipType) =>
          previewShipName &&
          shipType.typeName.toLocaleLowerCase("en-US") ===
            previewShipName.toLocaleLowerCase("en-US")
      );
  const formStateKey = [
    state.status,
    state.assist.calculatedEligibleAmount,
    state.assist.killmailId,
    state.assist.detectedShipTypeId
  ].join(":");
  const canSubmit = state.status === "success" || state.status === "warning";

  return (
    <details
      className="create-disclosure form-panel form-panel-wide"
      aria-label="Submit SRP request"
    >
      <summary className="create-summary">
        <span className="command-button">Create SRP Request</span>
      </summary>
      <div className="card-heading">
        <h2 className="section-title">Submit SRP Request</h2>
        <p className="card-copy">
          Paste a public killmail. Smart SRP will estimate reimbursement when
          public killmail and insurance data are available. Officers still make
          the final call.
        </p>
      </div>

      <form action={analyzeAction} className="section-stack" key={formStateKey}>
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <label className="field-stack">
          <span className="field-label">Killmail URL</span>
          <input
            className="text-input"
            defaultValue={state.fields.killmailUrl}
            name="killmailUrl"
            placeholder="https://zkillboard.com/kill/123456789/"
            required
          />
        </label>

        <SrpAssistPreviewPanel
          previewShip={previewShip}
          previewShipName={previewShipName}
          previewShipTypeId={previewShipTypeId}
          state={state}
        />

        <div className="badge-row">
          <button className="secondary-button" disabled={isPending} type="submit">
            {isPending ? "Analyzing..." : "Analyze Killmail / Calculate SRP"}
          </button>
          <button
            className="command-button"
            disabled={!canSubmit}
            formAction={submitSrpRequestAction}
            type="submit"
          >
            Submit SRP Request
          </button>
        </div>
      </form>
    </details>
  );
}

function SrpAssistPreviewPanel({
  previewShip,
  previewShipName,
  previewShipTypeId,
  state
}: {
  previewShip?: SrpShipTypeOption;
  previewShipName: string;
  previewShipTypeId: number | null;
  state: SrpAssistActionState;
}) {
  const hasPreview = Boolean(
    state.status !== "idle" || previewShipName || previewShipTypeId
  );

  if (!hasPreview) {
    return (
      <div className="empty-state">
        Paste a zKillboard killmail URL or official ESI killmail URL, then
        analyze it before submitting.
      </div>
    );
  }

  const statusMessage = getAssistStatusMessage(state);

  return (
    <section className="data-card srp-assist-preview" aria-label="SRP assist preview">
      <div className="section-heading">
        <div className="doctrine-card-heading">
          {previewShip?.renderUrl ? (
            <EveShipImage
              alt={`${previewShip.typeName} ship render`}
              className="doctrine-ship-image"
              fallbackLabel={previewShip.typeName}
              iconUrl={previewShip.iconUrl}
              renderUrl={previewShip.renderUrl}
            />
          ) : (
            <div className="doctrine-ship-placeholder" aria-hidden="true">
              {previewShipName ? previewShipName.slice(0, 2).toUpperCase() : "?"}
            </div>
          )}
          <div className="card-heading">
            <h3 className="card-title">Smart SRP Assist</h3>
            <div className="card-subtitle">
              {previewShip?.typeName || previewShipName || "Ship pending review"}
            </div>
            {previewShip?.groupName || previewShipTypeId ? (
              <p className="card-copy">
                {[previewShip?.groupName, previewShipTypeId ? `Type ${previewShipTypeId}` : ""]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
            ) : null}
          </div>
        </div>
        {state.assist.assistStatus ? (
          <span className="badge">{formatStatusLabel(state.assist.assistStatus)}</span>
        ) : null}
      </div>

      {statusMessage ? (
        <div
          className={state.status === "error" ? "error-state" : "success-state"}
          role="status"
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric
          label="Killmail ID"
          value={state.assist.killmailId || "Not detected"}
        />
        <Metric
          label="Detected Ship"
          value={state.assist.detectedShipName || "Not loaded"}
        />
        <Metric
          label="Loss Value"
          value={formatIsk(state.assist.killmailTotalValue)}
        />
        <Metric
          label="Platinum Deduction"
          value={formatIsk(state.assist.insurancePayout)}
        />
        <Metric
          label="Insurance Source"
          value={formatInsuranceSource(state.assist.insurancePayoutSource)}
        />
        <Metric
          label="Recommended SRP"
          value={formatIsk(state.assist.calculatedEligibleAmount)}
        />
      </div>

      {state.assist.warnings ? (
        <div className="empty-state">{state.assist.warnings}</div>
      ) : null}
      {state.assist.srpAssistError ? (
        <div className="error-state">{state.assist.srpAssistError}</div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value audit-meta-value">{value}</div>
    </div>
  );
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getAssistStatusMessage(state: SrpAssistActionState) {
  if (state.status === "success") {
    return "SRP estimate ready.";
  }

  if (state.status === "warning") {
    return "This killmail could not be fully analyzed. Please ask an officer to review manually.";
  }

  if (state.status === "error") {
    return state.message || "Paste a zKillboard killmail URL or ESI killmail URL.";
  }

  return state.message;
}

function formatIsk(value: string) {
  if (!value) {
    return "Unknown";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(numericValue);
}

function formatInsuranceSource(value: string) {
  if (value === "zkillboard") {
    return "zKillboard table";
  }

  if (value === "esi") {
    return "Public ESI";
  }

  if (value === "esi_cache") {
    return "Cached ESI";
  }

  return "Officer review";
}
