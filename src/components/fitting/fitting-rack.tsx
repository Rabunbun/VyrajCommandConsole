import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type { SelectedFittingSlot } from "@/components/fitting/fitting-ui-types";
import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";

type FittingRackProps = {
  enabled: boolean;
  label: string;
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  orientation?: "horizontal" | "vertical";
  rack: "high" | "low" | "mid" | "rig";
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlotState[];
};

export function FittingRack({
  enabled,
  label,
  moduleNamesByTypeId,
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
          {slots.map((slot) => {
            const moduleName = slot.module
              ? moduleNamesByTypeId[slot.module.typeId] ??
                `Module type ${slot.module.typeId}`
              : null;
            const occupied = Boolean(slot.module);
            const selected =
              !occupied &&
              selectedSlot?.rack === rack &&
              selectedSlot.index === slot.index;

            return (
              <li key={slot.index}>
                <button
                  aria-label={
                    occupied
                      ? `${label} slot ${slot.index + 1}, fitted with ${moduleName}`
                      : `${label} empty slot ${slot.index + 1}`
                  }
                  aria-pressed={selected}
                  className="fitting-slot"
                  data-module-type-id={slot.module?.typeId}
                  data-occupied={occupied}
                  data-selected={selected}
                  disabled={!enabled || occupied}
                  onClick={() => {
                    if (!occupied) {
                      onSelectSlot({ index: slot.index, rack });
                    }
                  }}
                  title={moduleName ?? `${label} empty slot ${slot.index + 1}`}
                  type="button"
                >
                  {slot.module ? (
                    <EveModuleIcon
                      typeId={slot.module.typeId}
                      typeName={moduleName ?? `Module type ${slot.module.typeId}`}
                      variant="slot"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="fitting-rack-empty">No slots</div>
      )}
    </section>
  );
}
