import type { SelectedFittingSlot } from "@/components/fitting/fitting-ui-types";
import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";

type FittingRackProps = {
  enabled: boolean;
  label: string;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  orientation?: "horizontal" | "vertical";
  rack: "high" | "low" | "mid" | "rig";
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlotState[];
};

export function FittingRack({
  enabled,
  label,
  onSelectSlot,
  orientation = "horizontal",
  rack,
  selectedSlot,
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
              <button
                aria-label={`${label} empty slot ${slot.index + 1}`}
                aria-pressed={
                  selectedSlot?.rack === rack && selectedSlot.index === slot.index
                }
                className="fitting-slot"
                data-selected={
                  selectedSlot?.rack === rack && selectedSlot.index === slot.index
                }
                disabled={!enabled}
                onClick={() => onSelectSlot({ index: slot.index, rack })}
                type="button"
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
