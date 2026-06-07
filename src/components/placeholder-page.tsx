type PlaceholderPageProps = {
  title: string;
  eyebrow: string;
  summary: string;
  statusItems?: Array<{
    label: string;
    value: string;
  }>;
};

export function PlaceholderPage({
  title,
  eyebrow,
  summary,
  statusItems = [
    { label: "Build Phase", value: "Foundation" },
    { label: "Data Source", value: "Pending" },
    { label: "Auth", value: "Pending" }
  ]
}: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-copy">{summary}</p>
      </header>
      <section className="status-grid" aria-label={`${title} status`}>
        {statusItems.map((item) => (
          <div className="status-panel" key={item.label}>
            <div className="status-label">{item.label}</div>
            <div className="status-value">{item.value}</div>
          </div>
        ))}
      </section>
      <section className="placeholder-band">
        This route is wired into the v2 App Router foundation. Data, auth,
        permissions, and module workflows will land in later milestones.
      </section>
    </div>
  );
}
