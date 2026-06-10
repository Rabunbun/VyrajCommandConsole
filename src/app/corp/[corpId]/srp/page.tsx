import Link from "next/link";
import { notFound } from "next/navigation";
import {
  analyzeSrpRequestAssistAction,
  submitSrpRequestAction,
  updateSrpRequestAction
} from "@/app/corp/[corpId]/srp/actions";
import { EveShipImage } from "@/components/eve-ship-image";
import {
  getSrpPageData,
  srpStatusOptions,
  type SrpCorpView,
  type SrpRequestView,
  type SrpShipTypeOption
} from "@/lib/modules/srp";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type SrpPageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
    assistStatus?: string;
    calculatedEligibleAmount?: string;
    calculationSource?: string;
    characterName?: string;
    detectedShipName?: string;
    detectedShipTypeId?: string;
    doctrineName?: string;
    insurancePayout?: string;
    killmailId?: string;
    killmailTotalValue?: string;
    killmailUrl?: string;
    lossDate?: string;
    lossValue?: string;
    notes?: string;
    requestedAmount?: string;
    selectedShipName?: string;
    selectedShipTypeId?: string;
    shipDetectionSource?: string;
    srpAssistError?: string;
    warnings?: string;
  }>;
};

export default async function SrpPage({ params, searchParams }: SrpPageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();
  const result = await getSrpPageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="SRP Unavailable"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="SRP Requests Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <SrpHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />

      <SrpSubmissionPanel
        assistPreview={getAssistPreview(paramsResult)}
        corp={result.corp}
        shipTypes={result.shipTypes}
      />

      {result.canReviewSrp ? (
        <OfficerSrpQueue corp={result.corp} requests={result.requests} />
      ) : null}
    </div>
  );
}

function SrpHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: SrpCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Member Module</div>
      <h1 className="page-title">SRP Requests</h1>
      <p className="page-copy">
        Submit ship replacement requests for {corp.name}. Include the character,
        ship type, killmail link if available, requested payout amount, and any
        context officers need to review the loss.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href={`/corp/${corp.slug}`}>
          Back to Corp Portal
        </Link>
        <span className="badge">{corp.name}</span>
        <span className="badge">{corp.ticker}</span>
        <span className="badge">{accessMode}</span>
      </div>
    </header>
  );
}

function UnavailableState({
  corp,
  eyebrow,
  message,
  title
}: {
  corp?: SrpCorpView;
  eyebrow: string;
  message: string;
  title: string;
}) {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-copy">{message}</p>
      </header>
      <div className="badge-row">
        <Link className="secondary-button" href={corp ? `/corp/${corp.slug}` : "/"}>
          {corp ? "Back to Corp Portal" : "Alliance Hub"}
        </Link>
      </div>
    </div>
  );
}

function MessageBanner({
  success,
  error
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <div className={error ? "error-state" : "success-state"} role="status">
      {error || success}
    </div>
  );
}

type SrpAssistPreview = {
  assistStatus: string;
  calculatedEligibleAmount: string;
  calculationSource: string;
  characterName: string;
  detectedShipName: string;
  detectedShipTypeId: string;
  doctrineName: string;
  insurancePayout: string;
  killmailId: string;
  killmailTotalValue: string;
  killmailUrl: string;
  lossDate: string;
  lossValue: string;
  notes: string;
  requestedAmount: string;
  selectedShipName: string;
  selectedShipTypeId: string;
  shipDetectionSource: string;
  srpAssistError: string;
  warnings: string;
};

