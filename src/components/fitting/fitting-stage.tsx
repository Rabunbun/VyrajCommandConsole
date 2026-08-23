import { FittingRack } from "@/components/fitting/fitting-rack";
import type {
  FittingDragSource,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import { ShipCore } from "@/components/fitting/ship-core";
import type { FittingSlot, FittingSlots } from "@/lib/fitting/fit-state";
import type { BaseFitAnalysis, FittingHullSummary } from "@/lib/fitting/types";
import type { FitOperationAttemptResult } from "@/components/fitting/use-fitting-state";

type FittingStageProps = {
  analysis: BaseFitAnalysis;
  chargeNamesByTypeId: Readonly<Record<number, string>>;
  dragError: string | null;
  dragOverSlot: SelectedFittingSlot | null;
  dragSource: FittingDragSource | null;
  isRemoveDragOver: boolean;
  isStageDragOver: boolean;
  moduleNamesByTypeId: Readonly<Record<number, string>>;
  moveSource: SelectedFittingSlot | null;
  onClearSelectedSlot: () => void;
  onDragEnd: () => void;
  onDragOverSlot: (slot: SelectedFittingSlot | null) => void;
  onDropOnRemove: () => void;
  onDropOnSlot: (slot: SelectedFittingSlot) => void;
  onDropOnStage: () => void;
  onFittedModuleDragStart: (
    source: Extract<FittingDragSource, { kind: "fitted-module" }>
  ) => void;
  onMoveTarget: (slot: SelectedFittingSlot) => void;
  onRemoveModule: (
    slot: SelectedFittingSlot
  ) => Promise<FitOperationAttemptResult>;
  onRemoveDragOverChange: (isOver: boolean) => void;
  onStageDragOverChange: (isOver: boolean) => void;
  onSelectSlot: (slot: SelectedFittingSlot) => void;
  onStartMove: (slot: SelectedFittingSlot) => void;
  onStartReplace: (slot: SelectedFittingSlot) => void;
  selectedHull: FittingHullSummary | null;
  selectedSlot: SelectedFittingSlot | null;
  slots: FittingSlots;
};

export function FittingStage({
  analysis,
  chargeNamesByTypeId,
  dragError,
  dragOverSlot,
  dragSource,
  isRemoveDragOver,
  isStageDragOver,
  moduleNamesByTypeId,
  moveSource,
  onClearSelectedSlot,
  onDragEnd,
  onDragOverSlot,
  onDropOnRemove,
  onDropOnSlot,
  onDropOnStage,
  onFittedModuleDragStart,
  onMoveTarget,
  onRemoveModule,
  onRemoveDragOverChange,
  onStageDragOverChange,
  onSelectSlot,
  onStartMove,
  onStartReplace,
  selectedHull,
  selectedSlot,
  slots
}: FittingStageProps) {
  const displaySlots = selectedHull ? slots : createEmptyVisualSlots();
  const dragProps = {
    chargeNamesByTypeId,
    dragOverSlot,
    dragSource,
    onDragEnd,
    onDragOverSlot,
    onDropOnSlot,
    onFittedModuleDragStart,
    onRemoveModule,
    onStartMove,
    onStartReplace
  };

  return (
    <section
      className="fitting-stage"
      data-general-drop-active={isStageDragOver}
      data-general-drop-target={isBrowserDragSource(dragSource)}
      aria-labelledby="fitting-stage-title"
      onDragEnter={(event) => {
        if (isBrowserDragSource(dragSource)) {
          event.preventDefault();
          onStageDragOverChange(true);
        }
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        onStageDragOverChange(false);
      }}
      onDragOver={(event) => {
        if (isBrowserDragSource(dragSource)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          onStageDragOverChange(true);
        }
      }}
      onDrop={(event) => {
        if (!isBrowserDragSource(dragSource)) {
          return;
        }
        event.preventDefault();
        onStageDragOverChange(false);
        void onDropOnStage();
      }}
      onClick={(event) => {
        const target = event.target;

        if (
          target instanceof Element &&
          target.closest("button, [role='button'], a, input, select, textarea")
        ) {
          return;
        }

        onClearSelectedSlot();
      }}
    >
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
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                onRemoveDragOverChange(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
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
            layout="right"
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
            layout="lower"
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
            layout="upper"
            rack="rig"
            selectedSlot={selectedSlot}
            slots={displaySlots.rig}
          />
        </div>
      </div>
    </section>
  );
}

function isBrowserDragSource(
  source: FittingDragSource | null
): source is Extract<FittingDragSource, { kind: `browser-${string}` }> {
  return source?.kind === "browser-module" ||
    source?.kind === "browser-charge" ||
    source?.kind === "browser-drone" ||
    source?.kind === "browser-cargo";
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
