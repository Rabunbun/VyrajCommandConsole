import { FittingRack } from "@/components/fitting/fitting-rack";
import { ShipCore } from "@/components/fitting/ship-core";

export function FittingStage() {
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
        <span className="badge">No Hull</span>
      </div>

      <div className="fitting-stage-grid" aria-label="Empty fitting layout">
        <div className="fitting-rack-zone fitting-rack-zone-high">
          <FittingRack count={8} label="High Slots" rack="high" />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-mid-left">
          <FittingRack count={4} label="Mid Slots" rack="mid" orientation="vertical" />
        </div>
        <ShipCore />
        <div className="fitting-rack-zone fitting-rack-zone-mid-right">
          <FittingRack count={4} label="Mid Slots" rack="mid" orientation="vertical" />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-left">
          <FittingRack count={4} label="Low Slots" rack="low" orientation="vertical" />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-low-right">
          <FittingRack count={4} label="Low Slots" rack="low" orientation="vertical" />
        </div>
        <div className="fitting-rack-zone fitting-rack-zone-rig">
          <FittingRack count={3} label="Rig Slots" rack="rig" />
        </div>
      </div>
    </section>
  );
}