function SrpSubmissionPanel({
  assistPreview,
  corp,
  shipTypes
}: {
  assistPreview: SrpAssistPreview;
  corp: SrpCorpView;
  shipTypes: SrpShipTypeOption[];
}) {
  const previewShipTypeId =
    parseOptionalNumber(assistPreview.selectedShipTypeId) ||
    parseOptionalNumber(assistPreview.detectedShipTypeId);
  const previewShipName =
    assistPreview.selectedShipName || assistPreview.detectedShipName;
  const previewShip = previewShipTypeId
    ? shipTypes.find((shipType) => shipType.typeId === previewShipTypeId)
    : shipTypes.find(
        (shipType) =>
          previewShipName &&
          shipType.typeName.toLocaleLowerCase("en-US") ===
            previewShipName.toLocaleLowerCase("en-US")
      );

  return (
    <details className="create-disclosure form-panel form-panel-wide" aria-label="Submit SRP request">
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

      <form action={submitSrpRequestAction} className="section-stack">
        <ShipTypeDatalist shipTypes={shipTypes} />
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Character / Pilot Name</span>
            <input
              className="text-input"
              defaultValue={assistPreview.characterName}
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
                assistPreview.lossValue ||
                assistPreview.killmailTotalValue ||
                assistPreview.requestedAmount
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
                assistPreview.calculatedEligibleAmount ||
                assistPreview.requestedAmount
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
              defaultValue={assistPreview.lossDate}
              name="lossDate"
              type="date"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Killmail URL</span>
            <input
              className="text-input"
              defaultValue={assistPreview.killmailUrl}
              name="killmailUrl"
              placeholder="zKillboard or official ESI killmail URL"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Doctrine / Fleet Context</span>
            <input
              className="text-input"
              defaultValue={assistPreview.doctrineName}
              name="doctrineName"
            />
          </label>
        </div>

        <input name="shipType" type="hidden" value={previewShip?.typeName || previewShipName} />

        <SrpAssistPreviewPanel
          assistPreview={assistPreview}
          previewShip={previewShip}
          previewShipName={previewShipName}
          previewShipTypeId={previewShipTypeId}
        />

        <label className="field-stack">
          <span className="field-label">Notes</span>
          <textarea
            className="text-input"
            defaultValue={assistPreview.notes}
            name="notes"
            rows={4}
            placeholder="Fleet, FC, reimbursement context, or anything officers need."
          />
        </label>

        <div className="badge-row">
          <button
            className="secondary-button"
            formAction={analyzeSrpRequestAssistAction}
            type="submit"
          >
            Analyze / Recalculate SRP
          </button>
          <button className="command-button" type="submit">
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
  assistPreview,
  previewShip,
  previewShipName,
  previewShipTypeId
}: {
  assistPreview: SrpAssistPreview;
  previewShip?: SrpShipTypeOption;
  previewShipName: string;
  previewShipTypeId: number | null;
}) {
  if (!assistPreview.assistStatus && !previewShipName && !previewShipTypeId) {
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
        {assistPreview.assistStatus ? (
          <span className="badge">{formatStatusLabel(assistPreview.assistStatus)}</span>
        ) : null}
      </div>

      <div className="metric-grid">
        <Metric
          label="Killmail ID"
          value={assistPreview.killmailId || "Not detected"}
        />
        <Metric
          label="Loss Value"
          value={formatIsk(assistPreview.killmailTotalValue || assistPreview.lossValue)}
        />
        <Metric
          label="Platinum Deduction"
          value={formatIsk(assistPreview.insurancePayout)}
        />
        <Metric
          label="Recommended SRP"
          value={formatIsk(assistPreview.calculatedEligibleAmount)}
        />
      </div>

      {assistPreview.warnings ? (
        <div className="empty-state">{assistPreview.warnings}</div>
      ) : null}
      {assistPreview.srpAssistError ? (
        <div className="error-state">{assistPreview.srpAssistError}</div>
      ) : null}
    </section>
  );
}

function OfficerSrpQueue({
  corp,
  requests
}: {
  corp: SrpCorpView;
  requests: SrpRequestView[];
}) {
  const highlightedRequests = requests.filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "APPROVED"].includes(request.status)
  );
  const approvedUnpaidRequests = requests.filter(
    (request) => request.status === "APPROVED"
  );

  return (
    <section className="section-stack" aria-label="Officer SRP queue">
      <div className="section-heading">
        <h2 className="section-title">Officer Review Queue</h2>
        <div className="badge-row">
          <span className="badge">{highlightedRequests.length} highlighted</span>
          <span className="badge">{approvedUnpaidRequests.length} approved unpaid</span>
        </div>
      </div>

      {requests.length ? (
        requests.map((request) => (
          <SrpReviewCard corp={corp} key={request.id} request={request} />
        ))
      ) : (
        <div className="empty-state">No SRP requests waiting for review.</div>
      )}
    </section>
  );
}

