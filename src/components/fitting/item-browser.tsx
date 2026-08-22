import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type {
  FittingBrowserSection,
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import type {
  DroneBayAttemptResult,
  FitModuleAttemptResult,
  FitOperationAttemptResult,
  LoadChargeAttemptResult
} from "@/components/fitting/use-fitting-state";
import { ModuleIcon } from "@/components/module-visuals";
import type { FittedModule } from "@/lib/fitting/fit-state";
import type {
  BrowsableFittingRack,
  DroneBayAnalysis,
  FittingChargeSearchResponse,
  FittingChargeSearchResult,
  FittingDroneSearchResponse,
  FittingDroneSearchResult,
  FittingHullSummary,
  FittingModuleSearchResponse,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

const moduleResultLimit = 40;
const chargeResultLimit = 40;
const droneResultLimit = 200;
const searchDebounceMs = 250;
const shipMarketRootName = "Ships";
const specialEditionMarketGroupName = "Special Edition Ships";
const hullHierarchyCollator = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base"
});
const browserRacks: Array<{ label: string; rack: BrowsableFittingRack }> = [
  { label: "High", rack: "high" },
  { label: "Mid", rack: "mid" },
  { label: "Low", rack: "low" },
  { label: "Rig", rack: "rig" }
];

type ItemBrowserProps = {
  actionMode: ModuleActionMode;
  browserRack: BrowsableFittingRack;
  droneBayAnalysis: DroneBayAnalysis;
  draggingModuleTypeId: number | null;
  hulls: FittingHullSummary[];
  manipulationError: string | null;
  onAutoFitModule: (
    module: FittingModuleSearchResult
  ) => Promise<FitModuleAttemptResult>;
  onAddDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onClearSelectedSlot: () => void;
  onDecrementDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onFitModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onLoadCharge: (typeId: number) => Promise<LoadChargeAttemptResult>;
  onModuleDragEnd: () => void;
  onModuleDragStart: (module: FittingModuleSearchResult) => void;
  onModuleRackChange: (rack: BrowsableFittingRack) => void;
  onRemoveModule: () => Promise<FitOperationAttemptResult>;
  onRemoveDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onReplaceModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onReturnToActions: () => void;
  onSelectHull: (hull: FittingHullSummary) => void;
  onStartMove: () => void;
  onStartReplace: () => void;
  onToggleSection: (section: FittingBrowserSection) => void;
  onUnloadCharge: () => FitOperationAttemptResult;
  openSections: Record<FittingBrowserSection, boolean>;
  selectedHull: FittingHullSummary | null;
  selectedChargeName: string | null;
  selectedModule: FittedModule | null;
  selectedModuleName: string | null;
  selectedSlot: SelectedFittingSlot | null;
};

