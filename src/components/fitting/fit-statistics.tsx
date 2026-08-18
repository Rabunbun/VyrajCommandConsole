const statisticSections = [
  {
    title: "Offense",
    rows: [
      ["DPS", "—"],
      ["Volley", "—"]
    ]
  },
  {
    title: "Defense",
    rows: [
      ["Effective Hitpoints", "—"],
      ["Shield", "—"],
      ["Armor", "—"],
      ["Hull", "—"]
    ]
  },
  {
    title: "Capacitor",
    rows: [
      ["Stability", "—"],
      ["Duration", "—"]
    ]
  },
  {
    title: "Targeting",
    rows: [
      ["Lock Range", "—"],
      ["Scan Resolution", "—"],
      ["Max Targets", "—"]
    ]
  },
  {
    title: "Navigation",
    rows: [
      ["Maximum Velocity", "—"],
      ["Align Time", "—"],
      ["Signature Radius", "—"]
    ]
  }
];

export function FitStatistics() {
  return (
    <aside className="fitting-panel fit-statistics" aria-labelledby="fit-statistics-title">
      <div className="fitting-panel-heading">
        <h2 className="section-title" id="fit-statistics-title">
          Fit Statistics
        </h2>
        <span className="badge">Placeholder</span>
      </div>

      <div className="fit-stat-section-list">
        {statisticSections.map((section) => (
          <section className="fit-stat-section" key={section.title}>
            <h3 className="fit-stat-title">{section.title}</h3>
            <dl className="fit-stat-list">
              {section.rows.map(([label, value]) => (
                <div className="fit-stat-row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}
