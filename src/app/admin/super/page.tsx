import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const adminCards = [
  {
    code: "ADM",
    title: "Officer Management",
    href: "/admin/officers",
    status: "Active",
    summary: "Manage officer accounts, assigned corps, permissions, and access."
  },
  {
    code: "CORP",
    title: "Corp Management",
    href: "/admin/corps",
    status: "Active",
    summary: "Manage corp registry records, portal announcements, and modules."
  },
  {
    code: "HUB",
    title: "Alliance Hub Editor",
    href: "/admin/alliance-hub",
    status: "Active",
    summary: "Create and manage audience-scoped alliance hub content."
  },
  {
    code: "LOG",
    title: "Audit Log",
    href: "/admin/audit-log",
    status: "Active",
    summary: "Review officer/admin actions with safe redacted details."
  },
  {
    code: "SYS",
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
          <span className="badge">Root</span>
          <span className="badge">Super Admin</span>
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
        <div className="data-grid">
          {adminCards.map((card) => (
            <Link className="data-card" href={card.href} key={card.href}>
              <div className="tool-code" aria-hidden="true">
                {card.code}
              </div>
              <div className="card-heading">
                <h3 className="card-title">{card.title}</h3>
                <div className="card-subtitle">{card.status}</div>
              </div>
              <p className="card-copy">{card.summary}</p>
              <span className="command-button">Open Tool</span>
            </Link>
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