export function ItemBrowser({
  actionMode,
  browserRack,
  droneBayAnalysis,
  draggingModuleTypeId,
  hulls,
  manipulationError,
  onAutoFitModule,
  onAddDrone,
  onClearSelectedSlot,
  onDecrementDrone,
  onFitModule,
  onLoadCharge,
  onModuleDragEnd,
  onModuleDragStart,
  onModuleRackChange,
  onRemoveModule,
  onRemoveDrone,
  onReplaceModule,
  onReturnToActions,
  onSelectHull,
  onStartMove,
  onStartReplace,
  onToggleSection,
  onUnloadCharge,
  openSections,
  selectedHull,
  selectedChargeName,
  selectedModule,
  selectedModuleName,
  selectedSlot
}: ItemBrowserProps) {
  const [hullQuery, setHullQuery] = useState("");
  const [moduleQuery, setModuleQuery] = useState("");
  const [chargeQuery, setChargeQuery] = useState("");
  const [droneQuery, setDroneQuery] = useState("");
  const [collapsedModuleGroups, setCollapsedModuleGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedChargeGroups, setCollapsedChargeGroups] = useState<Set<string>>(
    () => new Set()
  );
  const selectedRack = selectedSlot?.rack ?? null;
  const replacementActive = actionMode === "replace" && Boolean(selectedModule);
  const lockedModuleRack =
    selectedRack && (!selectedModule || replacementActive) ? selectedRack : null;

  function toggleCollapsedGroup(
    setCollapsedGroups: React.Dispatch<React.SetStateAction<Set<string>>>,
    groupKey: string
  ) {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  }

  return (
    <aside
      className="fitting-panel fitting-item-browser"
      aria-labelledby="item-library-title"
    >
      <div className="fitting-panel-heading">
        <div>
          <h2 className="section-title" id="item-library-title">
            Item Library
          </h2>
          <div className="fitting-library-context">PERSISTENT FITTING INDEX</div>
        </div>
        <span className="badge" data-state={hulls.length ? "ACTIVE" : "WARNING"}>
          {hulls.length ? `${hulls.length} Hulls` : "No Hull Data"}
        </span>
      </div>

      {selectedSlot ? (
        selectedModule ? (
          <OccupiedModuleActions
            actionMode={actionMode}
            error={manipulationError}
            module={selectedModule}
            moduleName={selectedModuleName ?? `Module type ${selectedModule.typeId}`}
            onCancel={onClearSelectedSlot}
            onRemove={onRemoveModule}
            onReturnToActions={onReturnToActions}
            onStartMove={onStartMove}
            onStartReplace={onStartReplace}
            selectedSlot={selectedSlot}
          />
        ) : (
          <div className="fitting-browser-context-bar" data-tone="target">
            <span>
              {selectedSlot.rack.toLocaleUpperCase("en-US")} SLOT {selectedSlot.index + 1}
            </span>
            <button onClick={onClearSelectedSlot} type="button">
              Clear target
            </button>
          </div>
        )
      ) : null}

      <PersistentBrowserSection
        badge="Ships"
        description="Hull selection and future saved fits"
        id="fitting-browser-hulls"
        onToggle={() => onToggleSection("hulls")}
        open={openSections.hulls}
        title="Hulls & Fits"
      >
        <HullBrowser
          hulls={hulls}
          onSelectHull={onSelectHull}
          query={hullQuery}
          selectedHull={selectedHull}
          setQuery={setHullQuery}
        />
      </PersistentBrowserSection>

      <PersistentBrowserSection
        badge={browserRack.toLocaleUpperCase("en-US")}
        description="Rack-scoped ship modules"
        id="fitting-browser-modules"
        onToggle={() => onToggleSection("modules")}
        open={openSections.modules}
        title="Modules"
      >
        <div className="fitting-browser-rack-tabs" aria-label="Module rack filter">
          {browserRacks.map(({ label, rack }) => (
            <button
              aria-pressed={browserRack === rack}
              disabled={Boolean(lockedModuleRack && lockedModuleRack !== rack)}
              key={rack}
              onClick={() => onModuleRackChange(rack)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <ModuleBrowser
          action={replacementActive ? "replace" : "fit"}
          active={openSections.modules}
          collapsedGroups={collapsedModuleGroups}
          draggingModuleTypeId={draggingModuleTypeId}
          onAutoFitModule={onAutoFitModule}
          onChooseModule={replacementActive ? onReplaceModule : onFitModule}
          onModuleDragEnd={onModuleDragEnd}
          onModuleDragStart={onModuleDragStart}
          onToggleGroup={(groupKey) =>
            toggleCollapsedGroup(setCollapsedModuleGroups, groupKey)
          }
          query={moduleQuery}
          rack={browserRack}
          selectedSlot={selectedSlot}
          setQuery={setModuleQuery}
        />
      </PersistentBrowserSection>

      <PersistentBrowserSection
        badge={selectedModule ? "Context" : "Select module"}
        description="Compatible reloadable charges"
        id="fitting-browser-charges"
        onToggle={() => onToggleSection("charges")}
        open={openSections.charges}
        title="Charges"
      >
        <ChargeBrowser
          active={openSections.charges}
          collapsedGroups={collapsedChargeGroups}
          onLoadCharge={onLoadCharge}
          onToggleGroup={(groupKey) =>
            toggleCollapsedGroup(setCollapsedChargeGroups, groupKey)
          }
          onUnloadCharge={onUnloadCharge}
          query={chargeQuery}
          selectedChargeName={selectedChargeName}
          selectedModule={selectedModule}
          setQuery={setChargeQuery}
        />
      </PersistentBrowserSection>

      <PersistentBrowserSection
        badge={
          droneBayAnalysis.entries.length
            ? `${droneBayAnalysis.entries.reduce(
                (total, entry) => total + entry.quantity,
                0
              )} Carried`
            : "Empty"
        }
        description="Carried inventory and authoritative drone index"
        id="fitting-browser-drones"
        onToggle={() => onToggleSection("drones")}
        open={openSections.drones}
        title="Drones"
      >
        <DroneBrowser
          active={openSections.drones}
          analysis={droneBayAnalysis}
          onAddDrone={onAddDrone}
          onDecrementDrone={onDecrementDrone}
          onRemoveDrone={onRemoveDrone}
          query={droneQuery}
          selectedHull={selectedHull}
          setQuery={setDroneQuery}
        />
      </PersistentBrowserSection>
    </aside>
  );
}

type PersistentBrowserSectionProps = {
  badge: string;
  children: React.ReactNode;
  description: string;
  id: string;
  onToggle: () => void;
  open: boolean;
  title: string;
};

function PersistentBrowserSection({
  badge,
  children,
  description,
  id,
  onToggle,
  open,
  title
}: PersistentBrowserSectionProps) {
  return (
    <section className="fitting-browser-section" data-open={open}>
      <button
        aria-controls={`${id}-content`}
        aria-expanded={open}
        className="fitting-browser-section-toggle"
        id={`${id}-toggle`}
        onClick={onToggle}
        type="button"
      >
        <span aria-hidden="true" className="fitting-browser-chevron">
          {open ? "−" : "+"}
        </span>
        <span className="fitting-browser-section-copy">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span className="fitting-browser-section-badge">{badge}</span>
      </button>
      <div
        aria-labelledby={`${id}-toggle`}
        className="fitting-browser-section-content"
        hidden={!open}
        id={`${id}-content`}
      >
        {children}
      </div>
    </section>
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
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const normalizedQuery = normalizeSearchText(query);
  const hierarchy = useMemo(() => {
    const matches = normalizedQuery
      ? hulls.filter((hull) =>
          normalizeSearchText(
            [
              hull.typeName,
              hull.groupName,
              hull.marketGroupName,
              ...hull.marketGroupPathNames
            ]
              .filter(Boolean)
              .join(" ")
          ).includes(normalizedQuery)
        )
      : hulls;

    return {
      families: buildHullHierarchy(matches),
      matchCount: matches.length
    };
  }, [hulls, normalizedQuery]);
  const searchActive = Boolean(normalizedQuery);

  function toggleExpanded(
    setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string
  ) {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  return (
    <>
      <label className="field-stack">
        <span className="field-label">Search hulls</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search hull, class, or market family..."
          type="search"
          value={query}
        />
      </label>

      <section className="fitting-hull-results" aria-label="Ship hull search results">
        <div className="fitting-panel-heading">
          <h3 className="fit-stat-title">Ships</h3>
          <span className="card-copy">
            {searchActive
              ? `Showing ${hierarchy.matchCount} of ${hulls.length}`
              : `${hulls.length} published hulls`}
          </span>
        </div>
        {hulls.length ? (
          hierarchy.matchCount ? (
            <div className="fitting-hull-list">
              {hierarchy.families.map((family) => {
                const familyExpanded =
                  searchActive || expandedFamilies.has(family.key);
                return (
                  <section className="fitting-hull-family" key={family.key}>
                    <button
                      aria-expanded={familyExpanded}
                      className="fitting-hull-family-toggle"
                      onClick={() =>
                        toggleExpanded(setExpandedFamilies, family.key)
                      }
                      type="button"
                    >
                      <span aria-hidden="true">
                        {familyExpanded ? "−" : "+"}
                      </span>
                      <strong>{family.label}</strong>
                      <small>{family.hullCount}</small>
                    </button>
                    {familyExpanded ? (
                      <div className="fitting-hull-family-children">
                        {family.groups.map((group) => {
                          const groupExpanded =
                            searchActive || expandedGroups.has(group.key);

                          return (
                            <section className="fitting-hull-group" key={group.key}>
                              <button
                                aria-expanded={groupExpanded}
                                className="fitting-hull-group-toggle"
                                onClick={() =>
                                  toggleExpanded(setExpandedGroups, group.key)
                                }
                                type="button"
                              >
                                <span aria-hidden="true">
                                  {groupExpanded ? "−" : "+"}
                                </span>
                                <strong>{group.label}</strong>
                                <small>{group.hulls.length}</small>
                              </button>
                              {groupExpanded ? (
                                <div className="fitting-hull-group-children">
                                  {group.hulls.map((hull) => {
                                    const selected =
                                      selectedHull?.typeId === hull.typeId;

                                    return (
                                      <button
                                        className="fitting-hull-result"
                                        data-selected={selected}
                                        key={hull.typeId}
                                        onClick={() => onSelectHull(hull)}
                                        type="button"
                                      >
                                        <EveModuleIcon
                                          typeId={hull.typeId}
                                          typeName={hull.typeName}
                                        />
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
                              ) : null}
                            </section>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
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

      <div className="fitting-browser-placeholder" aria-disabled="true">
        <ModuleIcon name="doctrine" size={16} />
        <span>
          <strong>Saved Fits</strong>
          <small>Persistence is planned for a later mission.</small>
        </span>
      </div>
    </>
  );
}

type HullHierarchyFamily = {
  groups: HullHierarchyGroup[];
  hullCount: number;
  key: string;
  label: string;
  specialEdition: boolean;
};

type HullHierarchyGroup = {
  hulls: FittingHullSummary[];
  key: string;
  label: string;
};

function buildHullHierarchy(hulls: FittingHullSummary[]): HullHierarchyFamily[] {
  const families = new Map<
    string,
    {
      groups: Map<string, HullHierarchyGroup>;
      key: string;
      label: string;
      specialEdition: boolean;
    }
  >();

  for (const hull of hulls) {
    const familyIdentity = getHullFamilyIdentity(hull);
    let family = families.get(familyIdentity.key);

    if (!family) {
      family = {
        groups: new Map(),
        key: familyIdentity.key,
        label: familyIdentity.label,
        specialEdition: familyIdentity.specialEdition
      };
      families.set(familyIdentity.key, family);
    }

    const groupLabel = hull.groupName || "Other Ship Class";
    const groupIdentity = `group:${hull.groupId ?? groupLabel}`;
    const groupKey = `${familyIdentity.key}:${groupIdentity}`;
    let group = family.groups.get(groupKey);

    if (!group) {
      group = {
        hulls: [],
        key: groupKey,
        label: groupLabel
      };
      family.groups.set(groupKey, group);
    }

    group.hulls.push(hull);
  }

  return Array.from(families.values())
    .map((family) => {
      const groups = Array.from(family.groups.values())
        .map((group) => ({
          ...group,
          hulls: group.hulls.toSorted((left, right) =>
            hullHierarchyCollator.compare(left.typeName, right.typeName)
          )
        }))
        .toSorted((left, right) =>
          hullHierarchyCollator.compare(left.label, right.label)
        );

      return {
        groups,
        hullCount: groups.reduce((count, group) => count + group.hulls.length, 0),
        key: family.key,
        label: family.label,
        specialEdition: family.specialEdition
      };
    })
    .toSorted((left, right) => {
      if (left.specialEdition !== right.specialEdition) {
        return left.specialEdition ? 1 : -1;
      }

      if (left.label === "Other Ships" || right.label === "Other Ships") {
        return left.label === "Other Ships" ? 1 : -1;
      }

      return hullHierarchyCollator.compare(left.label, right.label);
    });
}

function getHullFamilyIdentity(hull: FittingHullSummary) {
  const specialEditionIndex = hull.marketGroupPathNames.indexOf(
    specialEditionMarketGroupName
  );

  if (specialEditionIndex >= 0) {
    return {
      key: getMarketHierarchyKey(hull, specialEditionIndex),
      label: specialEditionMarketGroupName,
      specialEdition: true
    };
  }

  const shipsIndex = hull.marketGroupPathNames.indexOf(shipMarketRootName);
  const familyIndex =
    shipsIndex >= 0 && shipsIndex + 1 < hull.marketGroupPathNames.length
      ? shipsIndex + 1
      : hull.marketGroupPathNames.length
        ? 0
        : -1;

  if (familyIndex >= 0) {
    return {
      key: getMarketHierarchyKey(hull, familyIndex),
      label: hull.marketGroupPathNames[familyIndex],
      specialEdition: false
    };
  }

  return {
    key: "unclassified-ships",
    label: "Other Ships",
    specialEdition: false
  };
}

function getMarketHierarchyKey(hull: FittingHullSummary, pathIndex: number) {
  const marketGroupId = hull.marketGroupPathIds[pathIndex];

  return typeof marketGroupId === "number"
    ? `market:${marketGroupId}`
    : `market-name:${hull.marketGroupPathNames[pathIndex]}`;
}

type OccupiedModuleActionsProps = {
  actionMode: ModuleActionMode;
  error: string | null;
  module: FittedModule;
  moduleName: string;
  onCancel: () => void;
  onRemove: () => Promise<FitOperationAttemptResult>;
  onReturnToActions: () => void;
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
  onReturnToActions,
  onStartMove,
  onStartReplace,
  selectedSlot
}: OccupiedModuleActionsProps) {
  const [isRemoving, startRemovingTransition] = useTransition();
  const rackLabel = selectedSlot.rack.toLocaleUpperCase("en-US");

  return (
    <section className="fitting-selected-context" aria-label="Selected module actions">
      <div className="fitting-browser-context-bar" data-tone="occupied">
        <span>
          {actionMode === "replace" ? "REPLACE " : ""}
          {rackLabel} SLOT {selectedSlot.index + 1}
        </span>
        <button
          onClick={actionMode === "replace" ? onReturnToActions : onCancel}
          type="button"
        >
          {actionMode === "replace" ? "Actions" : "Clear"}
        </button>
      </div>
      <div className="fitting-selected-module">
        <EveModuleIcon typeId={module.typeId} typeName={moduleName} />
        <div className="fitting-hull-result-copy">
          <strong>{moduleName}</strong>
          <span>Type {module.typeId}</span>
        </div>
      </div>
      <div className="fitting-module-actions">
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
        <button
          data-active={actionMode === "replace"}
          disabled={isRemoving}
          onClick={onStartReplace}
          type="button"
        >
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
          Select an empty {selectedSlot.rack} slot to move this module instance.
        </div>
      ) : null}
      {actionMode === "replace" ? (
        <div className="fitting-empty-note" data-tone="active">
          Choose a replacement from the locked {selectedSlot.rack} module rack.
        </div>
      ) : null}
      {error ? (
        <div className="fitting-empty-note" data-tone="error" aria-live="polite">
          {error}
        </div>
      ) : null}
    </section>
  );
}

type ModuleBrowserProps = {
  action: "fit" | "replace";
  active: boolean;
  collapsedGroups: Set<string>;
  draggingModuleTypeId: number | null;
  onAutoFitModule: (
    module: FittingModuleSearchResult
  ) => Promise<FitModuleAttemptResult>;
  onChooseModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onModuleDragEnd: () => void;
  onModuleDragStart: (module: FittingModuleSearchResult) => void;
  onToggleGroup: (groupKey: string) => void;
  query: string;
  rack: BrowsableFittingRack;
  selectedSlot: SelectedFittingSlot | null;
  setQuery: (query: string) => void;
};

type ModuleSearchState =
  | { status: "loading" }
  | { message: string; requestKey: string; status: "error" }
  | {
      requestKey: string;
      results: FittingModuleSearchResult[];
      status: "ready";
    };

function ModuleBrowser({
  action,
  active,
  collapsedGroups,
  draggingModuleTypeId,
  onAutoFitModule,
  onChooseModule,
  onModuleDragEnd,
  onModuleDragStart,
  onToggleGroup,
  query,
  rack,
  selectedSlot,
  setQuery
}: ModuleBrowserProps) {
  const [searchState, setSearchState] = useState<ModuleSearchState>({
    status: "loading"
  });
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [pendingModule, setPendingModule] = useState<{
    message: string;
    typeId: number;
  } | null>(null);
  const [isFitting, startFittingTransition] = useTransition();
  const singleClickTimeoutRef = useRef<number | null>(null);
  const requestKey = `${rack}:${query}`;
  const currentSearchState =
    searchState.status !== "loading" && searchState.requestKey === requestKey
      ? searchState
      : ({ status: "loading" } as const);
  const rackLabel = rack.toLocaleUpperCase("en-US");
  const groupedModules =
    currentSearchState.status === "ready"
      ? groupModules(currentSearchState.results)
      : [];

  useEffect(() => {
    if (!active) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(moduleResultLimit),
        q: query,
        rack
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

        setSearchState({
          requestKey,
          results: payload.results,
          status: "ready"
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSearchState({
          message:
            error instanceof Error
              ? error.message
              : "Module search is temporarily unavailable.",
          requestKey,
          status: "error"
        });
      }
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [active, query, rack, requestKey]);

  useEffect(
    () => () => {
      if (singleClickTimeoutRef.current !== null) {
        window.clearTimeout(singleClickTimeoutRef.current);
      }
    },
    []
  );

  function handleChooseModule(
    module: FittingModuleSearchResult,
    mode: "auto" | "targeted" = "targeted"
  ) {
    setPlacementError(null);
    setPendingModule({
      message:
        mode === "auto"
          ? `Auto-fitting ${module.typeName}...`
          : `${action === "replace" ? "Replacing with" : "Fitting"} ${module.typeName}...`,
      typeId: module.typeId
    });

    startFittingTransition(async () => {
      try {
        const result =
          mode === "auto"
            ? await onAutoFitModule(module)
            : await onChooseModule(module.typeId);

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

  function handleModuleClick(
    module: FittingModuleSearchResult,
    clickDetail: number
  ) {
    if (action !== "fit" || clickDetail === 0) {
      handleChooseModule(module);
      return;
    }

    if (singleClickTimeoutRef.current !== null) {
      window.clearTimeout(singleClickTimeoutRef.current);
    }

    singleClickTimeoutRef.current = window.setTimeout(() => {
      singleClickTimeoutRef.current = null;
      handleChooseModule(module);
    }, 220);
  }

  function handleModuleDoubleClick(module: FittingModuleSearchResult) {
    if (action !== "fit") {
      return;
    }

    if (singleClickTimeoutRef.current !== null) {
      window.clearTimeout(singleClickTimeoutRef.current);
      singleClickTimeoutRef.current = null;
    }

    handleChooseModule(module, "auto");
  }

  return (
    <div className="fitting-browser-index">
      <label className="field-stack">
        <span className="field-label">Search {rackLabel} modules</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${rack} modules or groups...`}
          type="search"
          value={query}
        />
      </label>

      <div className="fitting-browser-result-heading">
        <span>
          {action === "replace"
            ? `Replacement for ${rackLabel} slot ${(selectedSlot?.index ?? 0) + 1}`
            : selectedSlot
              ? `Target ${rackLabel} slot ${selectedSlot.index + 1}`
              : `${rackLabel} module index`}
        </span>
        <small>Up to {moduleResultLimit}</small>
      </div>

      <div className="fitting-browser-scroll-region" aria-live="polite">
        {currentSearchState.status === "loading" ? (
          <div className="fitting-empty-note">Searching module cache...</div>
        ) : null}
        {currentSearchState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {currentSearchState.message}
          </div>
        ) : null}
        {currentSearchState.status === "ready" ? (
          groupedModules.length ? (
            <div className="fitting-browser-groups">
              {groupedModules.map((group) => {
                const groupKey = `module:${rack}:${group.groupId}`;
                const collapsed = collapsedGroups.has(groupKey);

                return (
                  <BrowserResultGroup
                    collapsed={collapsed}
                    count={group.items.length}
                    groupKey={groupKey}
                    key={groupKey}
                    label={group.groupName}
                    onToggle={onToggleGroup}
                  >
                    <div className="fitting-module-list">
                      {group.items.map((module) => (
                        <button
                          aria-label={getModuleActionLabel(
                            action,
                            module,
                            selectedSlot
                          )}
                          className="fitting-module-result"
                          data-dragging={draggingModuleTypeId === module.typeId}
                          data-pending={
                            isFitting && pendingModule?.typeId === module.typeId
                          }
                          disabled={isFitting}
                          draggable={action === "fit" && !isFitting}
                          key={module.typeId}
                          onClick={(event) =>
                            handleModuleClick(module, event.detail)
                          }
                          onDoubleClick={() => handleModuleDoubleClick(module)}
                          onDragEnd={onModuleDragEnd}
                          onDragStart={(event) => {
                            if (action !== "fit") {
                              event.preventDefault();
                              return;
                            }

                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData(
                              "text/plain",
                              `fitting-module:${module.typeId}`
                            );
                            onModuleDragStart(module);
                          }}
                          title={
                            action === "fit"
                              ? "Click for the selected socket, double-click to auto-fit, or drag to an exact socket."
                              : "Use as the selected socket replacement."
                          }
                          type="button"
                        >
                          <EveModuleIcon
                            typeId={module.typeId}
                            typeName={module.typeName}
                          />
                          <span className="fitting-hull-result-copy">
                            <strong>{module.typeName}</strong>
                            <span>{formatModuleMetadata(module)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </BrowserResultGroup>
                );
              })}
            </div>
          ) : (
            <div className="fitting-empty-note">
              {query.trim()
                ? `No ${rack} modules match this search.`
                : `No ${rack} modules are available. The module cache may be empty.`}
            </div>
          )
        ) : null}
      </div>

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
    </div>
  );
}

type ChargeBrowserProps = {
  active: boolean;
  collapsedGroups: Set<string>;
  onLoadCharge: (typeId: number) => Promise<LoadChargeAttemptResult>;
  onToggleGroup: (groupKey: string) => void;
  onUnloadCharge: () => FitOperationAttemptResult;
  query: string;
  selectedChargeName: string | null;
  selectedModule: FittedModule | null;
  setQuery: (query: string) => void;
};

type ChargeSearchState =
  | { status: "idle" }
  | { requestKey: string; status: "loading" }
  | { message: string; requestKey: string; status: "error" }
  | {
      requestKey: string;
      response: FittingChargeSearchResponse;
      status: "ready";
    };

function ChargeBrowser({
  active,
  collapsedGroups,
  onLoadCharge,
  onToggleGroup,
  onUnloadCharge,
  query,
  selectedChargeName,
  selectedModule,
  setQuery
}: ChargeBrowserProps) {
  const [searchState, setSearchState] = useState<ChargeSearchState>({
    status: "idle"
  });
  const [pendingChargeTypeId, setPendingChargeTypeId] = useState<number | null>(
    null
  );
  const [chargeFeedback, setChargeFeedback] = useState<
    {
      message: string;
      moduleTypeId: number;
      tone: "error" | "success";
    } | null
  >(null);
  const moduleTypeId = selectedModule?.typeId ?? null;
  const requestKey = moduleTypeId ? `${moduleTypeId}:${query}` : "idle";
  const currentSearchState =
    searchState.status !== "idle" && searchState.requestKey === requestKey
      ? searchState
      : moduleTypeId
        ? ({ requestKey, status: "loading" } as const)
        : ({ status: "idle" } as const);
  const groupedCharges =
    currentSearchState.status === "ready"
      ? groupCharges(currentSearchState.response.results)
      : [];
  const currentChargeFeedback =
    chargeFeedback?.moduleTypeId === moduleTypeId ? chargeFeedback : null;

  useEffect(() => {
    if (!active || !moduleTypeId) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(chargeResultLimit),
        moduleTypeId: String(moduleTypeId),
        q: query
      });

      try {
        const response = await fetch(`/api/fitting/charges?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingChargeSearchResponse
          | { error?: string };

        if (!response.ok || !("results" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Charge search is temporarily unavailable."
          );
        }

        setSearchState({ requestKey, response: payload, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSearchState({
          message:
            error instanceof Error
              ? error.message
              : "Charge search is temporarily unavailable.",
          requestKey,
          status: "error"
        });
      }
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [active, moduleTypeId, query, requestKey]);

  if (!selectedModule) {
    return (
      <div className="fitting-empty-note">
        Select a fitted, charge-capable module to browse compatible charges.
      </div>
    );
  }

  const handleLoadCharge = async (charge: FittingChargeSearchResult) => {
    setPendingChargeTypeId(charge.typeId);
    setChargeFeedback(null);
    const result = await onLoadCharge(charge.typeId);

    setPendingChargeTypeId(null);
    setChargeFeedback(
      result.ok
        ? {
            message: `Loaded ${result.charge.quantity.toLocaleString("en-US")} × ${result.charge.typeName}.`,
            moduleTypeId: selectedModule.typeId,
            tone: "success"
          }
        : {
            message: result.message,
            moduleTypeId: selectedModule.typeId,
            tone: "error"
          }
    );
  };

  const handleUnloadCharge = () => {
    const result = onUnloadCharge();

    setChargeFeedback(
      result.ok
        ? {
            message: "Charge unloaded.",
            moduleTypeId: selectedModule.typeId,
            tone: "success"
          }
        : {
            message: result.message,
            moduleTypeId: selectedModule.typeId,
            tone: "error"
          }
    );
  };

  return (
    <div className="fitting-browser-index">
      {selectedModule.charge ? (
        <div className="fitting-loaded-charge-summary">
          <EveModuleIcon
            typeId={selectedModule.charge.typeId}
            typeName={selectedChargeName ?? `Charge type ${selectedModule.charge.typeId}`}
          />
          <span>
            <small>Loaded charge</small>
            <strong>
              {selectedChargeName ?? `Charge type ${selectedModule.charge.typeId}`}
            </strong>
            <span>
              {selectedModule.charge.quantity.toLocaleString("en-US")} rounds
            </span>
          </span>
          <button
            disabled={pendingChargeTypeId !== null}
            onClick={handleUnloadCharge}
            type="button"
          >
            Unload
          </button>
        </div>
      ) : null}

      <label className="field-stack">
        <span className="field-label">Search compatible charges</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search charge name, group, or market group..."
          type="search"
          value={query}
        />
      </label>

      <div className="fitting-browser-scroll-region" aria-live="polite">
        {currentSearchState.status === "loading" ? (
          <div className="fitting-empty-note">Resolving module compatibility...</div>
        ) : null}
        {currentSearchState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {currentSearchState.message}
          </div>
        ) : null}
        {currentSearchState.status === "ready" ? (
          !currentSearchState.response.module.chargeCapable ? (
            <div className="fitting-empty-note">
              {currentSearchState.response.module.typeName} does not accept
              reloadable charges.
            </div>
          ) : (
            <>
              <div className="fitting-browser-result-heading">
                <span>{currentSearchState.response.module.typeName}</span>
                <small>
                  Capacity {formatVolume(currentSearchState.response.module.capacity)}
                </small>
              </div>
              {groupedCharges.length ? (
                <div className="fitting-browser-groups">
                  {groupedCharges.map((group) => {
                    const groupKey = `charge:${group.groupId}`;
                    const collapsed = collapsedGroups.has(groupKey);

                    return (
                      <BrowserResultGroup
                        collapsed={collapsed}
                        count={group.items.length}
                        groupKey={groupKey}
                        key={groupKey}
                        label={group.groupName}
                        onToggle={onToggleGroup}
                      >
                        <div className="fitting-charge-list">
                          {group.items.map((charge) => (
                            <article
                              className="fitting-charge-result"
                              data-loaded={
                                selectedModule.charge?.typeId === charge.typeId
                              }
                              key={charge.typeId}
                            >
                              <EveModuleIcon
                                typeId={charge.typeId}
                                typeName={charge.typeName}
                              />
                              <span className="fitting-hull-result-copy">
                                <strong>{charge.typeName}</strong>
                                <span>{formatChargeMetadata(charge)}</span>
                              </span>
                              <button
                                aria-label={`Load ${charge.typeName} into ${currentSearchState.response.module.typeName}`}
                                disabled={pendingChargeTypeId !== null}
                                onClick={() => void handleLoadCharge(charge)}
                                type="button"
                              >
                                {pendingChargeTypeId === charge.typeId
                                  ? "Loading..."
                                  : selectedModule.charge?.typeId === charge.typeId
                                    ? "Reload"
                                    : "Load"}
                              </button>
                            </article>
                          ))}
                        </div>
                      </BrowserResultGroup>
                    );
                  })}
                </div>
              ) : (
                <div className="fitting-empty-note">
                  {query.trim()
                    ? "No compatible charges match this search."
                    : "No compatible charges fit this module's authoritative group, size, and capacity constraints."}
                </div>
              )}
            </>
          )
        ) : null}
      </div>

      <div aria-live="polite">
        {currentChargeFeedback ? (
          <div
            className="fitting-empty-note"
            data-tone={currentChargeFeedback.tone}
          >
            {currentChargeFeedback.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type DroneBrowserProps = {
  active: boolean;
  analysis: DroneBayAnalysis;
  onAddDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onDecrementDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onRemoveDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  query: string;
  selectedHull: FittingHullSummary | null;
  setQuery: (query: string) => void;
};

type DroneSearchState =
  | { status: "loading" }
  | { message: string; requestKey: string; status: "error" }
  | {
      requestKey: string;
      response: FittingDroneSearchResponse;
      status: "ready";
    };

function DroneBrowser({
  active,
  analysis,
  onAddDrone,
  onDecrementDrone,
  onRemoveDrone,
  query,
  selectedHull,
  setQuery
}: DroneBrowserProps) {
  const [searchState, setSearchState] = useState<DroneSearchState>({
    status: "loading"
  });
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set()
  );
  const selectedHullTypeId = selectedHull?.typeId ?? null;
  const [pendingDroneOperation, setPendingDroneOperation] = useState<{
    hullTypeId: number | null;
    typeId: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    hullTypeId: number | null;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const selectedHullTypeIdRef = useRef(selectedHullTypeId);
  const pendingDroneTypeId =
    pendingDroneOperation?.hullTypeId === selectedHullTypeId
      ? pendingDroneOperation.typeId
      : null;
  const currentFeedback =
    feedback?.hullTypeId === selectedHullTypeId ? feedback : null;
  const requestKey = query;
  const currentSearchState =
    searchState.status !== "loading" && searchState.requestKey === requestKey
      ? searchState
      : ({ status: "loading" } as const);
  const searchActive = Boolean(normalizeSearchText(query));
  const hierarchy =
    currentSearchState.status === "ready"
      ? buildDroneHierarchy(currentSearchState.response.results)
      : [];

  useEffect(() => {
    selectedHullTypeIdRef.current = selectedHullTypeId;
  }, [selectedHullTypeId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(droneResultLimit),
        q: query
      });

      try {
        const response = await fetch(`/api/fitting/drones?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingDroneSearchResponse
          | { error?: string };

        if (!response.ok || !("results" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Drone search is temporarily unavailable."
          );
        }

        setSearchState({ requestKey, response: payload, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSearchState({
          message:
            error instanceof Error
              ? error.message
              : "Drone search is temporarily unavailable.",
          requestKey,
          status: "error"
        });
      }
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [active, query, requestKey]);

  function toggleBranch(branchKey: string) {
    setExpandedBranches((current) => {
      const next = new Set(current);

      if (next.has(branchKey)) {
        next.delete(branchKey);
      } else {
        next.add(branchKey);
      }

      return next;
    });
  }

  async function performDroneOperation(
    typeId: number,
    typeName: string,
    operation: "add" | "decrement" | "remove"
  ) {
    if (pendingDroneTypeId !== null) {
      return;
    }

    const operationHullTypeId = selectedHullTypeIdRef.current;

    setPendingDroneOperation({ hullTypeId: operationHullTypeId, typeId });
    setFeedback(null);
    const result = await (operation === "add"
      ? onAddDrone(typeId)
      : operation === "decrement"
        ? onDecrementDrone(typeId)
        : onRemoveDrone(typeId));

    if (operationHullTypeId !== selectedHullTypeIdRef.current) {
      return;
    }

    setPendingDroneOperation(null);

    if (!result.ok) {
      setFeedback({
        hullTypeId: operationHullTypeId,
        message: result.message,
        tone: "error"
      });
      return;
    }

    const action =
      operation === "add" ? "Added" : operation === "decrement" ? "Decremented" : "Removed";
    setFeedback({
      hullTypeId: operationHullTypeId,
      message: `${action} ${typeName}.`,
      tone: "success"
    });
  }

  return (
    <div className="fitting-browser-index">
      <label className="field-stack">
        <span className="field-label">Search drones</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search drone, family, market group, or meta..."
          type="search"
          value={query}
        />
      </label>

      <div className="fitting-browser-result-heading">
        <span>Ordinary drone index</span>
        <small>
          {currentSearchState.status === "ready"
            ? searchActive
              ? `${currentSearchState.response.total} matches`
              : `${currentSearchState.response.total} drones`
            : `Up to ${droneResultLimit}`}
        </small>
      </div>

      {selectedHull ? (
        <div className="fitting-browser-readonly-note">
          {selectedHull.typeName} Drone Bay: {formatVolume(selectedHull.droneCapacity)} m³
        </div>
      ) : null}

      <DroneBayInventory
        analysis={analysis}
        onAdd={(entry) =>
          performDroneOperation(entry.typeId, entry.typeName, "add")
        }
        onDecrement={(entry) =>
          performDroneOperation(entry.typeId, entry.typeName, "decrement")
        }
        onRemove={(entry) =>
          performDroneOperation(entry.typeId, entry.typeName, "remove")
        }
        pendingDroneTypeId={pendingDroneTypeId}
      />

      {currentFeedback ? (
        <div
          className="fitting-empty-note"
          data-tone={currentFeedback.tone}
          role="status"
        >
          {currentFeedback.message}
        </div>
      ) : null}

      <div className="fitting-browser-scroll-region" aria-live="polite">
        {currentSearchState.status === "loading" ? (
          <div className="fitting-empty-note">Searching drone cache...</div>
        ) : null}
        {currentSearchState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {currentSearchState.message}
          </div>
        ) : null}
        {currentSearchState.status === "ready" ? (
          hierarchy.length ? (
            <div className="fitting-drone-hierarchy">
              {hierarchy.map((branch) => (
                <DroneHierarchyBranch
                  branch={branch}
                  expandedBranches={expandedBranches}
                  forceExpanded={searchActive}
                  key={branch.key}
                  onAddDrone={(drone) =>
                    performDroneOperation(drone.typeId, drone.typeName, "add")
                  }
                  onToggle={toggleBranch}
                  pendingDroneTypeId={pendingDroneTypeId}
                />
              ))}
            </div>
          ) : (
            <div className="fitting-empty-note">
              {query.trim()
                ? "No drones match this search."
                : "No ordinary drones are available. The drone cache may be empty."}
            </div>
          )
        ) : null}
      </div>

      <div className="fitting-browser-readonly-note">
        Bandwidth shown is static per-drone metadata; this mission validates carried
        bay volume only.
      </div>
    </div>
  );
}

type DroneHierarchyBranch = {
  children: DroneHierarchyBranch[];
  count: number;
  drones: FittingDroneSearchResult[];
  fallback: boolean;
  key: string;
  label: string;
};

type MutableDroneHierarchyBranch = Omit<
  DroneHierarchyBranch,
  "children" | "count"
> & {
  children: Map<string, MutableDroneHierarchyBranch>;
};

function buildDroneHierarchy(drones: FittingDroneSearchResult[]) {
  const roots = new Map<string, MutableDroneHierarchyBranch>();

  for (const drone of drones) {
    const marketPath = drone.marketGroupPathNames.map((label, index) => ({
      key:
        typeof drone.marketGroupPathIds[index] === "number"
          ? `market:${drone.marketGroupPathIds[index]}`
          : `market-name:${label}`,
      label
    }));
    const visiblePath =
      marketPath[0]?.label === "Drones" ? marketPath.slice(1) : marketPath;
    const branchPath = visiblePath.length
      ? visiblePath.map((branch) => ({ ...branch, fallback: false }))
      : [{ fallback: true, key: "other-drones", label: "Other Drones" }];
    let siblings = roots;
    let currentBranch: MutableDroneHierarchyBranch | null = null;

    for (const branch of branchPath) {
      currentBranch = siblings.get(branch.key) ?? null;

      if (!currentBranch) {
        currentBranch = {
          children: new Map(),
          drones: [],
          fallback: branch.fallback,
          key: branch.key,
          label: branch.label
        };
        siblings.set(branch.key, currentBranch);
      }

      siblings = currentBranch.children;
    }

    currentBranch?.drones.push(drone);
  }

  return finalizeDroneBranches(roots);
}

function finalizeDroneBranches(
  branches: Map<string, MutableDroneHierarchyBranch>
): DroneHierarchyBranch[] {
  return Array.from(branches.values())
    .map((branch) => {
      const children = finalizeDroneBranches(branch.children);
      const drones = branch.drones.toSorted((left, right) =>
        hullHierarchyCollator.compare(left.typeName, right.typeName)
      );

      return {
        children,
        count:
          drones.length +
          children.reduce((count, child) => count + child.count, 0),
        drones,
        fallback: branch.fallback,
        key: branch.key,
        label: branch.label
      };
    })
    .toSorted((left, right) => {
      if (left.fallback !== right.fallback) {
        return left.fallback ? 1 : -1;
      }

      return hullHierarchyCollator.compare(left.label, right.label);
    });
}

function DroneHierarchyBranch({
  branch,
  expandedBranches,
  forceExpanded,
  onAddDrone,
  pendingDroneTypeId,
  onToggle
}: {
  branch: DroneHierarchyBranch;
  expandedBranches: Set<string>;
  forceExpanded: boolean;
  onAddDrone: (drone: FittingDroneSearchResult) => void;
  pendingDroneTypeId: number | null;
  onToggle: (branchKey: string) => void;
}) {
  const expanded = forceExpanded || expandedBranches.has(branch.key);

  return (
    <section className="fitting-browser-result-group fitting-drone-branch">
      <button
        aria-expanded={expanded}
        className="fitting-browser-group-toggle"
        onClick={() => onToggle(branch.key)}
        type="button"
      >
        <span>{expanded ? "−" : "+"}</span>
        <strong>{branch.label}</strong>
        <small>{branch.count}</small>
      </button>
      {expanded ? (
        <div className="fitting-drone-branch-children">
          {branch.children.map((child) => (
            <DroneHierarchyBranch
              branch={child}
              expandedBranches={expandedBranches}
              forceExpanded={forceExpanded}
              key={child.key}
              onAddDrone={onAddDrone}
              onToggle={onToggle}
              pendingDroneTypeId={pendingDroneTypeId}
            />
          ))}
          {branch.drones.length ? (
            <div className="fitting-drone-list">
              {branch.drones.map((drone) => (
                <DroneResultRow
                  drone={drone}
                  key={drone.typeId}
                  onAdd={() => onAddDrone(drone)}
                  pending={pendingDroneTypeId === drone.typeId}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DroneResultRow({
  drone,
  onAdd,
  pending
}: {
  drone: FittingDroneSearchResult;
  onAdd: () => void;
  pending: boolean;
}) {
  const badges = getDroneBadges(drone);

  return (
    <div
      className="fitting-drone-result"
      onDoubleClick={() => {
        if (!pending) {
          onAdd();
        }
      }}
      title={`Double-click to add ${drone.typeName} to the Drone Bay`}
    >
      <EveModuleIcon typeId={drone.typeId} typeName={drone.typeName} />
      <span className="fitting-hull-result-copy">
        <strong>{drone.typeName}</strong>
        <span>
          {formatVolume(drone.volume)} m³ · {formatVolume(drone.bandwidthUsed)} Mbit/s
        </span>
      </span>
      {badges.length ? (
        <span className="fitting-drone-badges" aria-label="Drone metadata">
          {badges.map((badge) => (
            <small className="fitting-drone-badge" key={badge}>
              {badge}
            </small>
          ))}
        </span>
      ) : null}
      <button
        className="fitting-drone-add"
        disabled={pending}
        onClick={onAdd}
        onDoubleClick={(event) => event.stopPropagation()}
        type="button"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function DroneBayInventory({
  analysis,
  onAdd,
  onDecrement,
  onRemove,
  pendingDroneTypeId
}: {
  analysis: DroneBayAnalysis;
  onAdd: (entry: DroneBayAnalysis["entries"][number]) => void;
  onDecrement: (entry: DroneBayAnalysis["entries"][number]) => void;
  onRemove: (entry: DroneBayAnalysis["entries"][number]) => void;
  pendingDroneTypeId: number | null;
}) {
  return (
    <section className="fitting-drone-bay" aria-labelledby="fitting-drone-bay-title">
      <div className="fitting-drone-bay-heading">
        <div>
          <strong id="fitting-drone-bay-title">Drone Bay</strong>
          <small>Carried inventory</small>
        </div>
        <span>
          {formatVolume(analysis.usedVolume)} / {formatVolume(analysis.capacity)} m³
        </span>
      </div>
      <div className="fitting-drone-bay-list">
        {analysis.entries.length ? (
          analysis.entries.map((entry) => {
            const pending = pendingDroneTypeId === entry.typeId;

            return (
              <div className="fitting-drone-bay-entry" key={entry.typeId}>
                <EveModuleIcon typeId={entry.typeId} typeName={entry.typeName} />
                <span>
                  <strong>{entry.typeName}</strong>
                  <small>
                    ×{entry.quantity} · {formatVolume(entry.volume * entry.quantity)} m³
                  </small>
                </span>
                <span className="fitting-drone-bay-actions">
                  <button
                    aria-label={`Remove one ${entry.typeName}`}
                    disabled={pending}
                    onClick={() => onDecrement(entry)}
                    type="button"
                  >
                    −1
                  </button>
                  <button
                    aria-label={`Add one ${entry.typeName}`}
                    disabled={pending}
                    onClick={() => onAdd(entry)}
                    type="button"
                  >
                    +1
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => onRemove(entry)}
                    type="button"
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <div className="fitting-empty-note">No drones carried.</div>
        )}
      </div>
      <div className="fitting-drone-bay-remaining">
        {analysis.remainingVolume === null
          ? "Capacity unavailable"
          : `${formatVolume(analysis.remainingVolume)} m³ remaining`}
      </div>
    </section>
  );
}

function getDroneBadges(drone: FittingDroneSearchResult) {
  const techBadge = formatTechLevel(drone.techLevel);

  return Array.from(
    new Set([drone.metaGroupName, techBadge].filter((value): value is string => Boolean(value)))
  );
}

function formatTechLevel(techLevel: number | null) {
  if (techLevel === null) {
    return null;
  }

  if (techLevel === 1) {
    return "Tech I";
  }

  if (techLevel === 2) {
    return "Tech II";
  }

  return `Tech ${techLevel}`;
}

type BrowserResultGroupProps = {
  children: React.ReactNode;
  collapsed: boolean;
  count: number;
  groupKey: string;
  label: string;
  onToggle: (groupKey: string) => void;
};

function BrowserResultGroup({
  children,
  collapsed,
  count,
  groupKey,
  label,
  onToggle
}: BrowserResultGroupProps) {
  return (
    <section className="fitting-browser-result-group">
      <button
        aria-expanded={!collapsed}
        className="fitting-browser-group-toggle"
        onClick={() => onToggle(groupKey)}
        type="button"
      >
        <span>{collapsed ? "+" : "−"}</span>
        <strong>{label}</strong>
        <small>{count}</small>
      </button>
      <div hidden={collapsed}>{children}</div>
    </section>
  );
}

function groupModules(modules: FittingModuleSearchResult[]) {
  return groupResults(modules);
}

function groupCharges(charges: FittingChargeSearchResult[]) {
  return groupResults(charges);
}

function groupResults<T extends { groupId: number; groupName: string }>(
  results: T[]
) {
  const groups = new Map<
    number,
    { groupId: number; groupName: string; items: T[] }
  >();

  for (const result of results) {
    const group = groups.get(result.groupId);

    if (group) {
      group.items.push(result);
    } else {
      groups.set(result.groupId, {
        groupId: result.groupId,
        groupName: result.groupName,
        items: [result]
      });
    }
  }

  return Array.from(groups.values());
}

function getModuleActionLabel(
  action: "fit" | "replace",
  module: FittingModuleSearchResult,
  selectedSlot: SelectedFittingSlot | null
) {
  if (action === "replace" && selectedSlot) {
    return `Replace the module in ${selectedSlot.rack} slot ${selectedSlot.index + 1} with ${module.typeName}`;
  }

  if (selectedSlot) {
    return `Fit ${module.typeName} in ${selectedSlot.rack} slot ${selectedSlot.index + 1}`;
  }

  return `Select ${module.typeName}; double-click to auto-fit`;
}

function formatModuleMetadata(module: FittingModuleSearchResult) {
  return [
    module.marketGroupName,
    module.metaGroupName,
    module.techLevel ? `Tech ${module.techLevel}` : null
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatChargeMetadata(charge: FittingChargeSearchResult) {
  return [
    charge.marketGroupName,
    charge.metaGroupName,
    charge.techLevel ? `Tech ${charge.techLevel}` : null,
    `Size ${charge.chargeSize ?? "default 0"}`,
    `Volume ${formatVolume(charge.volume)}`
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatVolume(value: number | null) {
  return value === null
    ? "unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
