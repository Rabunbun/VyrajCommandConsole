import { FittingRack } from "@/components/fitting/fitting-rack";
import type {
  FittingDragSource,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import { ShipCore } from "@/components/fitting/ship-core";
import type { FittingSlot, FittingSlots } from "@/lib/fitting/fit-state";
import type { BaseFitAnalysis, FittingHullSummary } from "@/lib/fitting/types";

type FittingStageProps = {
  analysis: BaseFitAnalysis;
  dragError: string | null;
  dragOverSlot: SelectedFittingSlot | null;
  dragSource: FittingDragSource | null;
  isRemoveDragOver: boolean;
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  moveSource: SelectedFittingSlot | null;
  onDragEnd: () => void;
  onDragOverSlot: (slot: SelectedFittingSlot | null) => void;
  onDropOnRemove: () => void;
  onDropOnSlot: (slot: SelectedFittingSlot) => void;
  onFittedModuleDragStart: (
    source: Extract<FittingDragSource, { kind: "fitted-module" }>
  ) => void;
  onMoveTarget: (slot: SelectedFittingSlot) => void;
  onRemoveDragOverChange: (isOver: boolean) => void;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  selectedHull: FittingHullSummary | null;
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlots;
};

export function FittingStage({
  analysis,
  dragError,
  dragOverSlot,
  dragSource,
  isRemoveDragOver,
  moduleNamesByTypeId,
  moveSource,
  onDragEnd,
  onDragOverSlot,
  onDropOnRemove,
  onDropOnSlot,
  onFittedModuleDragStart,
  onMoveTarget,
  onRemoveDragOverChange,
  onSelectSlot,
  selectedHull,
  selectedSlot,
  slots
}: FittingStageProps) {
  const displaySlots = selectedHull ? slots : createEmptyVisualSlots();
  const dragProps = {
    dragOverSlot,
    dragSource,
    onDragEnd,
    onDragOverSlot,
    onDropOnSlot,
    onFittedModuleDragStart
  };

  return (
    <section className="fitting-stage" aria-labelledby="fitting-stage-title">
      <div className="fitting-stage-header">
        <div>
          <h2 className="section-title" id="fitting-stage-title">
            Fitting Stage
          </h2>
          <p className="card-copy">
            Select a socket to fit or manage its module.
          </p>
          {dragError ? (
            <p className="fitting-drag-feedback" role="alert">
              {dragError}
            </p>
          ) : null}
        </div>
        <div className="fitting-stage-controls">
          {dragSource?.kind === "fitted-module" ? (
            <div
              aria-label="Remove fitted module drop target"
              className="fitting-remove-drop-target"
              data-active={isRemoveDragOver}
              onDragEnter={(event) => {
                event.preventDefault();
                onRemoveDragOverChange(true);
              }}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;

                if (
                  nextTarget instanceof Node &&
                  event.currentTarget.contains(nextTarget)
                ) {
                  return;
                }

                onRemoveDragOverChange(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onRemoveDragOverChange(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void onDropOnRemove();
              }}
              role="button"
            >
              Remove
            </div>
          ) : null}
          <span className="badge">
            {selectedHull ? selectedHull.groupName || "Ship Hull" : "No Hull"}
          </span>
        </div>
      </div>

      <div className="fitting-stage-grid" aria-label="Fitting layout">
        <div className="fitting-stage-traces" aria-hidden="true">
          <span data-trace="outer" />
          <span data-trace="middle" />
          <span data-trace="inner" />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-high">
          <FittingRack
            {...dragProps}
            enabled={Boolean(selectedHull)}
            label="High Slots"
            moduleNamesByTypeId={moduleNamesByTypeId}
            moveSource={moveSource}
            onMoveTarget={onMoveTarget}
            onSelectSlot={onSelectSlot}
            layout="upper"
            rack="high"
            selectedSlot={selectedSlot}
            slots={displaySlots.high}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-mid">
          <FittingRack
            {...dragProps}
            enabled={Boolean(selectedHull)}
            label="Mid Slots"
            moduleNamesByTypeId={moduleNamesByTypeId}
            moveSource={moveSource}
            onMoveTarget={onMoveTarget}
            onSelectSlot={onSelectSlot}
            layout="left"
            rack="mid"
            selectedSlot={selectedSlot}
            slots={displaySlots.mid}
          />
        </div>
        <ShipCore analysis={analysis} selectedHull={selectedHull} />
        <div className="fitting-rack-zone fitting-rack-zone-low">
          <FittingRack
            {...dragProps}
            enabled={Boolean(selectedHull)}
            label="Low Slots"
            moduleNamesByTypeId={moduleNamesByTypeId}
            moveSource={moveSource}
            onMoveTarget={onMoveTarget}
            onSelectSlot={onSelectSlot}
            layout="right"
            rack="low"
            selectedSlot={selectedSlot}
            slots={displaySlots.low}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-rig">
          <FittingRack
            {...dragProps}
            enabled={Boolean(selectedHull)}
            label="Rig Slots"
            moduleNamesByTypeId={moduleNamesByTypeId}
            moveSource={moveSource}
            onMoveTarget={onMoveTarget}
            onSelectSlot={onSelectSlot}
            layout="lower"
            rack="rig"
            selectedSlot={selectedSlot}
            slots={displaySlots.rig}
          />
        </div>
      </div>
    </section>
  );
}

function createEmptyVisualSlots(): FittingSlots {
  return {
    high: createVisualRackSlots(8),
    low: createVisualRackSlots(8),
    mid: createVisualRackSlots(8),
    rig: createVisualRackSlots(3),
    subsystem: []
  };
}

function createVisualRackSlots(count: number): FittingSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    module: null
  }));
}
