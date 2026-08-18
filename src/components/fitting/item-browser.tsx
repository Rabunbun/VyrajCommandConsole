import { ModuleIcon, type ModuleIconName } from "@/components/module-visuals";

const itemCategories: Array<{
  description: string;
  icon: ModuleIconName;
  label: string;
}> = [
  {
    description: "Hull selection will attach here.",
    icon: "ship",
    label: "Ships"
  },
  {
    description: "High, mid, low, rig, and subsystem modules.",
    icon: "doctrine",
    label: "Modules"
  },
  {
    description: "Ammunition, scripts, boosters, and reloadable charges.",
    icon: "loot",
    label: "Charges"
  },
  {
    description: "Drone and fighter bay planning.",
    icon: "dashboard",
    label: "Drones"
  }
];

export function ItemBrowser() {
  return (
    <aside className="fitting-panel fitting-item-browser" aria-labelledby="item-library-title">
      <div className="fitting-panel-heading">
        <h2 className="section-title" id="item-library-title">
          Item Library
        </h2>
        <span className="badge" data-state="PUBLIC">
          Empty Index
        </span>
      </div>

      <label className="field-stack">
        <span className="field-label">Search</span>
        <input
          className="text-input fitting-search-input"
          placeholder="Search ships, modules, charges..."
          type="search"
        />
      </label>

      <nav className="fitting-category-list" aria-label="Future fitting item categories">
        {itemCategories.map((category) => (
          <div className="fitting-category-card" key={category.label}>
            <div className="module-icon-block module-icon-block-small">
              <ModuleIcon name={category.icon} size={20} />
            </div>
            <div>
              <div className="card-title">{category.label}</div>
              <p className="card-copy">{category.description}</p>
            </div>
          </div>
        ))}
      </nav>

      <div className="fitting-empty-note">
        Static presentation only. No item database is loaded in this scaffold.
      </div>
    </aside>
  );
}
