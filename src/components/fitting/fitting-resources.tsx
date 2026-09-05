import type {
  BaseFitAnalysis,
  FittingHullSummary,
  FitValidationIssue
} from "@/lib/fitting/types";
import type { EffectiveFitAnalysis } from "@/lib/fitting/dogma";

type FittingResourcesProps = {
  analysis: BaseFitAnalysis;
  droneBayUsedVolume: number;
  effectiveAnalysis: EffectiveFitAnalysis | null;
  isEffectiveAnalysisLoading: boolean;
  selectedHull: FittingHullSummary | null;
  warnings: FitValidationIssue[];
};

export function FittingResources({
  analysis,
  droneBayUsedVolume,
  effectiveAnalysis,
  isEffectiveAnalysisLoading,
  selectedHull,
  warnings
}: FittingResourcesProps) {
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const effectiveAvailable = effectiveAnalysis?.status === "available";
  const effectiveDroneBay =
    effectiveAnalysis?.capacities.droneBay.status === "available"
      ? effectiveAnalysis.capacities.droneBay.effective
      : null;
  const resources = [
    {
      capacity: effectiveAvailable
        ? effectiveAnalysis.cpu.effectiveOutput
        : selectedHull?.cpuBase ?? null,
      label: "CPU",
      scope: effectiveAvailable
        ? `Effective · Base ${formatUsageValue(
            analysis.cpuUsed,
            selectedHull?.cpuBase ?? null,
            "tf"
          )}`
        : isEffectiveAnalysisLoading
          ? "Effective calculating · Base / Unmodified shown"
          : "Effective unavailable · Base / Unmodified shown",
      unit: "tf",
      used: effectiveAvailable
        ? effectiveAnalysis.cpu.effectiveUsed ?? analysis.cpuUsed
        : analysis.cpuUsed,
      warning: effectiveAvailable
        ? (effectiveAnalysis.cpu.overage ?? 0) > 0
        : warningCodes.has("CPU_BASE_OVER")
    },
    {
      capacity: effectiveAvailable
        ? effectiveAnalysis.powergrid.effectiveOutput
        : selectedHull?.powergridBase ?? null,
      label: "Powergrid",
      scope: effectiveAvailable
        ? `Effective · Base ${formatUsageValue(
            analysis.powergridUsed,
            selectedHull?.powergridBase ?? null,
            "MW"
          )}`
        : isEffectiveAnalysisLoading
          ? "Effective calculating · Base / Unmodified shown"
          : "Effective unavailable · Base / Unmodified shown",
      unit: "MW",
      used: effectiveAvailable
        ? effectiveAnalysis.powergrid.effectiveUsed ?? analysis.powergridUsed
        : analysis.powergridUsed,
      warning: effectiveAvailable
        ? (effectiveAnalysis.powergrid.overage ?? 0) > 0
        : warningCodes.has("POWERGRID_BASE_OVER")
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
      capacity: effectiveDroneBay ?? selectedHull?.droneCapacity ?? null,
      label: "Drone Bay",
      scope:
        effectiveDroneBay !== null
          ? `Effective · Base ${formatNullableNumber(selectedHull?.droneCapacity ?? null)} m³ · Add checks base`
          : "Carried Volume · Effective unavailable",
      unit: "m³",
      used: droneBayUsedVolume,
      warning:
        (effectiveDroneBay ?? selectedHull?.droneCapacity ?? 0) > 0 &&
        droneBayUsedVolume /
          (effectiveDroneBay ?? selectedHull?.droneCapacity ?? 1) >= 0.9
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
            {resource.warning &&
            resource.capacity !== null &&
            resource.used > resource.capacity ? (
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

function formatNullableNumber(value: number | null) {
  return value === null ? "—" : formatStaticNumber(value);
}
