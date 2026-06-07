import { OfficerRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/auth-actions";
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
    </div>
  );
}
