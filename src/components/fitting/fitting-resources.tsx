const resources = [
  {
    label: "CPU",
    value: "0 / — tf"
  },
  {
    label: "Powergrid",
    value: "0 / — MW"
  },
  {
    label: "Calibration",
    value: "0 / —"
  },
  {
    label: "Drone Capacity",
    value: "0 / —"
  }
];

export function FittingResources() {
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
