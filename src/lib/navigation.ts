export type ConsoleRoute = {
  label: string;
  href: string;
  group: "Public" | "Admin";
  permissions?: string[];
  superAdminOnly?: boolean;
};

export const consoleRoutes: ConsoleRoute[] = [
  { label: "Alliance Hub", href: "/", group: "Public" },
  { label: "Corp Directory", href: "/#corp-directory", group: "Public" },
  { label: "Login", href: "/login", group: "Public" },
  { label: "Super Admin", href: "/admin/super", group: "Admin", superAdminOnly: true },
  { label: "Officers", href: "/admin/officers", group: "Admin", superAdminOnly: true },
  { label: "Corps", href: "/admin/corps", group: "Admin", superAdminOnly: true },
  {
    label: "Hub Editor",
    href: "/admin/alliance-hub",
    group: "Admin",
    permissions: ["allianceHubEdit", "allianceAnnouncementsEdit"]
  },
  { label: "Audit Log", href: "/admin/audit-log", group: "Admin", superAdminOnly: true }
];

export const routeGroups = ["Public", "Admin"] as const;
