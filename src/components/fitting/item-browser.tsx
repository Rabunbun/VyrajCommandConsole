import { useMemo, useState } from "react";
import { ModuleIcon, type ModuleIconName } from "@/components/module-visuals";
import type { FittingHullSummary } from "@/lib/fitting/types";

const initialResultLimit = 18;
const filteredResultLimit = 36;

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

type ItemBrowserProps = {
  hulls: FittingHullSummary[];
  onSelectHull: (hull: FittingHullSummary) => void;
  selectedHull: FittingHullSummary | null;
};

export function ItemBrowser({
  hulls,
  onSelectHull,
  selectedHull
}: ItemBrowserProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearchText(query);
  const searchResult = useMemo(() => {
    const matches = normalizedQuery
      ? hulls.filter((hull) =>
          normalizeSearchText(`${hull.typeName} ${hull.groupName}`).includes(
            normalizedQuery
          )
        )
      : hulls;
    const limit = normalizedQuery ? filteredResultLimit : initialResultLimit;

    return {
      matchCount: matches.length,
      visibleHulls: matches.slice(0, limit)
    };
  }, [hulls, normalizedQuery]);
  const resultLimit = normalizedQuery ? filteredResultLimit : initialResultLimit;
  const hasMoreResults = searchResult.matchCount > searchResult.visibleHulls.length;

  return (
    <aside className="fitting-panel fitting-item-browser" aria-labelledby="item-library-title">
      <div className="fitting-panel-heading">
        <h2 className="section-title" id="item-library-title">
          Item Library
        </h2>
        <span className="badge" data-state={hulls.length ? "ACTIVE" : "WARNING"}>
          {hulls.length ? `${hulls.length} Hulls` : "No Hull Data"}
        </span>
      </div>

      <label className="field-stack">
        <span className="field-label">Search</span>
        <input
          className="text-input fitting-search-input"
          placeholder="Search ships, modules, charges..."
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          value={query}
        />
      </label>

      <section className="fitting-hull-results" aria-label="Ship hull search results">
        <div className="fitting-panel-heading">
          <h3 className="fit-stat-title">Ships</h3>
          <span className="card-copy">
            Showing {searchResult.visibleHulls.length}
            {hasMoreResults ? ` of ${searchResult.matchCount}` : ""}
          </span>
        </div>
        {hulls.length ? (
          searchResult.visibleHulls.length ? (
            <div className="fitting-hull-list">
              {searchResult.visibleHulls.map((hull) => {
                const selected = selectedHull?.typeId === hull.typeId;

                return (
                  <button
                    className="fitting-hull-result"
                    data-selected={selected}
                    key={hull.typeId}
                    onClick={() => onSelectHull(hull)}
                    type="button"
                  >
                    <span className="module-icon-block module-icon-block-small">
                      <ModuleIcon name="ship" size={18} />
                    </span>
                    <span className="fitting-hull-result-copy">
                      <strong>{hull.typeName}</strong>
                      <span>
                        {[hull.groupName, `Type ${hull.typeId}`]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="fitting-empty-note">No hulls match this search.</div>
          )
        ) : (
          <div className="fitting-empty-note">
            Fitting hull data is unavailable. Run the hull data refresh.
          </div>
        )}
      </section>

      <nav className="fitting-category-list" aria-label="Future fitting item categories">
        {itemCategories.slice(1).map((category) => (
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
        Ship results are capped at {resultLimit}. Refine search to narrow the
        hull index.
      </div>
    </aside>
  );
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
