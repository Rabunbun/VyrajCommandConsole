"use client";

import { useMemo, useState } from "react";
import { updateSrpRequestAction } from "@/app/corp/[corpId]/srp/actions";
import { EveShipImage } from "@/components/eve-ship-image";
import { formatStatusLabel } from "@/lib/public-data";
import { srpStatusOptions } from "@/lib/srp-status";

type SrpCorpView = {
  slug: string;
  ticker: string;
};

type SrpRequestView = {
  id: string;
  calculatedEligibleAmount: string;
  calculationSource: string;
  calculationWarnings: string;
  characterName: string;
  createdAt: string;
  detectedShipName: string;
  detectedShipTypeId: number | null;
  doctrineName: string;
  insurancePayout: string;
  insurancePayoutSource: string;
  killmailId: string;
  killmailTotalValue: string;
  killmailUrl: string;
  lossValue: string;
  notes: string;
  payoutAmount: string;
  requestedAmount: string;
  reviewerName: string;
  selectedShipName: string;
  selectedShipTypeId: number | null;
  shipType: string;
  srpAssistCheckedAt: string | null;
  srpAssistError: string;
  srpAssistStatus: string;
  status: string;
  updatedAt: string;
};

type SrpShipTypeOption = {
  groupName: string;
  iconUrl: string;
  renderUrl: string;
  typeId: number | null;
  typeName: string;
};

type SrpQueueBoardProps = {
  corp: SrpCorpView;
  requests: SrpRequestView[];
  shipTypes: SrpShipTypeOption[];
};

type SrpQueueBucket = {
  description: string;
  defaultOpen: boolean;
  emptyMessage: string;
  key: string;
  requests: SrpRequestView[];
  title: string;
};

