import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  linkEveIdentityAction,
  unlinkEveIdentityAction
} from "@/app/admin/eve-identities/actions";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  getEveIdentityAdminData,
  type EveIdentityAdminView,
  type EveIdentityOfficerOption
} from "@/lib/admin/eve-identities";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type EveIdentitiesPageProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function EveIdentitiesPage({
  searchParams
}: EveIdentitiesPageProps) {
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
      module: "EVE SSO",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/eve-identities",
      summary: "Non-super-admin officer attempted to view EVE identity links."
    });

    return <AccessDenied />;
  }

  let data;

  try {
    data = await getEveIdentityAdminData();
  } catch (error) {
    return (
      <div className="page-stack">
        <AdminHeader />
        <div className="error-state">
          {error instanceof Error
            ? `Could not load EVE identities: ${error.message}`
            : "Could not load EVE identities."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AdminHeader />
      <MessageBanner success={params?.success} error={params?.error} />

      <section className="section-stack" aria-labelledby="eve-link-policy-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="eve-link-policy-title">
              Link Policy
            </h2>
            <p className="card-copy">
              EVE SSO verifies character identity only. Officer access still
              depends on the linked Vyraj officer account, status, role,
              assignments, and permissions stored in Postgres.
            </p>
          </div>
          <span className="badge">One EVE identity per officer</span>
        </div>
      </section>

      {data.identities.length ? (
        <section className="section-stack" aria-label="EVE identities">
          {data.identities.map((identity) => (
            <EveIdentityCard
              identity={identity}
              key={identity.id}
              officers={data.officers}
            />
          ))}
        </section>
      ) : (
        <div className="empty-state">
          No EVE identities have logged in yet. Once a character completes EVE
          SSO, the verified identity will appear here for explicit linking.
        </div>
      )}
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="page-heading">
      <div className="eyebrow">Super Admin</div>
      <h1 className="page-title">EVE Identities / SSO Links</h1>
      <p className="page-copy">
        Review verified EVE SSO identities and explicitly link them to internal
        officer accounts. No ESI tokens are stored here.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href="/admin/super">
          Super Admin Console
        </Link>
        <Link className="secondary-button" href="/admin/officers">
          Officer Management
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
          Super Admin access is required to manage EVE identity links.
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

function EveIdentityCard({
  identity,
  officers
}: {
  identity: EveIdentityAdminView;
  officers: EveIdentityOfficerOption[];
}) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="card-title">{identity.characterName}</h2>
          <div className="card-subtitle">Character ID {identity.characterId}</div>
        </div>
        <div className="badge-row">
          <span className="badge">Identity Verified</span>
          <span
            className="health-badge"
            data-status={identity.linkedOfficer ? "OK" : "Warning"}
          >
            {identity.linkedOfficer ? "Officer Linked" : "Not Linked"}
          </span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric
          label="Linked Officer"
          value={identity.linkedOfficer?.officerName || "Not linked"}
        />
        <Metric
          label="Officer Status"
          value={identity.linkedOfficer?.status || "No officer link"}
        />
        <Metric
          label="Last EVE Login"
          value={
            identity.lastEveLoginAt
              ? formatDateTime(identity.lastEveLoginAt)
              : "Never"
          }
        />
        <Metric
          label="Linked At"
          value={identity.linkedAt ? formatDateTime(identity.linkedAt) : "Not linked"}
        />
      </div>

      <div className="metric-grid">
        <Metric
          label="Corporation"
          value={formatNamedId(identity.corporationName, identity.corporationId)}
        />
        <Metric
          label="Alliance"
          value={formatNamedId(identity.allianceName, identity.allianceId)}
        />
        <Metric
          label="Matched Vyraj Corp"
          value={
            identity.memberCorp
              ? `${identity.memberCorp.name} [${identity.memberCorp.ticker}]`
              : "No configured match"
          }
        />
        <Metric label="Created" value={formatDateTime(identity.createdAt)} />
        <Metric label="Updated" value={formatDateTime(identity.updatedAt)} />
      </div>

      <details className="details-panel">
        <summary className="details-summary">Manage Officer Link</summary>
        <div className="action-grid">
          <form action={linkEveIdentityAction} className="action-panel">
            <input name="eveIdentityId" type="hidden" value={identity.id} />
            <div className="card-heading">
              <h3 className="card-title">Link to Officer</h3>
              <p className="card-copy">
                Linking enables EVE SSO login only when the selected officer is
                active. Permissions are still managed separately.
              </p>
            </div>
            <label className="field-stack">
              <span className="field-label">Officer</span>
              <select
                className="text-input"
                defaultValue={identity.linkedOfficer?.id || ""}
                name="officerId"
                required
              >
                <option value="">Select officer</option>
                {officers.map((officer) => (
                  <option key={officer.id} value={officer.id}>
                    {officer.officerName} - {officer.role} / {officer.status}
                  </option>
                ))}
              </select>
            </label>
            <button className="command-button" type="submit">
              Link Identity
            </button>
          </form>

          <form action={unlinkEveIdentityAction} className="action-panel">
            <input name="eveIdentityId" type="hidden" value={identity.id} />
            <div className="card-heading">
              <h3 className="card-title">Unlink Identity</h3>
              <p className="card-copy">
                Clears the officer link and linked timestamp. The verified EVE
                identity record remains for audit and future relinking.
              </p>
            </div>
            <button
              className="danger-button"
              disabled={!identity.linkedOfficer}
              type="submit"
            >
              Unlink Identity
            </button>
          </form>
        </div>
      </details>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
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
