import { FittingRack } from "@/components/fitting/fitting-rack";
import { ShipCore } from "@/components/fitting/ship-core";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingStageProps = {
  selectedHull: FittingHullSummary | null;
};

export function FittingStage({ selectedHull }: FittingStageProps) {
  const midSlots = splitSlots(selectedHull?.midSlots ?? 8);
  const lowSlots = splitSlots(selectedHull?.lowSlots ?? 8);

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
            count={selectedHull?.highSlots ?? 8}
            label="High Slots"
            rack="high"
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-mid-left">
          <FittingRack
            count={midSlots.leading}
            label="Mid Slots"
            rack="mid"
            orientation="vertical"
          />
        </div>
        <ShipCore selectedHull={selectedHull} />
        <div className="fitting-rack-zone fitting-rack-zone-mid-right">
          <FittingRack
            count={midSlots.trailing}
            label="Mid Slots"
            rack="mid"
            orientation="vertical"
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-left">
          <FittingRack
            count={lowSlots.leading}
            label="Low Slots"
            rack="low"
            orientation="vertical"
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-right">
          <FittingRack
            count={lowSlots.trailing}
            label="Low Slots"
            rack="low"
            orientation="vertical"
          />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-rig">
          <FittingRack
            count={selectedHull?.rigSlots ?? 3}
            label="Rig Slots"
            rack="rig"
          />
        </div>
      </div>
    </section>
  );
}

function splitSlots(count: number) {
  return {
    leading: Math.ceil(count / 2),
    trailing: Math.floor(count / 2)
  };
}
