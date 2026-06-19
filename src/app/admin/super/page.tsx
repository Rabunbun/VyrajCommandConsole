import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import {
  ModuleTile,
  type ModuleIconName
} from "@/components/module-visuals";
import { logOfficerAudit } from "@/lib/audit";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const adminCards = [
  {
    icon: "officers" as ModuleIconName,
    title: "Officer Management",
    href: "/admin/officers",
    status: "Active",
    summary: "Manage officer accounts, assigned corps, permissions, and access."
  },
  {
    icon: "corp" as ModuleIconName,
    title: "Corp Management",
    href: "/admin/corps",
    status: "Active",
    summary: "Manage corp registry records, portal announcements, and modules."
  },
  {
    icon: "dashboard" as ModuleIconName,
    title: "Alliance Hub Editor",
    href: "/admin/alliance-hub",
    status: "Active",
    summary: "Create and manage audience-scoped alliance hub content."
  },
  {
    icon: "audit" as ModuleIconName,
    title: "Audit Log",
    href: "/admin/audit-log",
    status: "Active",
    summary: "Review officer/admin actions with safe redacted details."
  },
  {
    icon: "identity" as ModuleIconName,
    title: "EVE Identities / SSO Links",
    href: "/admin/eve-identities",
    status: "Active",
    summary: "Link verified EVE characters to internal officer accounts."
  },
  {
    icon: "lock" as ModuleIconName,
    title: "Access Policy Preview",
    href: "/admin/access-policy",
    status: "Active",
    summary: "Review active Hard Lockdown member matching and corp readiness."
  },
  {
    icon: "health" as ModuleIconName,
    title: "System Health",
    href: "/admin/system-health",
    status: "Active",
    summary: "Review deployment configuration, database health, counts, and recent audit heartbeat."
  }
];

export default async function SuperAdminPage() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Auth",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/super",
      summary: "Non-super-admin officer attempted to access Super Admin Console."
    });

    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Access</div>
          <h1 className="page-title">Access Denied</h1>
          <p className="page-copy">
            Super Admin access is required for this console.
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

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Vyraj Alliance Command Console</div>
        <h1 className="page-title">Super Admin Console</h1>
        <p className="page-copy">
          Central landing page for alliance administration, officer access,
          corp registry, hub content, and audit review.
        </p>
        <div className="badge-row">
          <Link className="secondary-button" href="/">
            Back to Alliance Hub
          </Link>
          <span className="badge" data-state="SUPER_ADMIN">Root</span>
          <span className="badge" data-state="SUPER_ADMIN">Super Admin</span>
        </div>
      </header>

      <section className="section-stack" aria-labelledby="system-snapshot-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="system-snapshot-title">
              System Snapshot
            </h2>
            <p className="card-copy">
              Current authenticated root session state.
            </p>
          </div>
        </div>
        <div className="status-grid" aria-label="Current officer session">
        <div className="status-panel">
          <div className="status-label">Officer</div>
          <div className="status-value">{session.officer.officerName}</div>
        </div>
        <div className="status-panel">
          <div className="status-label">Role</div>
          <div className="status-value">{session.officer.role}</div>
        </div>
        <div className="status-panel">
          <div className="status-label">Session Expires</div>
          <div className="status-value">
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(session.expiresAt))}
          </div>
        </div>
        </div>
      </section>

      <section className="section-stack" aria-labelledby="admin-tools-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="admin-tools-title">
              Admin Tools
            </h2>
            <p className="card-copy">Open existing Super Admin pages from one place.</p>
          </div>
        </div>
        <div className="module-tile-grid">
          {adminCards.map((card) => (
            <ModuleTile
              actionLabel="Open Tool"
              description={card.summary}
              href={card.href}
              icon={card.icon}
              key={card.href}
              status={{ label: card.status, tone: "ready" }}
              subtitle="Super Admin"
              title={card.title}
            />
          ))}
        </div>
      </section>

      <form action={logoutAction}>
        <button className="secondary-button" type="submit">
          Logout
        </button>
      </form>
    </div>
  );
}
