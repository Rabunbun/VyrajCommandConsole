import { ModuleIcon } from "@/components/module-visuals";

export function ShipCore() {
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
