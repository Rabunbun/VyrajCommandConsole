type FittingRackProps = {
  count: number;
  label: string;
  orientation?: "horizontal" | "vertical";
  rack: "high" | "low" | "mid" | "rig";
};

export function FittingRack({
  count,
  label,
  orientation = "horizontal",
  rack
}: FittingRackProps) {
  const slots = Array.from({ length: Math.max(0, count) }, (_, index) => index + 1);

  return (
    <section
      className="fitting-rack"
      data-orientation={orientation}
      data-rack={rack}
      aria-label={label}
    >
      <div className="fitting-rack-label">{label}</div>
      {slots.length ? (
        <ul className="fitting-slot-list">
          {slots.map((slotNumber) => (
            <li key={slotNumber}>
              <span
                className="fitting-slot"
                role="img"
                aria-label={`${label} empty slot ${slotNumber}`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="fitting-rack-empty">No slots</div>
      )}
    </section>
  );
}
