import { EveShipImage } from "@/components/eve-ship-image";
import { ModuleIcon } from "@/components/module-visuals";
import type { FittingHullSummary } from "@/lib/fitting/types";

type ShipCoreProps = {
  selectedHull: FittingHullSummary | null;
};

export function ShipCore({ selectedHull }: ShipCoreProps) {
  if (selectedHull) {
    return (
      <section className="ship-core ship-core-selected" aria-labelledby="ship-core-title">
        <div className="ship-core-image-wrap">
          <EveShipImage
            alt={`${selectedHull.typeName} ship render`}
            className="ship-core-image"
            fallbackLabel={selectedHull.typeName}
            iconUrl={selectedHull.iconUrl}
            renderUrl={selectedHull.renderUrl}
          />
        </div>
        <div className="ship-core-copy">
          <h3 className="card-title" id="ship-core-title">
            {selectedHull.typeName}
          </h3>
          <p className="card-copy">
            {[selectedHull.groupName, `Type ${selectedHull.typeId}`]
              .filter(Boolean)
              .join(" / ")}
          </p>
          <div className="fitting-slot-summary" aria-label="Selected hull slot topology">
            <span>H {selectedHull.highSlots}</span>
            <span>M {selectedHull.midSlots}</span>
            <span>L {selectedHull.lowSlots}</span>
            <span>R {selectedHull.rigSlots}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ship-core" aria-labelledby="ship-core-title">
      <div className="ship-core-orbit" aria-hidden="true">
        <div className="ship-core-glyph">
          <ModuleIcon name="ship" size={44} />
        </div>
      </div>
      <div className="ship-core-copy">
        <h3 className="card-title" id="ship-core-title">
          No Ship Selected
        </h3>
        <p className="card-copy">
          Select a hull to begin fitting.
        </p>
      </div>
    </section>
  );
}
