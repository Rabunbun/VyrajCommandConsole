import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import type { CorpPortalAccessContext } from "@/lib/corp-portal-access";
import { sanitizeProtectedReturnTo } from "@/lib/route-policy";

export function CorpAccessDenied({
  access,
  moduleName = "Corp Portal",
  returnTo = ""
}: {
  access: CorpPortalAccessContext;
  moduleName?: string;
  returnTo?: string;
}) {
  const identity = access.identity;
  const corp = access.corp;
  const hasActiveContext = Boolean(identity || access.session);
  const safeReturnTo = sanitizeProtectedReturnTo(returnTo);
  const eveLoginHref = safeReturnTo
    ? `/api/auth/eve/start?returnTo=${encodeURIComponent(safeReturnTo)}`
    : "/api/auth/eve/start";

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Hard Lockdown</div>
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
          <span className="badge" data-state="ACCESS_RESTRICTED">
            Access Restricted
          </span>
        </div>
        <p className="card-copy">{access.reason}</p>
        <div className="audit-meta-grid">
          <Metric label="Target Module" value={moduleName} />
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
        {!hasActiveContext ? (
          <Link className="command-button" href={eveLoginHref}>
            Login with EVE
          </Link>
        ) : null}
        {access.loginRequired ? (
          <Link className="secondary-button" href="/login">
            Login Options
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
        {hasActiveContext ? (
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              {identity ? "Logout / Switch Character" : "Log Out"}
            </button>
          </form>
        ) : null}
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
