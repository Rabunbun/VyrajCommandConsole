import type {
  BaseFitAnalysis,
  FittingHullSummary,
  FitValidationIssue
} from "@/lib/fitting/types";

type FittingResourcesProps = {
  analysis: BaseFitAnalysis;
  selectedHull: FittingHullSummary | null;
  warnings: FitValidationIssue[];
};

export function FittingResources({
  analysis,
  selectedHull,
  warnings
}: FittingResourcesProps) {
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const resources = [
    {
      capacity: selectedHull?.cpuBase ?? null,
      label: "CPU",
      scope: "Base / Unmodified",
      unit: "tf",
      used: analysis.cpuUsed,
      warning: warningCodes.has("CPU_BASE_OVER")
    },
    {
      capacity: selectedHull?.powergridBase ?? null,
      label: "Powergrid",
      scope: "Base / Unmodified",
      unit: "MW",
      used: analysis.powergridUsed,
      warning: warningCodes.has("POWERGRID_BASE_OVER")
    },
    {
      capacity: selectedHull?.calibrationCapacity ?? null,
      label: "Calibration",
      scope: "Base / Unmodified",
      unit: "",
      used: analysis.calibrationUsed,
      warning: warningCodes.has("CALIBRATION_OVER")
    },
    {
      capacity: selectedHull?.droneCapacity ?? null,
      label: "Drone Capacity",
      scope: "Base Hull",
      unit: "m³",
      used: 0,
      warning: false
    }
  ];

  return (
    <section className="fitting-resource-bar" aria-labelledby="fitting-resources-title">
      <h2 className="visually-hidden" id="fitting-resources-title">
        Fitting resources
      </h2>
      {resources.map((resource) => (
        <div
          className="fitting-resource"
          data-tone={resource.warning ? "warning" : "default"}
          key={resource.label}
        >
          <div className="fitting-resource-header">
            <span className="metric-label">{resource.label}</span>
            <span className="metric-value">
              {formatUsageValue(resource.used, resource.capacity, resource.unit)}
            </span>
          </div>
          <div className="fitting-resource-scope-row">
            <span className="fitting-resource-scope">{resource.scope}</span>
            {resource.warning && resource.capacity !== null ? (
              <span className="fitting-resource-overage">
                {formatOverage(resource.used - resource.capacity, resource.unit)} over
              </span>
            ) : null}
          </div>
          <div className="fitting-resource-track" aria-hidden="true">
            <span
              className="fitting-resource-fill"
              style={{ inlineSize: `${getUsagePercent(resource.used, resource.capacity)}%` }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

function formatUsageValue(used: number, capacity: number | null, unit = "") {
  const formattedCapacity = capacity === null ? "—" : formatStaticNumber(capacity);
  const suffix = unit ? ` ${unit}` : "";

  return `${formatStaticNumber(used)} / ${formattedCapacity}${suffix}`;
}

function formatOverage(value: number, unit: string) {
  return `${formatStaticNumber(value)}${unit ? ` ${unit}` : ""}`;
}

function getUsagePercent(used: number, capacity: number | null) {
  if (capacity === null || capacity <= 0) {
    return used > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, (used / capacity) * 100));
}

function formatStaticNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}
