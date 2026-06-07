export type ConsoleRoute = {
  label: string;
  href: string;
  group: "Public" | "Member" | "Officer" | "Admin";
};

export const consoleRoutes: ConsoleRoute[] = [
  { label: "Alliance Hub", href: "/", group: "Public" },
  { label: "Corp Portal", href: "/corp/totality-squad", group: "Public" },
  { label: "Officer Login", href: "/login", group: "Public" },
  { label: "Attendance", href: "/corp/totality-squad/attendance", group: "Member" },
  { label: "Doctrine", href: "/corp/totality-squad/doctrine", group: "Member" },
  { label: "SRP", href: "/corp/totality-squad/srp", group: "Member" },
  { label: "Recruitment", href: "/corp/totality-squad/recruitment", group: "Officer" },
  { label: "Loot Splits", href: "/corp/totality-squad/loot-splits", group: "Officer" },
  { label: "Dashboard", href: "/corp/totality-squad/dashboard", group: "Officer" },
  { label: "Super Admin", href: "/admin/super", group: "Admin" },
  { label: "Officers", href: "/admin/officers", group: "Admin" },
  { label: "Corps", href: "/admin/corps", group: "Admin" },
  { label: "Hub Editor", href: "/admin/alliance-hub", group: "Admin" },
  { label: "Audit Log", href: "/admin/audit-log", group: "Admin" }
];

export const routeGroups = ["Public", "Member", "Officer", "Admin"] as const;
