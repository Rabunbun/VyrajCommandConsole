"use client";

import { useState, type CSSProperties } from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type {
  FittingDragSource,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import type { FittingSlot as FittingSlotState } from "@/lib/fitting/fit-state";
import type { FitOperationAttemptResult } from "@/components/fitting/use-fitting-state";

type FittingRackProps = {
  chargeNamesByTypeId: Readonly<Record<number, string>>;
  dragOverSlot: SelectedFittingSlot | null;
  dragSource: FittingDragSource | null;
  enabled: boolean;
  label: string;
  layout: "left" | "lower" | "right" | "upper";
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  moveSource: SelectedFittingSlot | null;
  onDragEnd: () => void;
  onDragOverSlot: (slot: SelectedFittingSlot | null) => void;
  onDropOnSlot: (slot: SelectedFittingSlot) => void;
  onFittedModuleDragStart: (
    source: Extract<FittingDragSource, { kind: "fitted-module" }>
  ) => void;
  onMoveTarget: (slot: SelectedFittingSlot) => void;
  onRemoveModule: (
    slot: SelectedFittingSlot
  ) => Promise<FitOperationAttemptResult>;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  onStartMove: (slot: SelectedFittingSlot) => void;
  onStartReplace: (slot: SelectedFittingSlot) => void;
  rack: "high" | "low" | "mid" | "rig";
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlotState[];
};

export function FittingRack({
  chargeNamesByTypeId,
  dragOverSlot,
  dragSource,
  enabled,
  label,
  layout,
  moduleNamesByTypeId,
  moveSource,
  onDragEnd,
  onDragOverSlot,
  onDropOnSlot,
  onFittedModuleDragStart,
  onMoveTarget,
  onRemoveModule,
  onSelectSlot,
  onStartMove,
  onStartReplace,
  rack,
  selectedSlot,
  slots
}: FittingRackProps) {
  const [removingSlotIndex, setRemovingSlotIndex] = useState<number | null>(null);

  return (
    <section
      className="fitting-rack"
      data-layout={layout}
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
            const chargeName = slot.module?.charge
              ? chargeNamesByTypeId[slot.module.charge.typeId] ??
                `Charge type ${slot.module.charge.typeId}`
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
              <li
                className="fitting-slot-item"
                key={slot.index}
                style={getSlotClusterStyle(slot.index, slots.length, layout)}
              >
                <button
                  aria-label={
                    isMoveTarget
                      ? `${label} empty slot ${slot.index + 1}, valid move target`
                      : occupied
                      ? `${label} slot ${slot.index + 1}, fitted with ${moduleName}${
                          slot.module?.charge
                            ? `, loaded with ${slot.module.charge.quantity} ${chargeName}`
                            : ""
                        }`
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
                    if (selected) {
                      onSelectSlot(address);
                    } else if (moveSource) {
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
                  title={
                    moduleName
                      ? `${moduleName}${
                          slot.module?.charge
                            ? ` — ${slot.module.charge.quantity.toLocaleString("en-US")} × ${chargeName}`
                            : ""
                        }`
                      : `${label} empty slot ${slot.index + 1}`
                  }
                  type="button"
                >
                  {slot.module ? (
                    <EveModuleIcon
                      typeId={slot.module.typeId}
                      typeName={moduleName ?? `Module type ${slot.module.typeId}`}
                      variant="slot"
                    />
                  ) : null}
                  {slot.module ? (
                    <span className="fitting-slot-drag-handle" aria-hidden="true">
                      Drag
                    </span>
                  ) : null}
                  {slot.module?.charge ? (
                    <span
                      aria-hidden="true"
                      className="fitting-slot-charge-indicator"
                    >
                      <EveModuleIcon
                        typeId={slot.module.charge.typeId}
                        typeName={chargeName ?? `Charge type ${slot.module.charge.typeId}`}
                        variant="charge"
                      />
                      <span>{formatCompactQuantity(slot.module.charge.quantity)}</span>
                    </span>
                  ) : null}
                </button>
                {occupied && !dragSource && !moveSource ? (
                  <div
                    aria-label={`${moduleName ?? "Fitted module"} contextual actions`}
                    className="fitting-slot-actions"
                    role="group"
                  >
                    <button
                      aria-label={`Remove ${moduleName ?? "fitted module"} from ${label} slot ${slot.index + 1}`}
                      disabled={removingSlotIndex !== null}
                      onClick={() => {
                        setRemovingSlotIndex(slot.index);
                        void onRemoveModule(address).finally(() => {
                          setRemovingSlotIndex(null);
                        });
                      }}
                      title="Remove module"
                      type="button"
                    >
                      {removingSlotIndex === slot.index ? "..." : "Remove"}
                    </button>
                    <button
                      aria-label={`Replace ${moduleName ?? "fitted module"} in ${label} slot ${slot.index + 1}`}
                      disabled={removingSlotIndex !== null}
                      onClick={() => onStartReplace(address)}
                      title="Replace module"
                      type="button"
                    >
                      Replace
                    </button>
                    <button
                      aria-label={`Move ${moduleName ?? "fitted module"} from ${label} slot ${slot.index + 1}`}
                      disabled={removingSlotIndex !== null}
                      onClick={() => onStartMove(address)}
                      title="Move module"
                      type="button"
                    >
                      Move
                    </button>
                  </div>
                ) : null}
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

function formatCompactQuantity(quantity: number) {
  return quantity > 999
    ? Intl.NumberFormat("en-US", { notation: "compact" }).format(quantity)
    : quantity.toLocaleString("en-US");
}

type FittingSlotClusterStyle = CSSProperties & {
  "--slot-cluster-shift-x": string;
  "--slot-cluster-shift-y": string;
};

function getSlotClusterStyle(
  index: number,
  count: number,
  layout: FittingRackProps["layout"]
): FittingSlotClusterStyle {
  const primaryCount = count > 4 ? Math.ceil(count / 2) : Math.max(count, 1);
  const secondaryTrack = index >= primaryCount;
  const trackIndex = secondaryTrack ? index - primaryCount : index;
  const vertical = layout === "left" || layout === "right";

  return {
    gridColumn: vertical ? (secondaryTrack ? 2 : 1) : trackIndex + 1,
    gridRow: vertical ? trackIndex + 1 : secondaryTrack ? 2 : 1,
    "--slot-cluster-shift-x": !vertical && secondaryTrack ? "50%" : "0px",
    "--slot-cluster-shift-y": vertical && secondaryTrack ? "50%" : "0px"
  };
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
