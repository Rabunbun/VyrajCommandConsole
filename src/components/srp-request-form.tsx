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
    parseOptionalNumber(state.fields.selectedShipTypeId) ||
    parseOptionalNumber(state.assist.selectedShipTypeId) ||
    parseOptionalNumber(state.assist.detectedShipTypeId);
  const previewShipName =
    state.fields.selectedShipName ||
    state.assist.selectedShipName ||
    state.assist.detectedShipName;
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
    state.assist.detectedShipTypeId,
    state.assist.selectedShipTypeId
  ].join(":");

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
          Smart SRP recommends an eligible amount from public killmail and
          insurance data when available. Officers still control final review.
        </p>
      </div>

      <form action={analyzeAction} className="section-stack" key={formStateKey}>
        <ShipTypeDatalist shipTypes={shipTypes} />
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Character / Pilot Name</span>
            <input
              className="text-input"
              defaultValue={state.fields.characterName}
              name="characterName"
              required
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Manual Ship Selector</span>
            <input
              className="text-input"
              defaultValue={previewShip?.typeName || previewShipName}
              list={shipTypes.length ? "srp-ship-type-options" : undefined}
              name="selectedShipName"
              placeholder={shipTypes.length ? "Search cached EVE ship types" : ""}
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Selected Ship Type ID</span>
            <input
              className="text-input"
              defaultValue={previewShip?.typeId || previewShipTypeId || ""}
              min={1}
              name="selectedShipTypeId"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Loss Value</span>
            <input
              className="text-input"
              defaultValue={
                state.fields.lossValue ||
                state.assist.killmailTotalValue ||
                state.fields.requestedAmount
              }
              min={0}
              name="lossValue"
              step="0.01"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Requested ISK Amount</span>
            <input
              className="text-input"
              defaultValue={
                state.assist.calculatedEligibleAmount ||
                state.fields.requestedAmount
              }
              min={0}
              name="requestedAmount"
              required
              step="0.01"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Loss Date</span>
            <input
              className="text-input"
              defaultValue={state.fields.lossDate}
              name="lossDate"
              type="date"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Killmail URL</span>
            <input
              className="text-input"
              defaultValue={state.fields.killmailUrl}
              name="killmailUrl"
              placeholder="zKillboard or official ESI killmail URL"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Doctrine / Fleet Context</span>
            <input
              className="text-input"
              defaultValue={state.fields.doctrineName}
              name="doctrineName"
            />
          </label>
        </div>

        <input
          name="shipType"
          type="hidden"
          value={previewShip?.typeName || previewShipName}
        />

        <SrpAssistPreviewPanel
          previewShip={previewShip}
          previewShipName={previewShipName}
          previewShipTypeId={previewShipTypeId}
          state={state}
        />

        <label className="field-stack">
          <span className="field-label">Notes</span>
          <textarea
            className="text-input"
            defaultValue={state.fields.notes}
            name="notes"
            rows={4}
            placeholder="Fleet, FC, reimbursement context, or anything officers need."
          />
        </label>

        <div className="badge-row">
          <button className="secondary-button" disabled={isPending} type="submit">
            {isPending ? "Analyzing..." : "Analyze / Recalculate SRP"}
          </button>
          <button
            className="command-button"
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

function ShipTypeDatalist({ shipTypes }: { shipTypes: SrpShipTypeOption[] }) {
  if (!shipTypes.length) {
    return null;
  }

  return (
    <datalist id="srp-ship-type-options">
      {shipTypes.map((shipType) => (
        <option
          key={shipType.typeId}
          label={[shipType.groupName, `Type ${shipType.typeId}`]
            .filter(Boolean)
            .join(" / ")}
          value={shipType.typeName}
        />
      ))}
    </datalist>
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
        Optional: paste a killmail URL or select a ship, then analyze to estimate
        Platinum insurance deduction and recommended SRP.
      </div>
    );
  }

  return (
    <section className="data-card" aria-label="SRP assist preview">
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
              {previewShip?.typeName || previewShipName || "No ship selected"}
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

      {state.message ? (
        <div
          className={state.status === "error" ? "error-state" : "success-state"}
          role="status"
        >
          {state.message}
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric
          label="Killmail ID"
          value={state.assist.killmailId || "Not detected"}
        />
        <Metric
          label="Detected Ship"
          value={state.assist.detectedShipName || "Not detected"}
        />
        <Metric
          label="Selected Ship"
          value={previewShip?.typeName || previewShipName || "Manual review"}
        />
        <Metric
          label="Detection Source"
          value={state.assist.shipDetectionSource || "None"}
        />
        <Metric
          label="Loss Value"
          value={formatIsk(state.assist.killmailTotalValue || state.fields.lossValue)}
        />
        <Metric
          label="Platinum Deduction"
          value={formatIsk(state.assist.insurancePayout)}
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

function formatIsk(value: string) {
  if (!value) {
    return "Unset";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(numericValue);
}
