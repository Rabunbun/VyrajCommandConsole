import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type { SelectedFittingSlot } from "@/components/fitting/fitting-ui-types";
import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";

type FittingRackProps = {
  enabled: boolean;
  label: string;
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  moveSource: SelectedFittingSlot | null;
  onMoveTarget: (slot: SelectedFittingSlot) => void;
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
  moveSource,
  onMoveTarget,
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
              selectedSlot?.rack === rack &&
              selectedSlot.index === slot.index;
            const isMoveSource =
              moveSource?.rack === rack && moveSource.index === slot.index;
            const isMoveTarget =
              Boolean(moveSource) && moveSource?.rack === rack && !occupied;

            return (
              <li key={slot.index}>
                <button
                  aria-label={
                    isMoveTarget
                      ? `${label} empty slot ${slot.index + 1}, valid move target`
                      : occupied
                      ? `${label} slot ${slot.index + 1}, fitted with ${moduleName}`
                      : `${label} empty slot ${slot.index + 1}`
                  }
                  aria-pressed={selected}
                  className="fitting-slot"
                  data-module-instance-id={slot.module?.instanceId}
                  data-module-type-id={slot.module?.typeId}
                  data-move-source={isMoveSource}
                  data-move-target={isMoveTarget}
                  data-occupied={occupied}
                  data-selected={selected}
                  disabled={!enabled}
                  onClick={() => {
                    const address = { index: slot.index, rack };

                    if (moveSource) {
                      onMoveTarget(address);
                    } else {
                      onSelectSlot(address);
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
