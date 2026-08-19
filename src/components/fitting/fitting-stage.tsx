import { FittingRack } from "@/components/fitting/fitting-rack";
import { ShipCore } from "@/components/fitting/ship-core";
import type { FittingSlot, FittingSlots } from "@/lib/fitting/fit-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingStageProps = {
  selectedHull: FittingHullSummary | null;
  slots: FittingSlots;
};

export function FittingStage({ selectedHull, slots }: FittingStageProps) {
  const displaySlots = selectedHull ? slots : createEmptyVisualSlots();
  const midSlots = splitSlots(displaySlots.mid);
  const lowSlots = splitSlots(displaySlots.low);

  return (
    <section className="fitting-stage" aria-labelledby="fitting-stage-title">
      <div className="fitting-stage-header">
        <div>
          <h2 className="section-title" id="fitting-stage-title">
            Fitting Stage
          </h2>
          <p className="card-copy">
            Empty rack topology prepared for future hull and module state.
          </p>
        </div>
        <span className="badge">
          {selectedHull ? selectedHull.groupName || "Ship Hull" : "No Hull"}
        </span>
      </div>

      <div className="fitting-stage-grid" aria-label="Empty fitting layout">
        <div className="fitting-rack-zone fitting-rack-zone-high">
          <FittingRack
            label="High Slots"
            rack="high"
            slots={displaySlots.high}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-mid-left">
          <FittingRack
            label="Mid Slots"
            rack="mid"
            orientation="vertical"
            slots={midSlots.leading}
          />
        </div>
        <ShipCore selectedHull={selectedHull} />
        <div className="fitting-rack-zone fitting-rack-zone-mid-right">
          <FittingRack
            label="Mid Slots"
            rack="mid"
            orientation="vertical"
            slots={midSlots.trailing}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-left">
          <FittingRack
            label="Low Slots"
            rack="low"
            orientation="vertical"
            slots={lowSlots.leading}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-right">
          <FittingRack
            label="Low Slots"
            rack="low"
            orientation="vertical"
            slots={lowSlots.trailing}
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-rig">
          <FittingRack
            label="Rig Slots"
            rack="rig"
            slots={displaySlots.rig}
          />
        </div>
      </div>
    </section>
  );
}

function splitSlots(slots: FittingSlot[]) {
  const splitIndex = Math.ceil(slots.length / 2);

  return {
    leading: slots.slice(0, splitIndex),
    trailing: slots.slice(splitIndex)
  };
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