export function SrpQueueBoard({
  corp,
  requests,
  shipTypes
}: SrpQueueBoardProps) {
  const [assistFilter, setAssistFilter] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredRequests = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);

    return requests.filter((request) => {
      const matchesStatus = statusFilter ? request.status === statusFilter : true;
      const matchesAssist = assistFilter
        ? normalizeSearchText(request.srpAssistStatus || "not_checked") ===
          normalizeSearchText(assistFilter)
        : true;
      const searchableText = normalizeSearchText([
        request.characterName,
        request.detectedShipName,
        request.killmailId,
        request.killmailUrl,
        request.selectedShipName,
        request.shipType
      ].join(" "));
      const matchesQuery = normalizedQuery
        ? searchableText.includes(normalizedQuery)
        : true;

      return matchesStatus && matchesAssist && matchesQuery;
    });
  }, [assistFilter, query, requests, statusFilter]);

  const buckets = useMemo(
    () => buildSrpQueues(filteredRequests),
    [filteredRequests]
  );
  const counts = buildSrpCounts(requests);

  return (
    <section className="section-stack" aria-label="Officer SRP queue">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="section-title">Officer SRP Queues</h2>
          <p className="card-copy">
            Separate active review, payment, and archive lanes for faster
            reimbursement decisions.
          </p>
        </div>
        <div className="badge-row">
          <span className="badge">{requests.length} total</span>
          <span className="badge">{counts.actionRequired} action</span>
          <span className="badge">{counts.paymentQueue} payment</span>
          <span className="badge">{counts.assistAttention} assist attention</span>
        </div>
      </div>

      <div className="status-grid" aria-label="SRP queue summary">
        <QueueStat label="Submitted" value={counts.submitted} />
        <QueueStat label="Needs Info" value={counts.needsInfo} />
        <QueueStat label="Awaiting Payment" value={counts.paymentQueue} />
        <QueueStat label="Paid" value={counts.paid} />
        <QueueStat label="Denied / Cancelled" value={counts.closedWithoutPayment} />
        <QueueStat label="Assist Partial / Failed" value={counts.assistAttention} />
      </div>

      <div className="form-panel form-panel-wide">
        <div className="card-heading">
          <h3 className="section-title">Filter Queue</h3>
          <p className="card-copy">
            Search by pilot, ship, killmail ID, or killmail URL.
          </p>
        </div>
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Search</span>
            <input
              className="text-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pilot, ship, killmail"
              type="search"
              value={query}
            />
          </label>
          <label className="field-stack">
            <span className="field-label">Status</span>
            <select
              className="text-input"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="">All statuses</option>
              {srpStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span className="field-label">Assist Status</span>
            <select
              className="text-input"
              onChange={(event) => setAssistFilter(event.target.value)}
              value={assistFilter}
            >
              <option value="">All assist states</option>
              <option value="success">Success</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
              <option value="manual">Manual</option>
              <option value="not_checked">Not Checked</option>
            </select>
          </label>
        </div>
        <div className="badge-row">
          <span className="badge">{filteredRequests.length} shown</span>
          {(query || statusFilter || assistFilter) ? (
            <button
              className="secondary-button"
              onClick={() => {
                setAssistFilter("");
                setQuery("");
                setStatusFilter("");
              }}
              type="button"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      {buckets.map((bucket) => (
        <SrpQueueSection
          bucket={bucket}
          corp={corp}
          key={bucket.key}
          shipTypes={shipTypes}
        />
      ))}
    </section>
  );
}

function SrpQueueSection({
  bucket,
  corp,
  shipTypes
}: {
  bucket: SrpQueueBucket;
  corp: SrpCorpView;
  shipTypes: SrpShipTypeOption[];
}) {
  return (
    <details
      className="srp-queue-section form-panel form-panel-wide"
      data-queue={bucket.key}
      open={bucket.defaultOpen}
    >
      <summary className="srp-queue-summary">
        <span>
          {bucket.title} ({bucket.requests.length})
        </span>
        <small>{bucket.description}</small>
      </summary>

      {bucket.requests.length ? (
        <div className="srp-card-grid">
          {bucket.requests.map((request) => (
            <SrpReviewCard
              corp={corp}
              key={request.id}
              request={request}
              ship={findShipType(request, shipTypes)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">{bucket.emptyMessage}</div>
      )}
    </details>
  );
}

function SrpReviewCard({
  corp,
  request,
  ship
}: {
  corp: SrpCorpView;
  request: SrpRequestView;
  ship?: SrpShipTypeOption;
}) {
  const shipName = request.selectedShipName ||
    request.detectedShipName ||
    request.shipType ||
    "Unknown ship";
  const statusTone = getStatusTone(request.status);
  const assistTone = getAssistTone(request.srpAssistStatus);
  const headlineAmount = request.payoutAmount ||
    request.calculatedEligibleAmount ||
    request.requestedAmount;
  const hasAttention = assistTone === "failed" || assistTone === "partial" ||
    request.status === "NEEDS_INFO";

  return (
    <details className="data-card srp-request-card" data-status={statusTone}>
      <summary className="srp-request-summary">
        <div className="doctrine-card-heading">
          {ship?.renderUrl ? (
            <EveShipImage
              alt={`${ship.typeName} ship render`}
              className="doctrine-ship-image"
              fallbackLabel={ship.typeName}
              iconUrl={ship.iconUrl}
              renderUrl={ship.renderUrl}
            />
          ) : (
            <div className="doctrine-ship-placeholder" aria-hidden="true">
              {shipName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="card-heading">
            <h3 className="card-title">{request.characterName}</h3>
            <div className="card-subtitle">{shipName}</div>
            <p className="card-copy">
              Submitted {formatDate(request.createdAt)}
            </p>
          </div>
        </div>
        <div className="srp-request-summary-meta">
          <div className="srp-amount-readout">
            {formatIsk(headlineAmount)}
          </div>
          <div className="badge-row">
            {hasAttention ? <span className="assist-badge" data-assist="partial">Review</span> : null}
            {request.killmailUrl ? <span className="badge">Killmail</span> : null}
          </div>
        </div>
        <div className="badge-row">
          <span className="status-badge" data-status={statusTone}>
            {formatStatusLabel(request.status)}
          </span>
          <span className="assist-badge" data-assist={assistTone}>
            Assist {formatStatusLabel(request.srpAssistStatus || "not_checked")}
          </span>
          <span className="badge">{corp.ticker}</span>
        </div>
      </summary>

      <div className="srp-request-expanded">
        <div className="metric-grid">
          <Metric label="Requested ISK" value={formatIsk(request.requestedAmount)} />
          <Metric
            label="Recommended SRP"
            value={formatIsk(request.calculatedEligibleAmount)}
          />
          <Metric
            label="Platinum Deduction"
            value={formatIsk(request.insurancePayout)}
          />
          <Metric
            label="Insurance Source"
            value={formatInsuranceSource(request.insurancePayoutSource)}
          />
          <Metric label="Officer Payout" value={formatIsk(request.payoutAmount)} />
          <Metric
            label="Loss Value"
            value={formatIsk(request.killmailTotalValue || request.lossValue)}
          />
          <Metric label="Killmail ID" value={request.killmailId || "None"} />
          <Metric label="Doctrine" value={request.doctrineName || "None"} />
          <Metric label="Reviewer" value={request.reviewerName || "Unassigned"} />
        </div>

        {request.killmailUrl ? (
          <a
            className="secondary-button srp-killmail-link"
            href={request.killmailUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open Killmail
          </a>
        ) : null}

        <div className="section-stack">
          <h4 className="section-title">Smart SRP Assist</h4>
          <div className="metric-grid">
            <Metric
              label="Detected Ship"
              value={request.detectedShipName || "Not detected"}
            />
            <Metric
              label="Selected Ship"
              value={request.selectedShipName || "Manual review"}
            />
            <Metric
              label="Source"
              value={formatStatusLabel(request.calculationSource || "none")}
            />
            <Metric
              label="Checked"
              value={request.srpAssistCheckedAt ? formatDateTime(request.srpAssistCheckedAt) : "Not checked"}
            />
            <Metric label="Updated" value={formatDateTime(request.updatedAt)} />
          </div>
          {request.calculationWarnings ? (
            <div className="empty-state">{request.calculationWarnings}</div>
          ) : null}
          {request.srpAssistError ? (
            <div className="error-state">{request.srpAssistError}</div>
          ) : null}
        </div>

        {request.notes ? <p className="card-copy">{request.notes}</p> : null}

        <form action={updateSrpRequestAction} className="section-stack">
          <h4 className="section-title">Officer Review</h4>
          <p className="card-copy">
            Smart SRP is advisory. Confirm the insurance source and set the final
            officer-approved payout before approving or marking paid.
          </p>
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
                defaultValue={
                  request.payoutAmount ||
                  (request.status === "APPROVED"
                    ? request.calculatedEligibleAmount
                    : "")
                }
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
      </div>
    </details>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="status-panel">
      <div className="status-label">{label}</div>
      <div className="status-value">{value}</div>
    </div>
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

function buildSrpQueues(requests: SrpRequestView[]): SrpQueueBucket[] {
  const actionRequired = requests.filter((request) =>
    ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO"].includes(request.status)
  );
  const paymentQueue = requests.filter((request) => request.status === "APPROVED");
  const completed = requests.filter((request) => request.status === "PAID");
  const deniedCancelled = requests.filter((request) =>
    ["DENIED", "CANCELLED"].includes(request.status)
  );

  return [
    {
      description: "New or problem SRP requests needing review.",
      defaultOpen: true,
      emptyMessage: "No SRP requests need officer action.",
      key: "action",
      requests: actionRequired,
      title: "Action Required"
    },
    {
      description: "Approved reimbursements awaiting payment.",
      defaultOpen: true,
      emptyMessage: "No approved reimbursements are waiting for payment.",
      key: "payment",
      requests: paymentQueue,
      title: "Payment Queue"
    },
    {
      description: "Paid SRP requests.",
      defaultOpen: false,
      emptyMessage: "No paid SRP requests match the current filters.",
      key: "completed",
      requests: completed,
      title: "Completed"
    },
    {
      description: "Closed without payment.",
      defaultOpen: false,
      emptyMessage: "No denied or cancelled SRP requests match the current filters.",
      key: "closed",
      requests: deniedCancelled,
      title: "Denied / Cancelled"
    },
    {
      description: "Every SRP request matching the current filters.",
      defaultOpen: false,
      emptyMessage: "No SRP requests match the current filters.",
      key: "archive",
      requests,
      title: "All Requests / Archive"
    }
  ];
}

function buildSrpCounts(requests: SrpRequestView[]) {
  const submitted = requests.filter((request) => request.status === "SUBMITTED").length;
  const needsInfo = requests.filter((request) => request.status === "NEEDS_INFO").length;
  const underReview = requests.filter((request) => request.status === "UNDER_REVIEW").length;
  const paymentQueue = requests.filter((request) => request.status === "APPROVED").length;
  const paid = requests.filter((request) => request.status === "PAID").length;
  const closedWithoutPayment = requests.filter((request) =>
    ["DENIED", "CANCELLED"].includes(request.status)
  ).length;
  const assistAttention = requests.filter((request) =>
    ["failed", "partial"].includes(normalizeSearchText(request.srpAssistStatus))
  ).length;

  return {
    actionRequired: submitted + underReview + needsInfo,
    assistAttention,
    closedWithoutPayment,
    needsInfo,
    paid,
    paymentQueue,
    submitted
  };
}

function findShipType(
  request: SrpRequestView,
  shipTypes: SrpShipTypeOption[]
) {
  const typeId = request.selectedShipTypeId || request.detectedShipTypeId;

  if (typeId) {
    return shipTypes.find((shipType) => shipType.typeId === typeId);
  }

  const shipName = normalizeSearchText(
    request.selectedShipName || request.detectedShipName || request.shipType
  );

  if (!shipName) {
    return undefined;
  }

  return shipTypes.find(
    (shipType) => normalizeSearchText(shipType.typeName) === shipName
  );
}

function getStatusTone(status: string) {
  if (status === "PAID") {
    return "complete";
  }

  if (status === "APPROVED") {
    return "payment";
  }

  if (status === "DENIED" || status === "CANCELLED") {
    return "closed";
  }

  if (status === "NEEDS_INFO") {
    return "warning";
  }

  return "action";
}

function getAssistTone(status: string) {
  const normalized = normalizeSearchText(status || "not_checked");

  if (normalized === "success") {
    return "success";
  }

  if (normalized === "failed") {
    return "failed";
  }

  if (normalized === "partial") {
    return "partial";
  }

  return "neutral";
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function formatDateTime(value: string) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function formatDate(value: string) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(date);
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
