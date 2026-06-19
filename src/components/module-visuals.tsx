import Link from "next/link";
import type { ReactNode } from "react";

export type ModuleIconName =
  | "attendance"
  | "audit"
  | "corp"
  | "dashboard"
  | "doctrine"
  | "health"
  | "identity"
  | "lock"
  | "loot"
  | "officers"
  | "recruitment"
  | "ship"
  | "srp";

type ModuleIconProps = {
  className?: string;
  name: ModuleIconName;
  size?: number;
};

const iconPaths: Record<ModuleIconName, ReactNode> = {
  attendance: (
    <>
      <path d="M8 2v4M16 2v4M3 9h18" />
      <rect height="18" rx="2" width="18" x="3" y="4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  audit: (
    <>
      <path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h3" />
    </>
  ),
  corp: (
    <>
      <path d="M4 21V8l8-5 8 5v13M8 21v-8h8v8M8 9h.01M12 9h.01M16 9h.01" />
    </>
  ),
  dashboard: (
    <>
      <path d="M4 13a8 8 0 1 1 16 0" />
      <path d="m12 13 4-4M5 19h14M7 16h10" />
    </>
  ),
  doctrine: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M9 12h6M12 9v6" />
    </>
  ),
  health: (
    <>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
      <path d="M5 4h14v16H5z" />
    </>
  ),
  identity: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0M18 5l2 2-4 4" />
    </>
  ),
  lock: (
    <>
      <rect height="11" rx="2" width="16" x="4" y="10" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  loot: (
    <>
      <path d="m4 8 8-4 8 4-8 4-8-4Z" />
      <path d="m4 8 8 4 8-4v8l-8 4-8-4V8ZM12 12v8" />
    </>
  ),
  officers: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M17 8h5M19.5 5.5v5" />
    </>
  ),
  recruitment: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0M18 11l2 2 3-4" />
    </>
  ),
  ship: (
    <>
      <path d="m12 3 4 6 5 3-5 3-4 6-4-6-5-3 5-3 4-6Z" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  srp: (
    <>
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />
      <path d="M9 12h6M12 9v6" />
    </>
  )
};

export function ModuleIcon({
  className = "",
  name,
  size = 24
}: ModuleIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      >
        {iconPaths[name]}
      </g>
    </svg>
  );
}

type MetricChipProps = {
  label: string;
  value: number | string;
};

export function MetricChip({ label, value }: MetricChipProps) {
  return (
    <span className="metric-chip">
      <span className="metric-chip-label">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

type StatusPipProps = {
  label: string;
  tone?: "critical" | "info" | "muted" | "ready" | "verified" | "warning";
};

export function StatusPip({ label, tone = "info" }: StatusPipProps) {
  return (
    <span className="status-pip" data-tone={tone}>
      <span aria-hidden="true" className="status-pip-dot" />
      {label}
    </span>
  );
}

type ModuleTileProps = {
  actionLabel?: string;
  description: string;
  href: string;
  icon: ModuleIconName;
  metrics?: MetricChipProps[];
  status?: StatusPipProps;
  subtitle?: string;
  title: string;
};

export function ModuleTile({
  actionLabel = "Open Module",
  description,
  href,
  icon,
  metrics = [],
  status,
  subtitle,
  title
}: ModuleTileProps) {
  return (
    <Link className="module-tile" href={href}>
      <div className="module-icon-block">
        <ModuleIcon name={icon} size={26} />
      </div>
      <div className="module-tile-content">
        <div className="module-tile-heading">
          <div>
            <h3 className="card-title">{title}</h3>
            {subtitle ? <div className="card-subtitle">{subtitle}</div> : null}
          </div>
          {status ? <StatusPip {...status} /> : null}
        </div>
        <p className="card-copy">{description}</p>
        {metrics.length ? (
          <div className="metric-chip-row">
            {metrics.map((metric) => (
              <MetricChip
                key={`${metric.label}-${metric.value}`}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
        ) : null}
        <span className="module-tile-action">{actionLabel}</span>
      </div>
    </Link>
  );
}
