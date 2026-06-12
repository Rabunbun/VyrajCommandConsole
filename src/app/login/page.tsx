import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { loginAction, logoutAction } from "@/app/auth-actions";
import { getEveSsoConfigStatus } from "@/lib/eve-sso/config";
import { getMemberLandingContext, getOfficerDestination } from "@/lib/member-landing";
import { getCurrentOfficerSession } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    loggedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentOfficerSession();
  const memberContext = await getMemberLandingContext();
  const params = await searchParams;
  const eveSso = getEveSsoConfigStatus();

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
            <Link className="command-button" href="/">
              Continue to Alliance Hub
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
        <h1 className="page-title">Officer Login</h1>
        <p className="page-copy">
          Unlock officer-only v2 routes with a server-side session stored in an
          HTTP-only cookie.
        </p>
      </header>

      {params.error ? <div className="error-state">{params.error}</div> : null}
      {params.loggedOut ? (
        <div className="empty-state">Session locked.</div>
      ) : null}

      <form action={loginAction} className="form-panel">
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
        <button className="command-button" type="submit">
          Login
        </button>
      </form>

      <section className="form-panel" aria-labelledby="eve-sso-login-title">
        <div className="card-heading">
          <h2 className="section-title" id="eve-sso-login-title">
            EVE SSO
          </h2>
          <p className="card-copy">
            Use EVE SSO for member portal access or linked officer login.
            Internal Vyraj permissions still control command access.
          </p>
        </div>
        {eveSso.eveLoginEnabled ? (
          <Link className="command-button" href="/api/auth/eve/start">
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
      </section>
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
