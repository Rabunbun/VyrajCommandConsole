import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createLootSplitAction,
  updateLootSplitStatusAction
} from "@/app/corp/[corpId]/loot-splits/actions";
import {
  getLootSplitPageData,
  lootSplitStatusOptions,
  type LootSplitCorpView,
  type LootSplitView
} from "@/lib/modules/loot-splits";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type LootSplitsPageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function LootSplitsPage({
  params,
  searchParams
}: LootSplitsPageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  const result = await getLootSplitPageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="Loot Split Access Denied"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="Loot Split Calculation Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <LootSplitHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />
      <LootSplitCalculator corp={result.corp} />
      <LootSplitHistory corp={result.corp} lootSplits={result.lootSplits} />
    </div>
  );
}

function LootSplitHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: LootSplitCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Officer Module</div>
      <h1 className="page-title">Loot Split Calculation</h1>
      <p className="page-copy">
        Calculate flat-cut loot splits for {corp.name}, save participant payouts,
        and track payout status.
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
  corp?: LootSplitCorpView;
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

function LootSplitCalculator({ corp }: { corp: LootSplitCorpView }) {
  return (
    <details className="create-disclosure form-panel form-panel-wide" aria-label="Create loot split">
      <summary className="create-summary">
        <span className="command-button">Create Loot Split</span>
      </summary>
      <div className="card-heading">
        <h2 className="section-title">Calculator / Save Split</h2>
        <p className="card-copy">
          This pass uses flat ISK cuts: payout pool = total loot value - corp cut
          - SRP reserve. Participant payout = payout pool * participant shares /
          total shares.
        </p>
      </div>

      <form action={createLootSplitAction} className="section-stack">
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Title / Operation</span>
            <input className="text-input" name="title" required />
          </label>

          <label className="field-stack">
            <span className="field-label">Source Type</span>
            <input
              className="text-input"
              name="sourceType"
              placeholder="Pochven, mining op, fleet loot..."
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Total Loot Value</span>
            <input
              className="text-input"
              min={0}
              name="totalValue"
              required
              step="0.01"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Corp Cut</span>
            <input
              className="text-input"
              defaultValue="0"
              min={0}
              name="corpCutAmount"
              required
              step="0.01"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">SRP Reserve</span>
            <input
              className="text-input"
              defaultValue="0"
              min={0}
              name="srpReserveAmount"
              required
              step="0.01"
              type="number"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Status</span>
            <select className="text-input" defaultValue="CALCULATED" name="status">
              {lootSplitStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-stack">
          <span className="field-label">Notes</span>
          <textarea className="text-input" name="notes" rows={3} />
        </label>

        <fieldset className="fieldset-panel">
          <legend className="field-label">Participants</legend>
          <div className="section-stack">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="form-grid" key={index}>
                <label className="field-stack">
                  <span className="field-label">Pilot {index + 1}</span>
                  <input
                    className="text-input"
                    name="participantName"
                    placeholder={index === 0 ? "Required" : "Optional"}
                    required={index === 0}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-label">Shares</span>
                  <input
                    className="text-input"
                    defaultValue={index === 0 ? "1" : ""}
                    min={0.0001}
                    name="participantShares"
                    required={index === 0}
                    step="0.0001"
                    type="number"
                  />
                </label>

                <label className="field-stack">
                  <span className="field-label">Notes / Role</span>
                  <input className="text-input" name="participantNotes" />
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="empty-state">
          Calculation preview: saved payout rows are calculated on submit and
          appear in history below. Percent-based cuts are intentionally deferred.
        </div>

        <div className="badge-row">
          <button className="command-button" type="submit">
            Calculate and Save
          </button>
        </div>
      </form>
    </details>
  );
}

function LootSplitHistory({
  corp,
  lootSplits
}: {
  corp: LootSplitCorpView;
  lootSplits: LootSplitView[];
}) {
  return (
    <section className="section-stack" aria-label="Loot split history">
      <div className="section-heading">
        <h2 className="section-title">Saved Loot Split History</h2>
        <div className="badge-row">
          <span className="badge">{lootSplits.length} saved</span>
        </div>
      </div>

      {lootSplits.length ? (
        lootSplits.map((split) => (
          <LootSplitCard corp={corp} key={split.id} split={split} />
        ))
      ) : (
        <div className="empty-state">No loot splits saved for this corp.</div>
      )}
    </section>
  );
}

function LootSplitCard({
  corp,
  split
}: {
  corp: LootSplitCorpView;
  split: LootSplitView;
}) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h3 className="card-title">{split.title}</h3>
          <div className="card-subtitle">
            {split.sourceType || "Loot Split"} / {formatDate(split.createdAt)}
          </div>
        </div>
        <div className="badge-row">
          <span className="badge">{formatStatusLabel(split.status)}</span>
          <span className="badge">{corp.ticker}</span>
          <span className="badge">{split.participants.length} participants</span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Total Value" value={formatIsk(split.totalValue)} />
        <Metric label="Corp Cut" value={formatIsk(split.corpCutAmount)} />
        <Metric label="SRP Reserve" value={formatIsk(split.srpReserveAmount)} />
        <Metric label="Payout Pool" value={formatIsk(split.payoutPool)} />
      </div>

      {split.notes ? <p className="card-copy">{split.notes}</p> : null}

      <details className="details-panel">
        <summary className="details-summary">Participants and Payouts</summary>
        {split.participants.length ? (
          <div className="audit-meta-grid">
            {split.participants.map((participant) => (
              <div className="metric" key={participant.id}>
                <div className="metric-label">{participant.shares} shares</div>
                <div className="metric-value audit-meta-value">
                  {participant.pilotName}
                </div>
                <p className="card-copy">
                  Payout: {formatIsk(participant.payoutAmount)}
                </p>
                {participant.notes ? (
                  <p className="card-copy">{participant.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="card-copy">No participants saved.</p>
        )}
      </details>

      <details className="details-panel">
        <summary className="details-summary">Update Status</summary>
        <form action={updateLootSplitStatusAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <input name="lootSplitId" type="hidden" value={split.id} />
          <div className="form-grid">
            <label className="field-stack">
              <span className="field-label">Status</span>
              <select className="text-input" defaultValue={split.status} name="status">
                {lootSplitStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field-stack">
            <span className="field-label">Notes</span>
            <textarea
              className="text-input"
              defaultValue={split.notes}
              name="notes"
              rows={3}
            />
          </label>

          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Status
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
    return "0";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(numericValue);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
