import { OfficerRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth-actions";
import { getEveSsoConfigStatus } from "@/lib/eve-sso/config";
import { getCurrentOfficerSession } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    loggedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentOfficerSession();
  const params = await searchParams;
  const eveSso = getEveSsoConfigStatus();

  if (session?.officer.role === OfficerRole.SUPER_ADMIN) {
    redirect("/admin/super");
  }

  if (session) {
    redirect("/");
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
        <div className="empty-state">Officer session locked.</div>
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
            EVE SSO will verify character identity. Internal Vyraj permissions
            still control access.
          </p>
        </div>
        <button className="secondary-button" disabled type="button">
          Login with EVE
        </button>
        <div className="empty-state">
          {eveSso.configured
            ? "EVE SSO configuration detected. OAuth login is coming soon and is not active in this phase."
            : `EVE SSO not configured yet. Missing: ${eveSso.missingVariables.join(", ")}.`}
        </div>
      </section>
    </div>
  );
}
