import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { logoutAction } from "@/app/auth-actions";
import { consoleRoutes, routeGroups, type ConsoleRoute } from "@/lib/navigation";
import { hasPermission } from "@/lib/permissions";
import { getCurrentOfficerSession, isSuperAdminSession } from "@/lib/session";

export const metadata: Metadata = {
  title: {
    default: "Vyraj Alliance Command Console",
    template: "%s | Vyraj Alliance Command Console"
  },
  description: "Vercel v2 foundation for the Vyraj Alliance Command Console."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentOfficerSession();
  const visibleRoutes = getVisibleConsoleRoutes(session);

  return (
    <html lang="en">
      <body>
        <div className="console-shell">
          <header className="console-topbar" aria-label="Command navigation">
            <div className="console-topbar-inner">
              <div className="console-nav-block">
                <Link className="console-brand" href="/">
                  <span className="console-brand-kicker">Vyraj Alliance</span>
                  <span className="console-brand-title">Command Console</span>
                </Link>
                <nav className="console-nav" aria-label="Primary navigation">
                  {routeGroups.map((group) => {
                    const routes = visibleRoutes.filter((route) => route.group === group);

                    if (!routes.length) {
                      return null;
                    }

                    return (
                      <div className="nav-group" key={group}>
                        <div className="nav-group-title">{group}</div>
                        <div className="nav-link-row">
                          {routes.map((route) => (
                            <Link
                              className="nav-link"
                              href={route.href}
                              key={route.href}
                            >
                              {route.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </nav>
              </div>
              <AllianceAccessPanel session={session} />
            </div>
          </header>
          <main className="console-main">{children}</main>
        </div>
      </body>
    </html>
  );
}

function getVisibleConsoleRoutes(
  session: Awaited<ReturnType<typeof getCurrentOfficerSession>>
): ConsoleRoute[] {
  const isSuperAdmin = isSuperAdminSession(session);

  return consoleRoutes.filter((route) => {
    if (route.group === "Admin") {
      if (route.superAdminOnly) {
        return isSuperAdmin;
      }

      return (
        isSuperAdmin ||
        Boolean(
          route.permissions?.some((permission) =>
            hasPermission(session, permission)
          )
        )
      );
    }

    if (route.href === "/login" && session) {
      return false;
    }

    return true;
  });
}

function AllianceAccessPanel({
  session
}: {
  session: Awaited<ReturnType<typeof getCurrentOfficerSession>>;
}) {
  const unlocked = Boolean(session);
  const roleLabel = session
    ? isSuperAdminSession(session)
      ? "Alliance Admin / Super Admin"
      : "Alliance Officer"
    : "No role active";

  return (
    <aside className="alliance-access-panel" aria-label="Alliance access">
      <div className="access-indicator" aria-hidden="true" data-unlocked={unlocked} />
      <div className="access-label">Alliance Access</div>
      <div className="access-name">
        {session ? session.officer.officerName : "Member Access"}
      </div>
      <div className="access-detail">{roleLabel}</div>
      <div className="access-detail">
        {session ? "Command controls unlocked" : "Command controls locked"}
      </div>
      {session ? (
        <form action={logoutAction}>
          <button className="secondary-button access-button" type="submit">
            Lock
          </button>
        </form>
      ) : (
        <Link className="command-button access-button" href="/login">
          Unlock
        </Link>
      )}
    </aside>
  );
}
