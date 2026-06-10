import Link from "next/link";
import { notFound } from "next/navigation";
import {
  updateSrpRequestAction
} from "@/app/corp/[corpId]/srp/actions";
import { SrpRequestForm } from "@/components/srp-request-form";
import {
  getSrpPageData,
  srpStatusOptions,
  type SrpCorpView,
  type SrpRequestView
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

      <SrpRequestForm corp={result.corp} shipTypes={result.shipTypes} />

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
  const sanitizedError = sanitizeQueryMessage(error, "error");
  const sanitizedSuccess = sanitizeQueryMessage(success, "success");

  if (!sanitizedSuccess && !sanitizedError) {
    return null;
  }

  return (
    <div className={sanitizedError ? "error-state" : "success-state"} role="status">
      {sanitizedError || sanitizedSuccess}
    </div>
  );
}

function sanitizeQueryMessage(
  message: string | undefined,
  type: "success" | "error"
) {
  if (!message) {
    return "";
  }

  const trimmed = message.trim();

  if (!trimmed) {
    return "";
  }

  if (isTechnicalFrameworkMessage(trimmed)) {
    return type === "error"
      ? "Action could not be completed. Please try again."
      : "";
  }

  return trimmed;
}

function isTechnicalFrameworkMessage(message: string) {
  return /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/i.test(message) ||
    /digest:/i.test(message);
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
