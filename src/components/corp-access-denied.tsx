import Link from "next/link";
import type { CorpPortalAccessContext } from "@/lib/corp-portal-access";

export function CorpAccessDenied({
  access,
  moduleName = "Corp Portal"
}: {
  access: CorpPortalAccessContext;
  moduleName?: string;
}) {
  const identity = access.identity;
  const corp = access.corp;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Soft Lockdown</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          {moduleName} access is evaluated server-side from officer permissions
          or verified EVE corporation membership.
        </p>
      </header>

      <section className="data-card" aria-labelledby="access-denied-title">
        <div className="card-heading">
          <h2 className="card-title" id="access-denied-title">
            Access Check
          </h2>
          <span className="badge">Denied</span>
        </div>
        <p className="card-copy">{access.reason}</p>
        <div className="audit-meta-grid">
          <Metric label="Target Portal" value={corp?.name || "Unknown"} />
          <Metric
            label="Target EVE Corp"
            value={
              corp?.eveIdentityConfig?.eveCorporationId
                ? `${corp.eveIdentityConfig.eveCorporationName || corp.name} / ${corp.eveIdentityConfig.eveCorporationId.toString()}`
                : "Not configured"
            }
          />
          <Metric
            label="Verified Character"
            value={identity ? identity.characterName : "Not signed in with EVE"}
          />
          <Metric
            label="Current EVE Corp"
            value={
              identity?.corporationId
                ? `${identity.corporationName || "Unknown"} / ${identity.corporationId.toString()}`
                : "Unknown"
            }
          />
          <Metric
            label="Current Alliance"
            value={
              identity?.allianceId
                ? `${identity.allianceName || "Unknown"} / ${identity.allianceId.toString()}`
                : "Unknown"
            }
          />
          <Metric
            label="Matched Vyraj Portal"
            value={access.matchedCorp?.name || identity?.memberCorp?.name || "None"}
          />
        </div>
      </section>

      <div className="badge-row">
        {access.loginRequired ? (
          <Link className="command-button" href="/login">
            Login
          </Link>
        ) : null}
        <Link className="secondary-button" href="/member">
          Member Checkpoint
        </Link>
        <Link className="secondary-button" href="/join">
          Join Us
        </Link>
        <Link className="secondary-button" href="/">
          Alliance Hub
        </Link>
      </div>
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
