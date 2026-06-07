import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          This route requires officer permissions that are not available for the
          current session.
        </p>
      </header>
      <div className="badge-row">
        <Link className="command-button" href="/">
          Alliance Hub
        </Link>
        <Link className="secondary-button" href="/login">
          Officer Login
        </Link>
      </div>
    </div>
  );
}
