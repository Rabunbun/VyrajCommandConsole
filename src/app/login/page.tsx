import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { loginAction, logoutAction } from "@/app/auth-actions";
import { getEveSsoConfigStatus } from "@/lib/eve-sso/config";
import { getMemberLandingContext, getOfficerDestination } from "@/lib/member-landing";
import {
  resolveVerifiedMemberReturnTo,
  sanitizeProtectedReturnTo
} from "@/lib/route-policy";
import { getCurrentOfficerSession } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    loggedOut?: string;
    returnTo?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentOfficerSession();
  const memberContext = await getMemberLandingContext();
  const params = await searchParams;
  const eveSso = getEveSsoConfigStatus();
  const returnTo = sanitizeProtectedReturnTo(params.returnTo);
  const eveLoginHref = returnTo
    ? `/api/auth/eve/start?returnTo=${encodeURIComponent(returnTo)}`
    : "/api/auth/eve/start";

  if (session) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Access</div>
          <h1 className="page-title">Session Active</h1>
          <p className="page-copy">
            You are already signed in with a Vyraj officer session.
          </p>
        </header>
        <section className="form-panel" aria-labelledby="officer-session-title">
          <div className="card-heading">
            <h2 className="section-title" id="officer-session-title">
              {session.officer.officerName}
            </h2>
            <p className="card-copy">
              {session.officer.role === OfficerRole.SUPER_ADMIN
                ? "Super Admin command access is active."
                : "Officer command access is active."}
            </p>
          </div>
          <div className="badge-row">
            <Link className="command-button" href={getOfficerDestination(session)}>
              Continue
            </Link>
            <form action={logoutAction}>
              <button className="secondary-button" type="submit">
                Log Out
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  if (memberContext.accessMode === "verified_member" && memberContext.identity) {
    const authorizedReturnTo = await resolveVerifiedMemberReturnTo({
      returnTo,
      corporationId: memberContext.identity.corporationId
        ? BigInt(memberContext.identity.corporationId)
        : null
    });

    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Access</div>
          <h1 className="page-title">EVE Identity Active</h1>
          <p className="page-copy">
            This browser is signed in as a verified EVE character. Officer
            access is not active unless an officer session is unlocked.
          </p>
        </header>

        {params.loggedOut ? (
          <div className="empty-state">Previous session locked.</div>
        ) : null}

        <section className="form-panel" aria-labelledby="member-session-title">
          <div className="card-heading">
            <h2 className="section-title" id="member-session-title">
              {memberContext.identity.characterName}
            </h2>
            <p className="card-copy">
              Verified EVE member context is active. Log out before switching
              EVE characters.
            </p>
          </div>
          <div className="status-grid">
            <LoginStatusPanel
              label="Current Corp"
              value={formatNamedId(
                memberContext.identity.corporationName,
                memberContext.identity.corporationId
              )}
            />
            <LoginStatusPanel
              label="Matched Portal"
              value={memberContext.matchedCorp?.name || "No configured match"}
            />
          </div>
          <div className="badge-row">
            <Link className="command-button" href={authorizedReturnTo || "/"}>
              {authorizedReturnTo ? "Continue to Requested Module" : "Continue to Alliance Hub"}
            </Link>
            <Link className="secondary-button" href="/member">
              Member Checkpoint
            </Link>
            <form action={logoutAction}>
              <button className="secondary-button" type="submit">
                Log Out
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Login</h1>
        <p className="page-copy">
          EVE SSO is the primary login path for verified members and linked
          officers. Manual officer login remains available as fallback access.
        </p>
      </header>

      {params.error ? <div className="error-state">{params.error}</div> : null}
      {params.loggedOut ? (
        <div className="empty-state">Session locked.</div>
      ) : null}

      <section className="form-panel form-panel-wide primary-login-panel" aria-labelledby="eve-sso-login-title">
        <div className="card-heading">
          <h2 className="section-title" id="eve-sso-login-title">
            Login with EVE Online
          </h2>
          <p className="card-copy">
            Use EVE SSO for member portal access or linked officer access.
            Internal Vyraj permissions still control command tools.
          </p>
        </div>
        {eveSso.eveLoginEnabled ? (
          <Link className="command-button" href={eveLoginHref}>
            Login with EVE
          </Link>
        ) : (
          <button className="secondary-button" disabled type="button">
            Login with EVE
          </button>
        )}
        <div className="empty-state">
          {eveSso.eveLoginEnabled
            ? "EVE SSO is configured. Verified members land at the identity checkpoint; linked officers unlock their normal Vyraj session."
            : `EVE SSO not configured. Missing: ${eveSso.missingVariables.join(", ")}.`}
        </div>
        <div className="badge-row">
          <Link className="secondary-button" href="/join">
            Join Us
          </Link>
          <Link className="secondary-button" href="/">
            Alliance Hub
          </Link>
        </div>
      </section>

      <details className="create-disclosure form-panel form-panel-wide">
        <summary className="create-summary">
          <span className="secondary-button">Manual Officer Login</span>
        </summary>
        <div className="card-heading">
          <h2 className="section-title">Fallback Officer Login</h2>
          <p className="card-copy">
            Manual access is reserved for authorized officers when EVE SSO is
            unavailable or a Super Admin needs fallback command access.
          </p>
        </div>
        <form action={loginAction} className="section-stack">
          {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
          <div className="form-grid">
            <label className="field-stack">
              <span className="field-label">Officer Name</span>
              <input
                autoComplete="username"
                className="text-input"
                name="officerName"
                required
                type="text"
              />
            </label>
            <label className="field-stack">
              <span className="field-label">Password</span>
              <input
                autoComplete="current-password"
                className="text-input"
                name="password"
                required
                type="password"
              />
            </label>
          </div>
          <div className="badge-row">
            <button className="secondary-button" type="submit">
              Manual Officer Login
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function LoginStatusPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-panel">
      <div className="status-label">{label}</div>
      <div className="status-value">{value}</div>
    </div>
  );
}

function formatNamedId(name: string, id: string) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}
