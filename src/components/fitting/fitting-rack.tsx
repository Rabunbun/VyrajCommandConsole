import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type {
  FittingDragSource,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";

type FittingRackProps = {
  dragOverSlot: SelectedFittingSlot | null;
  dragSource: FittingDragSource | null;
  enabled: boolean;
  label: string;
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  moveSource: SelectedFittingSlot | null;
  onDragEnd: () => void;
  onDragOverSlot: (slot: SelectedFittingSlot | null) => void;
  onDropOnSlot: (slot: SelectedFittingSlot) => void;
  onFittedModuleDragStart: (
    source: Extract<FittingDragSource, { kind: "fitted-module" }>
  ) => void;
  onMoveTarget: (slot: SelectedFittingSlot) => void;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  orientation?: "horizontal" | "vertical";
  rack: "high" | "low" | "mid" | "rig";
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlotState[];
};

export function FittingRack({
  dragOverSlot,
  dragSource,
  enabled,
  label,
  moduleNamesByTypeId,
  moveSource,
  onDragEnd,
  onDragOverSlot,
  onDropOnSlot,
  onFittedModuleDragStart,
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
            const address = { index: slot.index, rack };
            const isDragSource =
              dragSource?.kind === "fitted-module" &&
              dragSource.from.rack === rack &&
              dragSource.from.index === slot.index;
            const isValidDropTarget = isStructurallyValidDropTarget(
              dragSource,
              address,
              occupied
            );
            const isActiveDropTarget =
              dragOverSlot?.rack === rack && dragOverSlot.index === slot.index;

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
                  data-drag-target={
                    dragSource ? (isValidDropTarget ? "valid" : "invalid") : undefined
                  }
                  data-dragging={isDragSource}
                  data-drop-active={Boolean(dragSource) && isActiveDropTarget}
                  data-module-instance-id={slot.module?.instanceId}
                  data-module-type-id={slot.module?.typeId}
                  data-move-source={isMoveSource}
                  data-move-target={isMoveTarget}
                  data-occupied={occupied}
                  data-selected={selected}
                  disabled={!enabled}
                  draggable={enabled && occupied}
                  onClick={() => {
                    if (moveSource) {
                      onMoveTarget(address);
                    } else {
                      onSelectSlot(address);
                    }
                  }}
                  onDragEnd={onDragEnd}
                  onDragEnter={() => {
                    if (dragSource) {
                      onDragOverSlot(address);
                    }
                  }}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget;

                    if (
                      nextTarget instanceof Node &&
                      event.currentTarget.contains(nextTarget)
                    ) {
                      return;
                    }

                    if (isActiveDropTarget) {
                      onDragOverSlot(null);
                    }
                  }}
                  onDragOver={(event) => {
                    if (!dragSource) {
                      return;
                    }

                    onDragOverSlot(address);

                    if (isValidDropTarget) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect =
                        dragSource.kind === "browser-module" ? "copy" : "move";
                    }
                  }}
                  onDragStart={(event) => {
                    if (!slot.module) {
                      event.preventDefault();
                      return;
                    }

                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "text/plain",
                      `fitted-module:${slot.module.instanceId}`
                    );
                    onFittedModuleDragStart({
                      from: address,
                      instanceId: slot.module.instanceId,
                      kind: "fitted-module",
                      typeId: slot.module.typeId
                    });
                  }}
                  onDrop={(event) => {
                    if (!dragSource || !isValidDropTarget) {
                      return;
                    }

                    event.preventDefault();
                    void onDropOnSlot(address);
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

function isStructurallyValidDropTarget(
  source: FittingDragSource | null,
  target: SelectedFittingSlot,
  occupied: boolean
) {
  if (!source || occupied) {
    return false;
  }

  if (source.kind === "browser-module") {
    return source.rack === target.rack;
  }

  return (
    source.from.rack === target.rack &&
    source.from.index !== target.index
  );
}
