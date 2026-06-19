import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createDoctrineFitAction,
  submitDoctrineReadinessAction,
  updateDoctrineFitAction
} from "@/app/corp/[corpId]/doctrine/actions";
import { CorpAccessDenied } from "@/components/corp-access-denied";
import {
  doctrineFitStatusOptions,
  doctrineReadinessStatusOptions,
  getDoctrinePageData,
  type DoctrineCorpView,
  type DoctrineFitView,
  type DoctrineShipTypeOption
} from "@/lib/modules/doctrine";
import { EveShipImage } from "@/components/eve-ship-image";
import { getCorpPortalAccessContext } from "@/lib/corp-portal-access";
import { formatStatusLabel } from "@/lib/public-data";
import { buildLoginPath } from "@/lib/route-policy";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type DoctrinePageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function DoctrinePage({
  params,
  searchParams
}: DoctrinePageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();
  const access = await getCorpPortalAccessContext(corpSlug, { session });

  if (!access.corp) {
    notFound();
  }

  if (!access.allowed) {
    if (access.loginRequired) {
      redirect(buildLoginPath(`/corp/${corpSlug}/doctrine`));
    }

    return (
      <CorpAccessDenied
        access={access}
        moduleName="Doctrine Readiness"
        returnTo={`/corp/${corpSlug}/doctrine`}
      />
    );
  }

  const result = await getDoctrinePageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="Doctrine Unavailable"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="Doctrine Readiness Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <DoctrineHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />

      <DoctrineFitList
        canManageDoctrine={result.canManageDoctrine}
        corp={result.corp}
        fits={result.fits}
      />

      {result.canManageDoctrine ? (
        <OfficerDoctrinePanel
          corp={result.corp}
          fits={result.fits}
          shipTypes={result.shipTypes}
        />
      ) : null}
    </div>
  );
}

function DoctrineHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: DoctrineCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Doctrine Module</div>
      <h1 className="page-title">Doctrine Fit Registry</h1>
      <p className="page-copy">
        Track exact ship-fit readiness for {corp.name}. Pilots can submit
        readiness while officers maintain the doctrine registry.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href={`/corp/${corp.slug}`}>
          Back to Corp Portal
        </Link>
        <Link className="secondary-button" href="/">
          Back to Alliance Hub
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
  corp?: DoctrineCorpView;
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

