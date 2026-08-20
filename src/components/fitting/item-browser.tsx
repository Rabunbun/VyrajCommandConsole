import { useEffect, useMemo, useState, useTransition } from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type {
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import type {
  FitModuleAttemptResult,
  FitOperationAttemptResult
} from "@/components/fitting/use-fitting-state";
import { ModuleIcon, type ModuleIconName } from "@/components/module-visuals";
import type { FittedModule } from "@/lib/fitting/fit-state";
import type {
  FittingHullSummary,
  FittingModuleSearchResponse,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

const initialHullResultLimit = 18;
const filteredHullResultLimit = 36;
const moduleResultLimit = 40;
const moduleSearchDebounceMs = 250;

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
  actionMode: ModuleActionMode;
  hulls: FittingHullSummary[];
  manipulationError: string | null;
  onClearSelectedSlot: () => void;
  onFitModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onRemoveModule: () => Promise<FitOperationAttemptResult>;
  onReplaceModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onReturnToActions: () => void;
  onSelectHull: (hull: FittingHullSummary) => void;
  onStartMove: () => void;
  onStartReplace: () => void;
  selectedHull: FittingHullSummary | null;
  selectedModule: FittedModule | null;
  selectedModuleName: string | null;
  selectedSlot: SelectedFittingSlot | null;
};

export function ItemBrowser({
  actionMode,
  hulls,
  manipulationError,
  onClearSelectedSlot,
  onFitModule,
  onRemoveModule,
  onReplaceModule,
  onReturnToActions,
  onSelectHull,
  onStartMove,
  onStartReplace,
  selectedHull,
  selectedModule,
  selectedModuleName,
  selectedSlot
}: ItemBrowserProps) {
  const [hullQuery, setHullQuery] = useState("");

  if (selectedSlot) {
    if (selectedModule) {
      if (actionMode === "replace") {
        return (
          <ModuleBrowser
            action="replace"
            key={`replace:${selectedSlot.rack}:${selectedSlot.index}`}
            onBack={onReturnToActions}
            onChooseModule={onReplaceModule}
            selectedSlot={selectedSlot}
          />
        );
      }

      return (
        <OccupiedModuleActions
          actionMode={actionMode}
          error={manipulationError}
          module={selectedModule}
          moduleName={selectedModuleName ?? `Module type ${selectedModule.typeId}`}
          onCancel={onClearSelectedSlot}
          onRemove={onRemoveModule}
          onStartMove={onStartMove}
          onStartReplace={onStartReplace}
          selectedSlot={selectedSlot}
        />
      );
    }

    return (
      <ModuleBrowser
        action="fit"
        key={`fit:${selectedSlot.rack}:${selectedSlot.index}`}
        onBack={onClearSelectedSlot}
        onChooseModule={onFitModule}
        selectedSlot={selectedSlot}
      />
    );
  }

  return (
    <HullBrowser
      hulls={hulls}
      onSelectHull={onSelectHull}
      query={hullQuery}
      selectedHull={selectedHull}
      setQuery={setHullQuery}
    />
  );
}

type HullBrowserProps = {
  hulls: FittingHullSummary[];
  onSelectHull: (hull: FittingHullSummary) => void;
  query: string;
  selectedHull: FittingHullSummary | null;
  setQuery: (query: string) => void;
};

function HullBrowser({
  hulls,
  onSelectHull,
  query,
  selectedHull,
  setQuery
}: HullBrowserProps) {
  const normalizedQuery = normalizeSearchText(query);
  const searchResult = useMemo(() => {
    const matches = normalizedQuery
      ? hulls.filter((hull) =>
          normalizeSearchText(`${hull.typeName} ${hull.groupName}`).includes(
            normalizedQuery
          )
        )
      : hulls;
    const limit = normalizedQuery
      ? filteredHullResultLimit
      : initialHullResultLimit;

    return {
      matchCount: matches.length,
      visibleHulls: matches.slice(0, limit)
    };
  }, [hulls, normalizedQuery]);
  const resultLimit = normalizedQuery
    ? filteredHullResultLimit
    : initialHullResultLimit;
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

type OccupiedModuleActionsProps = {
  actionMode: ModuleActionMode;
  error: string | null;
  module: FittedModule;
  moduleName: string;
  onCancel: () => void;
  onRemove: () => Promise<FitOperationAttemptResult>;
  onStartMove: () => void;
  onStartReplace: () => void;
  selectedSlot: SelectedFittingSlot;
};

function OccupiedModuleActions({
  actionMode,
  error,
  module,
  moduleName,
  onCancel,
  onRemove,
  onStartMove,
  onStartReplace,
  selectedSlot
}: OccupiedModuleActionsProps) {
  const [isRemoving, startRemovingTransition] = useTransition();
  const rackLabel = selectedSlot.rack.toLocaleUpperCase("en-US");

  return (
    <aside className="fitting-panel fitting-item-browser" aria-labelledby="item-library-title">
      <div className="fitting-panel-heading">
        <div>
          <h2 className="section-title" id="item-library-title">
            Item Library
          </h2>
          <div className="fitting-library-context">
            {rackLabel} SLOT {selectedSlot.index + 1}
          </div>
        </div>
        <button className="fitting-library-back" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>

      <div className="fitting-selected-module">
        <EveModuleIcon typeId={module.typeId} typeName={moduleName} />
        <div className="fitting-hull-result-copy">
          <strong>{moduleName}</strong>
          <span>Type {module.typeId}</span>
        </div>
      </div>

      <div className="fitting-module-actions" aria-label="Fitted module actions">
        <button
          disabled={isRemoving}
          onClick={() => {
            startRemovingTransition(async () => {
              await onRemove();
            });
          }}
          type="button"
        >
          {isRemoving ? "Removing..." : "Remove"}
        </button>
        <button disabled={isRemoving} onClick={onStartReplace} type="button">
          Replace
        </button>
        <button
          data-active={actionMode === "move"}
          disabled={isRemoving}
          onClick={onStartMove}
          type="button"
        >
          Move
        </button>
      </div>

      {actionMode === "move" ? (
        <div className="fitting-empty-note" data-tone="active">
          Select an empty {selectedSlot.rack} slot. The module instance will move
          without changing fitting resources.
        </div>
      ) : (
        <div className="fitting-empty-note">
          Remove the module, replace it through the rack-scoped browser, or move
          this exact instance within the same rack.
        </div>
      )}

      <div aria-live="polite">
        {error ? (
          <div className="fitting-empty-note" data-tone="error">
            {error}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

type ModuleBrowserProps = {
  action: "fit" | "replace";
  onBack: () => void;
  onChooseModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  selectedSlot: SelectedFittingSlot;
};

type ModuleSearchState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { results: FittingModuleSearchResult[]; status: "ready" };

function ModuleBrowser({
  action,
  onBack,
  onChooseModule,
  selectedSlot
}: ModuleBrowserProps) {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<ModuleSearchState>({
    status: "loading"
  });
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [pendingModule, setPendingModule] = useState<{
    message: string;
    typeId: number;
  } | null>(null);
  const [isFitting, startFittingTransition] = useTransition();
  const rackLabel = selectedSlot.rack.toLocaleUpperCase("en-US");
  const actionLabel = action === "replace" ? "Replace" : "Fit";

  useEffect(() => {
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(moduleResultLimit),
        q: query,
        rack: selectedSlot.rack
      });

      try {
        const response = await fetch(`/api/fitting/modules?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingModuleSearchResponse
          | { error?: string };

        if (!response.ok || !("results" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Module search is temporarily unavailable."
          );
        }

        setSearchState({ results: payload.results, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSearchState({
          message:
            error instanceof Error
              ? error.message
              : "Module search is temporarily unavailable.",
          status: "error"
        });
      }
    }, moduleSearchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [query, selectedSlot.rack]);

  function handleChooseModule(module: FittingModuleSearchResult) {
    setPlacementError(null);
    setPendingModule({
      message: `${action === "replace" ? "Replacing with" : "Fitting"} ${module.typeName}...`,
      typeId: module.typeId
    });

    startFittingTransition(async () => {
      try {
        const result = await onChooseModule(module.typeId);

        if (!result.ok) {
          setPlacementError(result.message);
        }
      } catch {
        setPlacementError(
          `The selected module could not be ${action === "replace" ? "used as a replacement" : "fitted"}.`
        );
      } finally {
        setPendingModule(null);
      }
    });
  }

  return (
    <aside className="fitting-panel fitting-item-browser" aria-labelledby="item-library-title">
      <div className="fitting-panel-heading">
        <div>
          <h2 className="section-title" id="item-library-title">
            Item Library
          </h2>
          <div className="fitting-library-context">
            {action === "replace" ? "REPLACE " : ""}{rackLabel} SLOT {selectedSlot.index + 1}
          </div>
        </div>
        <button className="fitting-library-back" onClick={onBack} type="button">
          {action === "replace" ? "Actions" : "Ships"}
        </button>
      </div>

      <label className="field-stack">
        <span className="field-label">Search modules</span>
        <input
          autoFocus
          className="text-input fitting-search-input"
          placeholder={`Search ${rackLabel.toLocaleLowerCase("en-US")} slot modules...`}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchState({ status: "loading" });
          }}
          type="search"
          value={query}
        />
      </label>

      <section
        className="fitting-module-results"
        aria-label={`${rackLabel} module search results`}
      >
        <div className="fitting-panel-heading">
          <h3 className="fit-stat-title">{rackLabel} Modules</h3>
          <span className="card-copy">Up to {moduleResultLimit}</span>
        </div>
        <div aria-live="polite">
          {searchState.status === "loading" ? (
            <div className="fitting-empty-note">Searching module cache...</div>
          ) : null}
          {searchState.status === "error" ? (
            <div className="fitting-empty-note" data-tone="error">
              {searchState.message}
            </div>
          ) : null}
          {searchState.status === "ready" ? (
            searchState.results.length ? (
              <div className="fitting-module-list">
                {searchState.results.map((module) => (
                  <button
                    aria-label={`${actionLabel} ${module.typeName} in ${rackLabel} slot ${selectedSlot.index + 1}`}
                    className="fitting-module-result"
                    data-pending={isFitting && pendingModule?.typeId === module.typeId}
                    disabled={isFitting}
                    key={module.typeId}
                    onClick={() => handleChooseModule(module)}
                    type="button"
                  >
                    <EveModuleIcon typeId={module.typeId} typeName={module.typeName} />
                    <div className="fitting-hull-result-copy">
                      <strong>{module.typeName}</strong>
                      <span>{formatModuleMetadata(module)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="fitting-empty-note">
                {query.trim()
                  ? `No ${rackLabel.toLocaleLowerCase("en-US")} modules match this search.`
                  : `No ${rackLabel.toLocaleLowerCase("en-US")} modules are available. The module cache may be empty.`}
              </div>
            )
          ) : null}
        </div>
      </section>

      <div aria-live="polite">
        {isFitting && pendingModule ? (
          <div className="fitting-empty-note">{pendingModule.message}</div>
        ) : null}
        {placementError ? (
          <div className="fitting-empty-note" data-tone="error">
            {placementError}
          </div>
        ) : null}
      </div>

      <div className="fitting-empty-note">
        Hard fitting restrictions are enforced. CPU, powergrid, and calibration
        are shown as base / unmodified warnings and do not block placement.
      </div>
    </aside>
  );
}

function formatModuleMetadata(module: FittingModuleSearchResult) {
  return [
    module.groupName,
    module.metaGroupName,
    module.techLevel ? `Tech ${module.techLevel}` : null
  ]
    .filter(Boolean)
    .join(" / ");
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
