import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";

type FittingRackProps = {
  label: string;
  orientation?: "horizontal" | "vertical";
  rack: "high" | "low" | "mid" | "rig";
  slots: FittingSlotState[];
};

export function FittingRack({
  label,
  orientation = "horizontal",
  rack,
  slots
}: FittingRackProps) {
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
          {slots.map((slot) => (
            <li key={slot.index}>
              <span
                className="fitting-slot"
                role="img"
                aria-label={`${label} empty slot ${slot.index + 1}`}
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
