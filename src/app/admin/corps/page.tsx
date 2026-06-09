import { CorpStatus, OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createCorpAction, updateCorpAction } from "@/app/admin/corps/actions";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  getCorpManagementData,
  getDefaultEnabledModules,
  type AdminCorpView,
  type CorpModuleOption
} from "@/lib/admin/corps";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type CorpManagementPageProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function CorpManagementPage({
  searchParams
}: CorpManagementPageProps) {
  const session = await getCurrentOfficerSession();
  const params = await searchParams;

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Corp Management",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/corps",
      summary: "Non-super-admin officer attempted to view Corp Management."
    });

    return <AccessDenied />;
  }

  let data;

  try {
    data = await getCorpManagementData();
  } catch (error) {
    return (
      <div className="page-stack">
        <AdminHeader />
        <div className="error-state">
          {error instanceof Error
            ? `Could not load corp records: ${error.message}`
            : "Could not load corp records."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AdminHeader />
      <MessageBanner success={params?.success} error={params?.error} />

      <CreateCorpPanel moduleOptions={data.moduleOptions} />

      {data.corps.length ? (
        <section className="section-stack" aria-label="Corp records">
          {data.corps.map((corp) => (
            <CorpCard
              corp={corp}
              key={corp.id}
              moduleOptions={data.moduleOptions}
            />
          ))}
        </section>
      ) : (
        <div className="empty-state">No corp records found.</div>
      )}
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="page-heading">
      <div className="eyebrow">Super Admin</div>
      <h1 className="page-title">Corp Management</h1>
      <p className="page-copy">
        Manage corp registry records, public portal content, status, and enabled
        module switches from Postgres.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href="/admin/super">
          Super Admin Console
        </Link>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}

function AccessDenied() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          Super Admin access is required to manage corp records.
        </p>
      </header>
      <div className="badge-row">
        <Link className="command-button" href="/">
          Alliance Hub
        </Link>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Logout
          </button>
        </form>
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

function CreateCorpPanel({
  moduleOptions
}: {
  moduleOptions: readonly CorpModuleOption[];
}) {
  const defaultModules = getDefaultEnabledModules();

  return (
    <section className="form-panel form-panel-wide" aria-label="Create corp">
      <div className="card-heading">
        <h2 className="section-title">Create Corp</h2>
        <p className="card-copy">
          Slugs are normalized to lowercase hyphenated URLs and cannot be edited
          after creation in this pass.
        </p>
      </div>

      <form action={createCorpAction} className="section-stack">
        <CorpFields
          defaultStatus={CorpStatus.TRIAL}
          includeSlug
          moduleOptions={moduleOptions}
          selectedModules={defaultModules}
        />
        <div className="badge-row">
          <button className="command-button" type="submit">
            Create Corp
          </button>
        </div>
      </form>
    </section>
  );
}

function CorpCard({
  corp,
  moduleOptions
}: {
  corp: AdminCorpView;
  moduleOptions: readonly CorpModuleOption[];
}) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="card-title">{corp.name}</h2>
          <div className="card-subtitle">
            {corp.ticker} / {corp.slug}
          </div>
        </div>
        <div className="badge-row">
          <span className="badge">{formatStatusLabel(corp.status)}</span>
          <span className="badge">{corp.recruitmentStatus}</span>
        </div>
      </div>

      <p className="card-copy">{corp.description || "No description posted."}</p>

      <div className="metric-grid">
        <Metric label="Members" value={corp.activeMembers} />
        <Metric label="Recent Ops" value={corp.recentOps} />
        <Metric label="Pending SRP" value={corp.pendingSrp} />
        <Metric label="Doctrine" value={`${corp.doctrineReadinessPercent}%`} />
      </div>

      <div className="section-stack">
        <h3 className="section-title">EVE Identity</h3>
        {corp.eveIdentityConfig?.eveCorporationId ? (
          <div className="metric-grid">
            <Metric
              label="EVE Corp"
              value={formatNamedId(
                corp.eveIdentityConfig.eveCorporationName,
                corp.eveIdentityConfig.eveCorporationId
              )}
            />
            <Metric
              label="EVE Alliance"
              value={formatNamedId(
                corp.eveIdentityConfig.eveAllianceName,
                corp.eveIdentityConfig.eveAllianceId
              )}
            />
            <Metric
              label="Sync Flag"
              value={
                corp.eveIdentityConfig.syncEnabled
                  ? "Enabled for future ESI"
                  : "Disabled"
              }
            />
            <Metric
              label="Last Verified"
              value={
                corp.eveIdentityConfig.lastVerifiedAt
                  ? formatDateTime(corp.eveIdentityConfig.lastVerifiedAt)
                  : "Not verified"
              }
            />
          </div>
        ) : (
          <p className="card-copy">No EVE corporation identity configured.</p>
        )}
      </div>

      <div className="section-stack">
        <h3 className="section-title">Announcements</h3>
        {corp.announcements.length ? (
          <div className="badge-row">
            {corp.announcements.map((announcement) => (
              <span className="badge" key={announcement}>
                {announcement}
              </span>
            ))}
          </div>
        ) : (
          <p className="card-copy">No corp announcements posted.</p>
        )}
      </div>

      <div className="section-stack">
        <h3 className="section-title">Enabled Modules</h3>
        <div className="badge-row">
          {moduleOptions
            .filter((module) => corp.enabledModules[module.key])
            .map((module) => (
              <span className="badge" key={module.key}>
                {module.label}
              </span>
            ))}
        </div>
      </div>

      <details className="details-panel">
        <summary className="details-summary">Edit Corp</summary>
        <form action={updateCorpAction} className="section-stack">
          <input name="corpId" type="hidden" value={corp.id} />
          <div className="empty-state">
            Public URL slug is locked for this pass: /corp/{corp.slug}
          </div>
          <CorpFields
            corp={corp}
            defaultStatus={corp.status}
            moduleOptions={moduleOptions}
            selectedModules={corp.enabledModules}
          />
          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Corp
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

function CorpFields({
  corp,
  defaultStatus,
  includeSlug = false,
  moduleOptions,
  selectedModules
}: {
  corp?: AdminCorpView;
  defaultStatus: CorpStatus;
  includeSlug?: boolean;
  moduleOptions: readonly CorpModuleOption[];
  selectedModules: Record<string, boolean>;
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field-stack">
          <span className="field-label">Corp Name</span>
          <input
            className="text-input"
            defaultValue={corp?.name}
            name="name"
            required
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Ticker</span>
          <input
            className="text-input"
            defaultValue={corp?.ticker}
            name="ticker"
            required
          />
        </label>

        {includeSlug ? (
          <label className="field-stack">
            <span className="field-label">Slug</span>
            <input
              className="text-input"
              name="slug"
              placeholder="example-corp"
              required
            />
          </label>
        ) : null}

        <label className="field-stack">
          <span className="field-label">Status</span>
          <select className="text-input" defaultValue={defaultStatus} name="status">
            <option value={CorpStatus.TRIAL}>Trial</option>
            <option value={CorpStatus.ACTIVE}>Active</option>
            <option value={CorpStatus.INACTIVE}>Inactive</option>
            <option value={CorpStatus.ARCHIVED}>Archived</option>
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Recruitment Status</span>
          <input
            className="text-input"
            defaultValue={corp?.recruitmentStatus || "Open"}
            name="recruitmentStatus"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Active Members</span>
          <input
            className="text-input"
            defaultValue={corp?.activeMembers ?? 0}
            min={0}
            name="activeMembers"
            type="number"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Recent Ops</span>
          <input
            className="text-input"
            defaultValue={corp?.recentOps ?? 0}
            min={0}
            name="recentOps"
            type="number"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Pending SRP</span>
          <input
            className="text-input"
            defaultValue={corp?.pendingSrp ?? 0}
            min={0}
            name="pendingSrp"
            type="number"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Doctrine Readiness %</span>
          <input
            className="text-input"
            defaultValue={corp?.doctrineReadinessPercent ?? 0}
            max={100}
            min={0}
            name="doctrineReadinessPercent"
            type="number"
          />
        </label>
      </div>

      <label className="field-stack">
        <span className="field-label">Description</span>
        <textarea
          className="text-input"
          defaultValue={corp?.description}
          name="description"
          rows={3}
        />
      </label>

      <label className="field-stack">
        <span className="field-label">Announcements</span>
        <textarea
          className="text-input"
          defaultValue={corp?.announcements.join("\n") || ""}
          name="announcements"
          placeholder="One announcement per line"
          rows={4}
        />
      </label>

      <fieldset className="fieldset-panel">
        <legend className="field-label">EVE Identity Config</legend>
        <p className="card-copy">
          Sync enabled is stored for future ESI phases. No ESI calls are made yet.
        </p>
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">EVE Corporation ID</span>
            <input
              className="text-input"
              defaultValue={corp?.eveIdentityConfig?.eveCorporationId || ""}
              inputMode="numeric"
              name="eveCorporationId"
              pattern="[0-9]*"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">EVE Corporation Name</span>
            <input
              className="text-input"
              defaultValue={corp?.eveIdentityConfig?.eveCorporationName || ""}
              name="eveCorporationName"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">EVE Alliance ID</span>
            <input
              className="text-input"
              defaultValue={corp?.eveIdentityConfig?.eveAllianceId || ""}
              inputMode="numeric"
              name="eveAllianceId"
              pattern="[0-9]*"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">EVE Alliance Name</span>
            <input
              className="text-input"
              defaultValue={corp?.eveIdentityConfig?.eveAllianceName || ""}
              name="eveAllianceName"
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input
            defaultChecked={corp?.eveIdentityConfig?.syncEnabled || false}
            name="eveSyncEnabled"
            type="checkbox"
          />
          <span>Store sync enabled flag for a future ESI phase</span>
        </label>
      </fieldset>

      <fieldset className="fieldset-panel">
        <legend className="field-label">Enabled Modules</legend>
        <div className="checkbox-grid">
          {moduleOptions.map((module) => (
            <label className="checkbox-row" key={module.key}>
              <input
                defaultChecked={selectedModules[module.key]}
                name="enabledModules"
                type="checkbox"
                value={module.key}
              />
              <span>{module.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function formatNamedId(name: string, id: string | null) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
