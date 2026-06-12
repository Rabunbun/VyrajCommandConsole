import Link from "next/link";
import { getUnlinkedIdentityFromCookie } from "@/lib/eve-sso/oauth";

export const dynamic = "force-dynamic";

export default async function UnlinkedEveIdentityPage() {
  const identity = await getUnlinkedIdentityFromCookie();
  const hasInactiveOfficerLink = Boolean(identity?.officer);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">EVE SSO</div>
        <h1 className="page-title">Identity Verified</h1>
        <p className="page-copy">
          EVE SSO verified your character identity. Internal Vyraj permissions
          still control officer and admin access.
        </p>
        <div className="badge-row">
          <Link className="command-button" href="/member">
            Member Checkpoint
          </Link>
          <Link className="command-button" href="/">
            Alliance Hub
          </Link>
          <Link className="secondary-button" href="/login">
            Officer Login
          </Link>
        </div>
      </header>

      <section className="form-panel" aria-labelledby="eve-identity-status-title">
        <div className="card-heading">
          <h2 className="section-title" id="eve-identity-status-title">
            EVE Identity Status
          </h2>
          <p className="card-copy">
            {identity?.characterName
              ? `${identity.characterName} is verified.`
              : "EVE identity was verified, but this status link has expired."}
          </p>
        </div>
        <div className="status-grid">
          <div className="status-panel">
            <div className="status-label">Identity</div>
            <div className="status-value">Verified</div>
          </div>
          <div className="status-panel">
            <div className="status-label">Character</div>
            <div className="status-value">
              {identity?.characterName || "Verified character"}
            </div>
          </div>
          <div className="status-panel">
            <div className="status-label">Officer Link</div>
            <div className="status-value">No Active Link</div>
          </div>
          <div className="status-panel">
            <div className="status-label">Current Corp</div>
            <div className="status-value">
              {identity
                ? formatNamedId(identity.corporationName, identity.corporationId?.toString() ?? null)
                : "Unknown"}
            </div>
          </div>
          <div className="status-panel">
            <div className="status-label">Current Alliance</div>
            <div className="status-value">
              {identity
                ? formatNamedId(identity.allianceName, identity.allianceId?.toString() ?? null)
                : "Unknown"}
            </div>
          </div>
          <div className="status-panel">
            <div className="status-label">Matched Vyraj Corp</div>
            <div className="status-value">
              {identity?.memberCorp
                ? `${identity.memberCorp.name} [${identity.memberCorp.ticker}]`
                : "No configured match"}
            </div>
          </div>
          <div className="status-panel">
            <div className="status-label">Identity Refreshed</div>
            <div className="status-value">
              {identity?.lastIdentityRefreshAt
                ? formatDateTime(identity.lastIdentityRefreshAt)
                : "Unknown"}
            </div>
          </div>
        </div>
        <div className="empty-state">
          {hasInactiveOfficerLink
            ? "This EVE character is not linked to an active Vyraj officer account. Ask a Super Admin to review the officer link if access is required."
            : "No Vyraj officer account is linked to this EVE character yet. Use the Member Checkpoint for corp portal guidance, or ask a Super Admin to link this character if officer access is required."}
        </div>
      </section>
    </div>
  );
}

function formatNamedId(name: string, id: string | null) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(value);
}