function SrpReviewCard({
  corp,
  request
}: {
  corp: SrpCorpView;
  request: SrpRequestView;
}) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h3 className="card-title">{request.characterName}</h3>
          <div className="card-subtitle">{request.shipType}</div>
        </div>
        <div className="badge-row">
          <span className="badge">{formatStatusLabel(request.status)}</span>
          <span className="badge">{corp.ticker}</span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Requested ISK" value={formatIsk(request.requestedAmount)} />
        <Metric label="Payout ISK" value={formatIsk(request.payoutAmount)} />
        <Metric label="Doctrine" value={request.doctrineName || "None"} />
        <Metric label="Loss Date" value={request.lossDate || "Unknown"} />
      </div>

      <div className="section-stack">
        <h4 className="section-title">Smart SRP Assist</h4>
        <div className="metric-grid">
          <Metric
            label="Assist Status"
            value={formatStatusLabel(request.srpAssistStatus || "not_checked")}
          />
          <Metric
            label="Ship"
            value={
              request.selectedShipName ||
              request.detectedShipName ||
              request.shipType ||
              "Unknown"
            }
          />
          <Metric
            label="Loss Value"
            value={formatIsk(request.killmailTotalValue || request.lossValue)}
          />
          <Metric
            label="Platinum Deduction"
            value={formatIsk(request.insurancePayout)}
          />
          <Metric
            label="Recommended SRP"
            value={formatIsk(request.calculatedEligibleAmount)}
          />
          <Metric
            label="Source"
            value={formatStatusLabel(request.calculationSource || "none")}
          />
        </div>
        {request.calculationWarnings ? (
          <div className="empty-state">{request.calculationWarnings}</div>
        ) : null}
        {request.srpAssistError ? (
          <div className="error-state">{request.srpAssistError}</div>
        ) : null}
      </div>

      {request.killmailUrl ? (
        <p className="card-copy">Killmail: {request.killmailUrl}</p>
      ) : null}
      {request.notes ? <p className="card-copy">{request.notes}</p> : null}

      <details className="details-panel">
        <summary className="details-summary">Review SRP Request</summary>
        <form action={updateSrpRequestAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <input name="requestId" type="hidden" value={request.id} />
          <div className="form-grid">
            <label className="field-stack">
              <span className="field-label">Status</span>
              <select
                className="text-input"
                defaultValue={request.status}
                name="status"
              >
                {srpStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span className="field-label">Payout Amount</span>
              <input
                className="text-input"
                defaultValue={request.payoutAmount}
                min={0}
                name="payoutAmount"
                step="0.01"
                type="number"
              />
            </label>
          </div>

          <label className="field-stack">
            <span className="field-label">Reviewer Notes</span>
            <textarea
              className="text-input"
              defaultValue={request.notes}
              name="reviewerNotes"
              rows={4}
            />
          </label>

          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Review
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

function getAssistPreview(
  params?: Awaited<SrpPageProps["searchParams"]>
): SrpAssistPreview {
  return {
    assistStatus: params?.assistStatus || "",
    calculatedEligibleAmount: params?.calculatedEligibleAmount || "",
    calculationSource: params?.calculationSource || "",
    characterName: params?.characterName || "",
    detectedShipName: params?.detectedShipName || "",
    detectedShipTypeId: params?.detectedShipTypeId || "",
    doctrineName: params?.doctrineName || "",
    insurancePayout: params?.insurancePayout || "",
    killmailId: params?.killmailId || "",
    killmailTotalValue: params?.killmailTotalValue || "",
    killmailUrl: params?.killmailUrl || "",
    lossDate: params?.lossDate || "",
    lossValue: params?.lossValue || "",
    notes: params?.notes || "",
    requestedAmount: params?.requestedAmount || "",
    selectedShipName: params?.selectedShipName || "",
    selectedShipTypeId: params?.selectedShipTypeId || "",
    shipDetectionSource: params?.shipDetectionSource || "",
    srpAssistError: params?.srpAssistError || "",
    warnings: params?.warnings || ""
  };
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value audit-meta-value">{value}</div>
    </div>
  );
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
