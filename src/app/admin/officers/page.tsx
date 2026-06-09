import { OfficerRole, OfficerStatus } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createOfficerAction,
  deleteOfficerAction,
  resetOfficerPasswordAction,
  setOfficerStatusAction,
  updateOfficerAction
} from "@/app/admin/officers/actions";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  getOfficerManagementData,
  type AdminCorpOption,
  type AdminOfficerView
} from "@/lib/admin/officers";
import type { OfficerPermissionOption } from "@/lib/permissions";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type OfficerManagementPageProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function OfficerManagementPage({
  searchParams
}: OfficerManagementPageProps) {
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
      module: "Officer Management",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/officers",
      summary: "Non-super-admin officer attempted to view Officer Management."
    });

    return <AccessDenied />;
  }

  let data;

  try {
    data = await getOfficerManagementData();
  } catch (error) {
    return (
      <div className="page-stack">
        <AdminHeader />
        <div className="error-state">
          {error instanceof Error
            ? `Could not load officer accounts: ${error.message}`
            : "Could not load officer accounts."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AdminHeader />
      <MessageBanner success={params?.success} error={params?.error} />

      <CreateOfficerPanel
        corps={data.corps}
        permissionOptions={data.permissionOptions}
      />

      {data.officers.length ? (
        <section className="section-stack" aria-label="Officer accounts">
          {data.officers.map((officer) => (
            <OfficerCard
              corps={data.corps}
              currentOfficerId={session.officer.id}
              officer={officer}
              key={officer.id}
              permissionOptions={data.permissionOptions}
            />
          ))}
        </section>
      ) : (
        <div className="empty-state">No officer accounts found.</div>
      )}
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="page-heading">
      <div className="eyebrow">Super Admin</div>
      <h1 className="page-title">Officer Management</h1>
      <p className="page-copy">
        Create officer accounts, manage role and status, and assign corps or
        permissions from Postgres-backed records.
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
          Super Admin access is required to view Officer Management.
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

function CreateOfficerPanel({
  corps,
  permissionOptions
}: {
  corps: AdminCorpOption[];
  permissionOptions: readonly OfficerPermissionOption[];
}) {
  return (
    <details className="create-disclosure form-panel form-panel-wide" aria-label="Create officer">
      <summary className="create-summary">
        <span className="command-button">Create Officer</span>
      </summary>
      <div className="card-heading">
        <h2 className="section-title">Create Officer</h2>
        <p className="card-copy">
          Temporary passwords are hashed server-side and are never shown again.
        </p>
      </div>

      <form action={createOfficerAction} className="section-stack">
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Officer Name</span>
            <input
              autoComplete="off"
              className="text-input"
              name="officerName"
              required
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Temporary Password</span>
            <input
              autoComplete="new-password"
              className="text-input"
              minLength={12}
              name="temporaryPassword"
              required
              type="password"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Role</span>
            <select
              className="text-input"
              defaultValue={OfficerRole.ALLIANCE_OFFICER}
              name="role"
            >
              <option value={OfficerRole.ALLIANCE_OFFICER}>Alliance Officer</option>
              <option value={OfficerRole.SUPER_ADMIN}>Super Admin</option>
            </select>
          </label>

          <label className="field-stack">
            <span className="field-label">Status</span>
            <select className="text-input" defaultValue="ACTIVE" name="status">
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </label>
        </div>

        <AssignmentChecklist corps={corps} selectedCorpIds={[]} />
        <PermissionChecklist
          permissionOptions={permissionOptions}
          selectedPermissionKeys={[]}
        />

        <div className="badge-row">
          <button className="command-button" type="submit">
            Create Officer
          </button>
        </div>
      </form>
    </details>
  );
}

function OfficerCard({
  corps,
  currentOfficerId,
  officer,
  permissionOptions
}: {
  corps: AdminCorpOption[];
  currentOfficerId: string;
  officer: AdminOfficerView;
  permissionOptions: readonly OfficerPermissionOption[];
}) {
  const assignedCorpIds = officer.assignedCorps.map((corp) => corp.id);
  const isCurrentOfficer = officer.id === currentOfficerId;

  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="card-title">{officer.officerName}</h2>
          <div className="card-subtitle">{officer.role}</div>
        </div>
        <div className="badge-row">
          <span className="badge">{officer.status}</span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Created" value={formatDateTime(officer.createdAt)} />
        <Metric
          label="Last Login"
          value={officer.lastLoginAt ? formatDateTime(officer.lastLoginAt) : "Never"}
        />
      </div>

      <div className="section-stack">
        <h3 className="section-title">EVE SSO Link</h3>
        {officer.eveIdentities.length ? (
          <div className="section-stack">
            {officer.eveIdentities.map((identity) => (
              <div className="metric-grid" key={identity.id}>
                <Metric label="Character" value={identity.characterName} />
                <Metric label="Character ID" value={identity.characterId} />
                <Metric
                  label="Linked At"
                  value={
                    identity.linkedAt ? formatDateTime(identity.linkedAt) : "Not linked"
                  }
                />
                <Metric
                  label="Last EVE Login"
                  value={
                    identity.lastEveLoginAt
                      ? formatDateTime(identity.lastEveLoginAt)
                      : "Never"
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="card-copy">
            Not linked. Use EVE Identities / SSO Links to connect a verified
            character to this officer.
          </p>
        )}
      </div>

      <div className="section-stack">
        <h3 className="section-title">Assigned Corps</h3>
        {officer.role === OfficerRole.SUPER_ADMIN ? (
          <div className="section-stack">
            <div className="badge-row">
              <span className="badge">All Corps via SUPER_ADMIN role</span>
            </div>
            {officer.assignedCorps.length ? (
              <p className="card-copy">
                Explicit assignments retained: {formatCorpList(officer.assignedCorps)}
              </p>
            ) : null}
          </div>
        ) : officer.assignedCorps.length ? (
          <div className="badge-row">
            {officer.assignedCorps.map((corp) => (
              <span className="badge" key={corp.id}>
                {corp.name} [{corp.ticker}]
              </span>
            ))}
          </div>
        ) : (
          <p className="card-copy">No assigned corps</p>
        )}
      </div>

      <div className="section-stack">
        <h3 className="section-title">Permissions</h3>
        {officer.role === OfficerRole.SUPER_ADMIN ? (
          <p className="card-copy">All permissions via SUPER_ADMIN role</p>
        ) : (
          <PermissionSummary officer={officer} />
        )}
      </div>

      <details className="details-panel">
        <summary className="details-summary">Edit Officer</summary>
        <form action={updateOfficerAction} className="section-stack">
          <input name="officerId" type="hidden" value={officer.id} />

          <div className="form-grid">
            <label className="field-stack">
              <span className="field-label">Role</span>
              <select className="text-input" defaultValue={officer.role} name="role">
                <option value={OfficerRole.ALLIANCE_OFFICER}>Alliance Officer</option>
                <option value={OfficerRole.SUPER_ADMIN}>Super Admin</option>
              </select>
            </label>

            <label className="field-stack">
              <span className="field-label">Status</span>
              <select className="text-input" defaultValue={officer.status} name="status">
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
          </div>

          <AssignmentChecklist corps={corps} selectedCorpIds={assignedCorpIds} />
          <PermissionChecklist
            permissionOptions={permissionOptions}
            selectedPermissionKeys={officer.globalPermissions}
          />

          {officer.corpPermissions.length ? (
            <p className="card-copy">
              Corp-scoped permissions are displayed above and preserved here;
              this pass edits global permissions only.
            </p>
          ) : null}

          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Officer
            </button>
          </div>
        </form>
      </details>

      <details className="details-panel">
        <summary className="details-summary">Account Controls</summary>
        <div className="action-grid">
          <form action={setOfficerStatusAction} className="action-panel">
            <input name="officerId" type="hidden" value={officer.id} />
            <input
              name="status"
              type="hidden"
              value={
                officer.status === OfficerStatus.ACTIVE
                  ? OfficerStatus.DISABLED
                  : OfficerStatus.ACTIVE
              }
            />
            <div className="card-heading">
              <h3 className="card-title">
                {officer.status === OfficerStatus.ACTIVE
                  ? "Disable Officer"
                  : "Enable Officer"}
              </h3>
              <p className="card-copy">
                {officer.status === OfficerStatus.ACTIVE
                  ? "Disabling blocks login and revokes active sessions."
                  : "Enabling restores login access with the current password."}
              </p>
            </div>
            <button
              className={
                officer.status === OfficerStatus.ACTIVE
                  ? "danger-button"
                  : "secondary-button"
              }
              type="submit"
            >
              {officer.status === OfficerStatus.ACTIVE ? "Disable" : "Enable"}
            </button>
          </form>

          <form action={resetOfficerPasswordAction} className="action-panel">
            <input name="officerId" type="hidden" value={officer.id} />
            <div className="card-heading">
              <h3 className="card-title">Reset Password</h3>
              <p className="card-copy">
                The new temporary password is hashed server-side and active
                sessions are revoked.
              </p>
            </div>
            <label className="field-stack">
              <span className="field-label">New Temporary Password</span>
              <input
                autoComplete="new-password"
                className="text-input"
                minLength={12}
                name="temporaryPassword"
                required
                type="password"
              />
            </label>
            <button className="secondary-button" type="submit">
              Reset Password
            </button>
          </form>

          <form action={deleteOfficerAction} className="action-panel danger-panel">
            <input name="officerId" type="hidden" value={officer.id} />
            <div className="card-heading">
              <h3 className="card-title">Delete Officer</h3>
              <p className="card-copy">
                Permanent deletion removes this officer account plus its sessions,
                permissions, and corp assignments. Linked EVE identities must be
                unlinked first. Audit logs are preserved.
              </p>
            </div>
            {isCurrentOfficer ? (
              <div className="error-state">
                Self-delete is blocked for the currently logged-in Super Admin.
              </div>
            ) : null}
            {officer.eveIdentities.length ? (
              <div className="error-state">
                This officer has a linked EVE identity. Unlink it from EVE
                Identities / SSO Links before deleting this account.
              </div>
            ) : null}
            <label className="field-stack">
              <span className="field-label">Type officer name to confirm</span>
              <input
                autoComplete="off"
                className="text-input"
                name="deleteConfirmation"
                placeholder={officer.officerName}
                required
              />
            </label>
            <button className="danger-button" type="submit">
              Delete Officer
            </button>
          </form>
        </div>
      </details>
    </article>
  );
}

function PermissionSummary({ officer }: { officer: AdminOfficerView }) {
  const hasPermissions =
    officer.globalPermissions.length || officer.corpPermissions.length;

  if (!hasPermissions) {
    return <p className="card-copy">No explicit permissions</p>;
  }

  return (
    <div className="section-stack">
      {officer.globalPermissions.length ? (
        <div className="section-stack">
          <div className="status-label">Global</div>
          <div className="badge-row">
            {officer.globalPermissions.map((permission) => (
              <span className="badge" key={permission}>
                {permission}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {officer.corpPermissions.length ? (
        <div className="section-stack">
          <div className="status-label">Corp Scoped</div>
          <div className="badge-row">
            {officer.corpPermissions.map((permission) => (
              <span
                className="badge"
                key={`${permission.permissionKey}-${permission.corp?.id || "unknown"}`}
              >
                {permission.permissionKey}
                {permission.corp
                  ? ` - ${permission.corp.name} [${permission.corp.ticker}]`
                  : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssignmentChecklist({
  corps,
  selectedCorpIds
}: {
  corps: AdminCorpOption[];
  selectedCorpIds: string[];
}) {
  return (
    <fieldset className="fieldset-panel">
      <legend className="field-label">Assigned Corps</legend>
      {corps.length ? (
        <div className="checkbox-grid">
          {corps.map((corp) => (
            <label className="checkbox-row" key={corp.id}>
              <input
                defaultChecked={selectedCorpIds.includes(corp.id)}
                name="assignedCorpIds"
                type="checkbox"
                value={corp.id}
              />
              <span>
                {corp.name} [{corp.ticker}]
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="card-copy">No corps available for assignment.</p>
      )}
    </fieldset>
  );
}

function PermissionChecklist({
  permissionOptions,
  selectedPermissionKeys
}: {
  permissionOptions: readonly OfficerPermissionOption[];
  selectedPermissionKeys: string[];
}) {
  return (
    <fieldset className="fieldset-panel">
      <legend className="field-label">Global Permissions</legend>
      <div className="checkbox-grid">
        {permissionOptions.map((permission) => (
          <label className="checkbox-row" key={permission.key}>
            <input
              defaultChecked={selectedPermissionKeys.includes(permission.key)}
              name="permissionKeys"
              type="checkbox"
              value={permission.key}
            />
            <span>{permission.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCorpList(corps: AdminOfficerView["assignedCorps"]) {
  return corps.map((corp) => `${corp.name} [${corp.ticker}]`).join(", ");
}
