import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingResourcesProps = {
  selectedHull: FittingHullSummary | null;
};

export function FittingResources({ selectedHull }: FittingResourcesProps) {
  const resources = [
    {
      label: "CPU",
      value: formatCapacityValue(selectedHull?.cpuBase ?? null, "tf")
    },
    {
      label: "Powergrid",
      value: formatCapacityValue(selectedHull?.powergridBase ?? null, "MW")
    },
    {
      label: "Calibration",
      value: formatCapacityValue(selectedHull?.calibrationCapacity ?? null)
    },
    {
      label: "Drone Capacity",
      value: formatCapacityValue(selectedHull?.droneCapacity ?? null, "m³")
    }
  ];

  return (
    <section className="fitting-resource-bar" aria-labelledby="fitting-resources-title">
      <h2 className="visually-hidden" id="fitting-resources-title">
        Fitting resources
      </h2>
      {resources.map((resource) => (
        <div className="fitting-resource" key={resource.label}>
          <div className="fitting-resource-header">
            <span className="metric-label">{resource.label}</span>
            <span className="metric-value">{resource.value}</span>
          </div>
          <span className="fitting-resource-scope">Base Hull</span>
          <div
            className="fitting-resource-track"
            aria-hidden="true"
          >
            <span className="fitting-resource-fill" />
          </div>
        </div>
      ))}
    </section>
  );
}

function formatCapacityValue(value: number | null, unit = "") {
  const capacity = value === null ? "—" : formatStaticNumber(value);
  const suffix = unit ? ` ${unit}` : "";

  return `0 / ${capacity}${suffix}`;
}

function formatStaticNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}