function ReadinessSubmissionForm({
  corp,
  fit
}: {
  corp: DoctrineCorpView;
  fit: DoctrineFitView;
}) {
  return (
    <div className="form-panel form-panel-wide" aria-label={`Submit readiness for ${fit.doctrineName}`}>
      <div className="card-heading">
        <h2 className="section-title">Submit Readiness</h2>
        <p className="card-copy">
          Submit or update readiness for this selected doctrine. Re-submitting
          with the same character name updates the existing readiness record.
        </p>
      </div>

      <form action={submitDoctrineReadinessAction} className="section-stack">
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <input name="doctrineFitId" type="hidden" value={fit.id} />
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Selected Doctrine</span>
            <input
              className="text-input"
              readOnly
              value={`${fit.doctrineName} / ${fit.shipName || "Unknown hull"}`}
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Pilot / Character Name</span>
            <input className="text-input" name="characterName" required />
          </label>

          <label className="field-stack">
            <span className="field-label">Readiness Status</span>
            <select
              className="text-input"
              defaultValue="READY"
              name="readiness"
            >
              {doctrineReadinessStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="fieldset-panel">
          <legend className="field-label">Readiness Checks</legend>
          <div className="checkbox-grid">
            <label className="checkbox-row">
              <input name="hullReady" type="checkbox" value="READY" />
              <span>Hull ready</span>
            </label>
            <label className="checkbox-row">
              <input name="skillsReady" type="checkbox" value="READY" />
              <span>Skills ready</span>
            </label>
            <label className="checkbox-row">
              <input name="fitReady" type="checkbox" value="READY" />
              <span>Fit ready</span>
            </label>
          </div>
        </fieldset>

        <label className="field-stack">
          <span className="field-label">Notes</span>
          <textarea className="text-input" name="notes" rows={3} />
        </label>

        <div className="badge-row">
          <button className="command-button" type="submit">
            Submit Readiness
          </button>
        </div>
      </form>
    </div>
  );
}

function OfficerDoctrinePanel({
  corp,
  fits,
  shipTypes
}: {
  corp: DoctrineCorpView;
  fits: DoctrineFitView[];
  shipTypes: DoctrineShipTypeOption[];
}) {
  return (
    <section className="section-stack" aria-label="Officer doctrine management">
      <ShipTypeDatalist shipTypes={shipTypes} />
      <details className="create-disclosure form-panel form-panel-wide">
        <summary className="create-summary">
          <span className="command-button">Create Doctrine</span>
        </summary>
        <div className="card-heading">
          <h2 className="section-title">Create Doctrine Fit</h2>
          <p className="card-copy">
            Search by EVE ship name or enter an exact Type ID. Type ID drives
            the rendered EVE ship image.
          </p>
        </div>
        <form action={createDoctrineFitAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <DoctrineFitFields shipTypes={shipTypes} />
          <div className="badge-row">
            <button className="command-button" type="submit">
              Create Doctrine Fit
            </button>
          </div>
        </form>
      </details>

      {fits.length ? (
        <div className="section-stack">
          <h2 className="section-title">Manage Doctrine Fits</h2>
          {fits.map((fit) => (
            <details className="data-card" key={fit.id}>
              <summary className="details-summary">
                Edit {fit.doctrineName}
              </summary>
              <form action={updateDoctrineFitAction} className="section-stack">
                <input name="corpSlug" type="hidden" value={corp.slug} />
                <input name="doctrineFitId" type="hidden" value={fit.id} />
                <DoctrineFitFields fit={fit} shipTypes={shipTypes} />
                <div className="badge-row">
                  <button className="command-button" type="submit">
                    Save Doctrine Fit
                  </button>
                </div>
              </form>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DoctrineFitList({
  canManageDoctrine,
  corp,
  fits
}: {
  canManageDoctrine: boolean;
  corp: DoctrineCorpView;
  fits: DoctrineFitView[];
}) {
  return (
    <section className="section-stack" aria-label="Doctrine fit list">
      <h2 className="section-title">Doctrine Fits</h2>
      {fits.length ? (
        fits.map((fit) => (
          <article className="data-card" key={fit.id}>
            <div className="section-heading">
              <div className="doctrine-card-heading">
                {fit.imageUrl ? (
                  <EveShipImage
                    alt={
                      fit.shipName
                        ? `${fit.shipName} ship render`
                        : "EVE ship render"
                    }
                    className="doctrine-ship-image"
                    fallbackLabel={fit.shipName || "?"}
                    iconUrl={fit.iconUrl}
                    renderUrl={fit.imageUrl}
                  />
                ) : (
                  <div className="doctrine-ship-placeholder" aria-hidden="true">
                    {fit.shipName ? fit.shipName.slice(0, 2).toUpperCase() : "?"}
                  </div>
                )}
                <div className="card-heading">
                  <h3 className="card-title">{fit.doctrineName}</h3>
                  <div className="card-subtitle">
                    {fit.shipName || "Unknown hull"}
                  </div>
                  {fit.shipGroupName || fit.shipTypeId ? (
                    <div className="card-copy">
                      {[fit.shipGroupName, fit.shipTypeId ? `Type ${fit.shipTypeId}` : ""]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="badge-row">
                <span className="badge" data-state={fit.status}>
                  {formatStatusLabel(fit.status)}
                </span>
                <span className="badge">{corp.ticker}</span>
              </div>
            </div>

            {fit.notes ? <p className="card-copy">{fit.notes}</p> : null}

            <ReadinessSummary fit={fit} />

            {fit.status === "ACTIVE" ? (
              <details className="details-panel">
                <summary className="details-summary">Submit Readiness</summary>
                <ReadinessSubmissionForm corp={corp} fit={fit} />
              </details>
            ) : (
              <div className="empty-state">
                Readiness submissions are closed for this doctrine status.
              </div>
            )}

            {fit.fitText ? (
              <details className="details-panel">
                <summary className="details-summary">Fit Text</summary>
                <pre className="json-block">{fit.fitText}</pre>
              </details>
            ) : null}

            {canManageDoctrine ? <ReadinessRoster fit={fit} /> : null}
          </article>
        ))
      ) : (
        <div className="empty-state">No doctrine fits available.</div>
      )}
    </section>
  );
}

function ReadinessSummary({ fit }: { fit: DoctrineFitView }) {
  const statuses = doctrineReadinessStatusOptions.map((status) => [
    status,
    fit.readinessSummary[status] || 0
  ] as const);
  const submittedCount = fit.readiness.length;

  return (
    <div className="section-stack">
      <h4 className="section-title">Readiness Summary</h4>
      {submittedCount ? (
        <div className="badge-row">
          {statuses.map(([status, count]) => (
            <span className="badge" key={status}>
              {formatStatusLabel(status)}: {count}
            </span>
          ))}
        </div>
      ) : (
        <p className="card-copy">No readiness submitted yet.</p>
      )}
    </div>
  );
}

function ReadinessRoster({ fit }: { fit: DoctrineFitView }) {
  return (
    <details className="details-panel">
      <summary className="details-summary">Readiness Roster</summary>
      {fit.readiness.length ? (
        <div className="audit-meta-grid">
          {fit.readiness.map((entry) => (
            <div className="metric" key={entry.id}>
              <div className="metric-label">{formatStatusLabel(entry.readiness)}</div>
              <div className="metric-value audit-meta-value">
                {entry.characterName}
              </div>
              <p className="card-copy">
                Hull {formatStatusLabel(entry.hullReady)} / Skills{" "}
                {formatStatusLabel(entry.skillsReady)} / Fit{" "}
                {formatStatusLabel(entry.fitReady)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="card-copy">No readiness submitted yet.</p>
      )}
    </details>
  );
}

function ShipTypeDatalist({
  shipTypes
}: {
  shipTypes: DoctrineShipTypeOption[];
}) {
  if (!shipTypes.length) {
    return null;
  }

  return (
    <datalist id="eve-ship-type-options">
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

function DoctrineFitFields({
  fit,
  shipTypes
}: {
  fit?: DoctrineFitView;
  shipTypes: DoctrineShipTypeOption[];
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field-stack">
          <span className="field-label">Doctrine Name</span>
          <input
            className="text-input"
            defaultValue={fit?.doctrineName}
            name="doctrineName"
            required
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Ship Name</span>
          <input
            className="text-input"
            defaultValue={fit?.shipName}
            list={shipTypes.length ? "eve-ship-type-options" : undefined}
            name="shipName"
            placeholder={shipTypes.length ? "Search cached EVE ship types" : ""}
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Ship Type ID</span>
          <input
            className="text-input"
            defaultValue={fit?.shipTypeId || ""}
            min={1}
            name="shipTypeId"
            type="number"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Status</span>
          <select
            className="text-input"
            defaultValue={fit?.status || "ACTIVE"}
            name="status"
          >
            {doctrineFitStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field-stack">
        <span className="field-label">Fit Text</span>
        <textarea
          className="text-input"
          defaultValue={fit?.fitText}
          name="fitText"
          rows={6}
        />
      </label>

      <label className="field-stack">
        <span className="field-label">Notes</span>
        <textarea
          className="text-input"
          defaultValue={fit?.notes}
          name="notes"
          rows={3}
        />
      </label>
    </>
  );
}
