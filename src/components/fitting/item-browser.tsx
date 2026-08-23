import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { EveModuleIcon } from "@/components/fitting/eve-module-icon";
import type {
  BrowserFittingDragSource,
  FittingBrowserSection,
  FittingDragSource,
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import type {
  CargoHoldAttemptResult,
  DroneBayAttemptResult,
  FitModuleAttemptResult,
  FitOperationAttemptResult,
  LoadChargeAttemptResult
} from "@/components/fitting/use-fitting-state";
import { ModuleIcon } from "@/components/module-visuals";
import type { FittedModule } from "@/lib/fitting/fit-state";
import type {
  BrowsableFittingRack,
  CargoHoldAnalysis,
  DroneBayAnalysis,
  FittingChargeCatalogResponse,
  FittingChargeHierarchyNode,
  FittingChargeHierarchyResponse,
  FittingChargeSearchResult,
  FittingCargoSearchResponse,
  FittingCargoSearchResult,
  FittingDroneSearchResponse,
  FittingDroneSearchResult,
  FittingHullSummary,
  FittingModuleHierarchyNode,
  FittingModuleHierarchyResponse,
  FittingModuleSearchResponse,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

const moduleResultLimit = 40;
const chargeResultLimit = 40;
const droneResultLimit = 200;
const cargoResultLimit = 40;
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
  cargoHoldAnalysis: CargoHoldAnalysis;
  droneBayAnalysis: DroneBayAnalysis;
  dragSource: FittingDragSource | null;
  hulls: FittingHullSummary[];
  manipulationError: string | null;
  onAutoFitModule: (
    module: FittingModuleSearchResult
  ) => Promise<FitModuleAttemptResult>;
  onAddDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onAddCargo: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onClearSelectedSlot: () => void;
  onDecrementDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onFitModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onLoadCharge: (typeId: number) => Promise<LoadChargeAttemptResult>;
  onBrowserDragEnd: () => void;
  onBrowserDragStart: (source: BrowserFittingDragSource) => void;
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
  cargoHoldAnalysis,
  droneBayAnalysis,
  dragSource,
  hulls,
  manipulationError,
  onAutoFitModule,
  onAddCargo,
  onAddDrone,
  onClearSelectedSlot,
  onDecrementDrone,
  onFitModule,
  onLoadCharge,
  onBrowserDragEnd,
  onBrowserDragStart,
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
  const [cargoQuery, setCargoQuery] = useState("");
  const [collapsedModuleGroups, setCollapsedModuleGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedChargeGroups, setCollapsedChargeGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedCargoGroups, setCollapsedCargoGroups] = useState<Set<string>>(
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
          draggingModuleTypeId={
            dragSource?.kind === "browser-module" ? dragSource.typeId : null
          }
          onAutoFitModule={onAutoFitModule}
          onChooseModule={replacementActive ? onReplaceModule : onFitModule}
          onModuleDragEnd={onBrowserDragEnd}
          onModuleDragStart={(module) =>
            onBrowserDragStart({
              kind: "browser-module",
              rack: module.rack,
              typeId: module.typeId,
              typeName: module.typeName
            })
          }
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
        badge={selectedModule ? "Context" : "Catalog"}
        description="Persistent charge and ammunition index"
        id="fitting-browser-charges"
        onToggle={() => onToggleSection("charges")}
        open={openSections.charges}
        title="Charges"
      >
        <ChargeBrowser
          active={openSections.charges}
          collapsedGroups={collapsedChargeGroups}
          draggingChargeTypeId={
            dragSource?.kind === "browser-charge" ? dragSource.typeId : null
          }
          onChargeDragEnd={onBrowserDragEnd}
          onChargeDragStart={(charge) =>
            onBrowserDragStart({
              kind: "browser-charge",
              typeId: charge.typeId,
              typeName: charge.typeName
            })
          }
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
          draggingDroneTypeId={
            dragSource?.kind === "browser-drone" ? dragSource.typeId : null
          }
          onAddDrone={onAddDrone}
          onDecrementDrone={onDecrementDrone}
          onDroneDragEnd={onBrowserDragEnd}
          onDroneDragStart={(drone) =>
            onBrowserDragStart({
              kind: "browser-drone",
              typeId: drone.typeId,
              typeName: drone.typeName
            })
          }
          onRemoveDrone={onRemoveDrone}
          query={droneQuery}
          selectedHull={selectedHull}
          setQuery={setDroneQuery}
        />
      </PersistentBrowserSection>

      <PersistentBrowserSection
        badge={
          cargoHoldAnalysis.entries.length
            ? `${cargoHoldAnalysis.entries.reduce(
                (total, entry) => total + entry.quantity,
                0
              )} Carried`
            : "Empty"
        }
        description="Ordinary carried inventory"
        id="fitting-browser-cargo"
        onToggle={() => onToggleSection("cargo")}
        open={openSections.cargo}
        title="Cargo"
      >
        <CargoBrowser
          active={openSections.cargo}
          collapsedGroups={collapsedCargoGroups}
          draggingCargoTypeId={
            dragSource?.kind === "browser-cargo" ? dragSource.typeId : null
          }
          onAddCargo={onAddCargo}
          onCargoDragEnd={onBrowserDragEnd}
          onCargoDragStart={(cargo) =>
            onBrowserDragStart({
              kind: "browser-cargo",
              typeId: cargo.typeId,
              typeName: cargo.typeName
            })
          }
          onToggleGroup={(groupKey) =>
            toggleCollapsedGroup(setCollapsedCargoGroups, groupKey)
          }
          query={cargoQuery}
          selectedHullTypeId={selectedHull?.typeId ?? null}
          setQuery={setCargoQuery}
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

type ModuleHierarchyState =
  | { status: "loading" }
  | { message: string; rack: BrowsableFittingRack; status: "error" }
  | {
      rack: BrowsableFittingRack;
      response: FittingModuleHierarchyResponse;
      status: "ready";
    };

type ModuleBranchState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { results: FittingModuleSearchResult[]; status: "ready" };

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
  const [hierarchyState, setHierarchyState] = useState<ModuleHierarchyState>({
    status: "loading"
  });
  const [branchStates, setBranchStates] = useState<
    Record<string, ModuleBranchState>
  >({});
  const [expandedHierarchyBranches, setExpandedHierarchyBranches] = useState<
    Set<string>
  >(() => new Set());
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [pendingModule, setPendingModule] = useState<{
    message: string;
    typeId: number;
  } | null>(null);
  const [isFitting, startFittingTransition] = useTransition();
  const singleClickTimeoutRef = useRef<number | null>(null);
  const searchActive = Boolean(query.trim());
  const requestKey = `${rack}:${query}`;
  const currentSearchState =
    searchState.status !== "loading" && searchState.requestKey === requestKey
      ? searchState
      : ({ status: "loading" } as const);
  const currentHierarchyState =
    hierarchyState.status !== "loading" && hierarchyState.rack === rack
      ? hierarchyState
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
      const searchParams = searchActive
        ? new URLSearchParams({
            limit: String(moduleResultLimit),
            q: query,
            rack
          })
        : new URLSearchParams({ browse: "hierarchy", rack });

      try {
        const response = await fetch(`/api/fitting/modules?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingModuleHierarchyResponse
          | FittingModuleSearchResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Module search is temporarily unavailable."
          );
        }

        if (searchActive) {
          if (!("results" in payload)) {
            throw new Error("The module search response was invalid.");
          }

          setSearchState({
            requestKey,
            results: payload.results,
            status: "ready"
          });
        } else {
          if (!("nodes" in payload)) {
            throw new Error("The module hierarchy response was invalid.");
          }

          setHierarchyState({ rack, response: payload, status: "ready" });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Module search is temporarily unavailable.";

        if (searchActive) {
          setSearchState({ message, requestKey, status: "error" });
        } else {
          setHierarchyState({ message, rack, status: "error" });
        }
      }
    }, searchDebounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [active, query, rack, requestKey, searchActive]);

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

  function handleHierarchyToggle(node: FittingModuleHierarchyNode) {
    const branchKey = getModuleBranchKey(rack, node);
    const expanding = !expandedHierarchyBranches.has(branchKey);

    setExpandedHierarchyBranches((current) => {
      const next = new Set(current);

      if (next.has(branchKey)) {
        next.delete(branchKey);
      } else {
        next.add(branchKey);
      }

      return next;
    });

    if (expanding && node.directCount > 0 && !branchStates[branchKey]) {
      void loadHierarchyBranch(node, branchKey);
    }
  }

  async function loadHierarchyBranch(
    node: FittingModuleHierarchyNode,
    branchKey: string
  ) {
    setBranchStates((current) => ({
      ...current,
      [branchKey]: { status: "loading" }
    }));
    const searchParams = new URLSearchParams({ browse: "branch", rack });

    if (node.fallback) {
      searchParams.set("fallback", "true");
    } else if (node.marketGroupId !== null) {
      searchParams.set("marketGroupId", String(node.marketGroupId));
    }

    try {
      const response = await fetch(`/api/fitting/modules?${searchParams}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as
        | FittingModuleSearchResponse
        | { error?: string };

      if (!response.ok || !("results" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "This module branch is temporarily unavailable."
        );
      }

      setBranchStates((current) => ({
        ...current,
        [branchKey]: { results: payload.results, status: "ready" }
      }));
    } catch (error) {
      setBranchStates((current) => ({
        ...current,
        [branchKey]: {
          message:
            error instanceof Error
              ? error.message
              : "This module branch is temporarily unavailable.",
          status: "error"
        }
      }));
    }
  }

  function renderModuleList(modules: FittingModuleSearchResult[]) {
    return (
      <div className="fitting-module-list">
        {modules.map((module) => (
          <button
            aria-label={getModuleActionLabel(action, module, selectedSlot)}
            className="fitting-module-result"
            data-dragging={draggingModuleTypeId === module.typeId}
            data-pending={isFitting && pendingModule?.typeId === module.typeId}
            disabled={isFitting}
            draggable={action === "fit" && !isFitting}
            key={module.typeId}
            onClick={(event) => handleModuleClick(module, event.detail)}
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
            <EveModuleIcon typeId={module.typeId} typeName={module.typeName} />
            <span className="fitting-hull-result-copy">
              <strong>{module.typeName}</strong>
              <span>{formatModuleMetadata(module)}</span>
            </span>
          </button>
        ))}
      </div>
    );
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
        <small>
          {searchActive
            ? `Up to ${moduleResultLimit}`
            : currentHierarchyState.status === "ready"
              ? `${currentHierarchyState.response.total} modules`
              : "Authoritative hierarchy"}
        </small>
      </div>

      <div className="fitting-browser-scroll-region" aria-live="polite">
        {searchActive ? (
          <>
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
                        {renderModuleList(group.items)}
                      </BrowserResultGroup>
                    );
                  })}
                </div>
              ) : (
                <div className="fitting-empty-note">
                  No {rack} modules match this search.
                </div>
              )
            ) : null}
          </>
        ) : (
          <>
            {currentHierarchyState.status === "loading" ? (
              <div className="fitting-empty-note">Loading module hierarchy...</div>
            ) : null}
            {currentHierarchyState.status === "error" ? (
              <div className="fitting-empty-note" data-tone="error">
                {currentHierarchyState.message}
              </div>
            ) : null}
            {currentHierarchyState.status === "ready" ? (
              currentHierarchyState.response.nodes.length ? (
                <div className="fitting-module-hierarchy">
                  {currentHierarchyState.response.nodes.map((node) => (
                    <ModuleHierarchyBranch
                      branchStates={branchStates}
                      expandedBranches={expandedHierarchyBranches}
                      key={node.key}
                      node={node}
                      onToggle={handleHierarchyToggle}
                      rack={rack}
                      renderModules={renderModuleList}
                    />
                  ))}
                </div>
              ) : (
                <div className="fitting-empty-note">
                  No {rack} modules are available. The module cache may be empty.
                </div>
              )
            ) : null}
          </>
        )}
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

function ModuleHierarchyBranch({
  branchStates,
  expandedBranches,
  node,
  onToggle,
  rack,
  renderModules
}: {
  branchStates: Record<string, ModuleBranchState>;
  expandedBranches: Set<string>;
  node: FittingModuleHierarchyNode;
  onToggle: (node: FittingModuleHierarchyNode) => void;
  rack: BrowsableFittingRack;
  renderModules: (modules: FittingModuleSearchResult[]) => React.ReactNode;
}) {
  const branchKey = getModuleBranchKey(rack, node);
  const expanded = expandedBranches.has(branchKey);
  const branchState = branchStates[branchKey];

  return (
    <section
      className="fitting-browser-result-group fitting-module-hierarchy-branch"
      data-fallback={node.fallback}
    >
      <button
        aria-expanded={expanded}
        className="fitting-browser-group-toggle"
        onClick={() => onToggle(node)}
        type="button"
      >
        <span>{expanded ? "−" : "+"}</span>
        <strong>{node.label}</strong>
        <small>{node.count}</small>
      </button>
      {expanded ? (
        <div className="fitting-module-hierarchy-children">
          {node.children.map((child) => (
            <ModuleHierarchyBranch
              branchStates={branchStates}
              expandedBranches={expandedBranches}
              key={child.key}
              node={child}
              onToggle={onToggle}
              rack={rack}
              renderModules={renderModules}
            />
          ))}
          {node.directCount > 0 ? (
            branchState?.status === "ready" ? (
              branchState.results.length ? (
                renderModules(branchState.results)
              ) : (
                <div className="fitting-empty-note">
                  This branch contains no current modules.
                </div>
              )
            ) : branchState?.status === "error" ? (
              <div className="fitting-empty-note" data-tone="error">
                {branchState.message}
              </div>
            ) : (
              <div className="fitting-empty-note">Loading branch modules...</div>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function getModuleBranchKey(
  rack: BrowsableFittingRack,
  node: FittingModuleHierarchyNode
) {
  return `${rack}:${node.key}`;
}

type ChargeBrowserProps = {
  active: boolean;
  collapsedGroups: Set<string>;
  draggingChargeTypeId: number | null;
  onChargeDragEnd: () => void;
  onChargeDragStart: (charge: FittingChargeSearchResult) => void;
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
      response: FittingChargeCatalogResponse;
      status: "ready";
    };

type ChargeHierarchyState =
  | { status: "idle" | "loading" }
  | { message: string; status: "error" }
  | { response: FittingChargeHierarchyResponse; status: "ready" };

type ChargeBranchState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { results: FittingChargeSearchResult[]; status: "ready" };

function ChargeBrowser({
  active,
  collapsedGroups,
  draggingChargeTypeId,
  onChargeDragEnd,
  onChargeDragStart,
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
  const [hierarchyState, setHierarchyState] = useState<ChargeHierarchyState>({
    status: "idle"
  });
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set()
  );
  const [branchStates, setBranchStates] = useState<
    Record<string, ChargeBranchState>
  >({});
  const [pendingChargeTypeId, setPendingChargeTypeId] = useState<number | null>(
    null
  );
  const [chargeFeedback, setChargeFeedback] = useState<
    {
      message: string;
      tone: "error" | "success";
    } | null
  >(null);
  const normalizedQuery = query.trim();
  const requestKey = normalizedQuery || "idle";
  const currentSearchState =
    searchState.status !== "idle" && searchState.requestKey === requestKey
      ? searchState
      : normalizedQuery
        ? ({ requestKey, status: "loading" } as const)
        : ({ status: "idle" } as const);
  const groupedCharges =
    currentSearchState.status === "ready"
      ? groupCharges(currentSearchState.response.results)
      : [];
  const currentChargeFeedback = chargeFeedback;

  useEffect(() => {
    if (!active || hierarchyState.status !== "idle") {
      return;
    }

    const abortController = new AbortController();
    void fetch("/api/fitting/charges?browse=hierarchy", {
      cache: "no-store",
      signal: abortController.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | FittingChargeHierarchyResponse
          | { error?: string };

        if (!response.ok || !("nodes" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Charge hierarchy is temporarily unavailable."
          );
        }

        setHierarchyState({ response: payload, status: "ready" });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHierarchyState({
          message:
            error instanceof Error
              ? error.message
              : "Charge hierarchy is temporarily unavailable.",
          status: "error"
        });
      });

    return () => abortController.abort();
  }, [active, hierarchyState.status]);

  useEffect(() => {
    if (!active || !normalizedQuery) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(chargeResultLimit),
        q: query
      });

      try {
        const response = await fetch(`/api/fitting/charges?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingChargeCatalogResponse
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
  }, [active, normalizedQuery, query, requestKey]);

  async function toggleHierarchyBranch(node: FittingChargeHierarchyNode) {
    const expanding = !expandedBranches.has(node.key);
    setExpandedBranches((current) => {
      const next = new Set(current);
      if (expanding) next.add(node.key);
      else next.delete(node.key);
      return next;
    });

    if (!expanding || !node.directCount || branchStates[node.key]) {
      return;
    }

    setBranchStates((current) => ({
      ...current,
      [node.key]: { status: "loading" }
    }));
    const searchParams = new URLSearchParams({ browse: "branch" });
    if (node.fallback) searchParams.set("fallback", "true");
    if (node.groupId !== null) searchParams.set("groupId", String(node.groupId));
    if (node.marketGroupId !== null) {
      searchParams.set("marketGroupId", String(node.marketGroupId));
    }

    try {
      const response = await fetch(`/api/fitting/charges?${searchParams}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as
        | FittingChargeCatalogResponse
        | { error?: string };
      if (!response.ok || !("results" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Charge branch is temporarily unavailable."
        );
      }
      setBranchStates((current) => ({
        ...current,
        [node.key]: { results: payload.results, status: "ready" }
      }));
    } catch (error) {
      setBranchStates((current) => ({
        ...current,
        [node.key]: {
          message:
            error instanceof Error
              ? error.message
              : "Charge branch is temporarily unavailable.",
          status: "error"
        }
      }));
    }
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
            tone: "success"
          }
        : {
            message: result.message,
            tone: "error"
          }
    );
  };

  const handleUnloadCharge = () => {
    if (!selectedModule) {
      return;
    }
    const result = onUnloadCharge();

    setChargeFeedback(
      result.ok
        ? {
            message: "Charge unloaded.",
            tone: "success"
          }
        : {
            message: result.message,
            tone: "error"
          }
    );
  };

  return (
    <div className="fitting-browser-index">
      {selectedModule?.charge ? (
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
        <span className="field-label">Search charges</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search charge name, group, or market group..."
          type="search"
          value={query}
        />
      </label>

      <div className="fitting-browser-scroll-region" aria-live="polite">
        {normalizedQuery && currentSearchState.status === "loading" ? (
          <div className="fitting-empty-note">Searching charge cache...</div>
        ) : null}
        {currentSearchState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {currentSearchState.message}
          </div>
        ) : null}
        {normalizedQuery && currentSearchState.status === "ready" ? (
            <>
              <div className="fitting-browser-result-heading">
                <span>Charge search</span>
                <small>Up to {chargeResultLimit} matches</small>
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
                            <ChargeResultRow
                              charge={charge}
                              loaded={
                                selectedModule?.charge?.typeId === charge.typeId
                              }
                              dragging={draggingChargeTypeId === charge.typeId}
                              key={charge.typeId}
                              onDragEnd={onChargeDragEnd}
                              onDragStart={onChargeDragStart}
                              onLoad={selectedModule ? handleLoadCharge : null}
                              pending={pendingChargeTypeId === charge.typeId}
                            />
                          ))}
                        </div>
                      </BrowserResultGroup>
                    );
                  })}
                </div>
              ) : (
                <div className="fitting-empty-note">
                  {query.trim()
                    ? "No charges match this search."
                    : "No charges are available."}
                </div>
              )}
            </>
        ) : null}
        {!normalizedQuery &&
        (hierarchyState.status === "idle" || hierarchyState.status === "loading") ? (
          <div className="fitting-empty-note">Loading charge hierarchy...</div>
        ) : null}
        {!normalizedQuery && hierarchyState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {hierarchyState.message}
          </div>
        ) : null}
        {!normalizedQuery && hierarchyState.status === "ready" ? (
          hierarchyState.response.nodes.length ? (
            <>
              <div className="fitting-browser-result-heading">
                <span>Authoritative charge index</span>
                <small>{hierarchyState.response.total} charges</small>
              </div>
              <div className="fitting-module-hierarchy">
                {hierarchyState.response.nodes.map((node) => (
                  <ChargeHierarchyBranch
                    branchStates={branchStates}
                    draggingChargeTypeId={draggingChargeTypeId}
                    expandedBranches={expandedBranches}
                    key={node.key}
                    node={node}
                    onChargeDragEnd={onChargeDragEnd}
                    onChargeDragStart={onChargeDragStart}
                    onLoadCharge={selectedModule ? handleLoadCharge : null}
                    onToggle={toggleHierarchyBranch}
                    pendingChargeTypeId={pendingChargeTypeId}
                    selectedChargeTypeId={selectedModule?.charge?.typeId ?? null}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="fitting-empty-note">
              No charges are available. The charge cache may be empty.
            </div>
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

function ChargeHierarchyBranch({
  branchStates,
  draggingChargeTypeId,
  expandedBranches,
  node,
  onChargeDragEnd,
  onChargeDragStart,
  onLoadCharge,
  onToggle,
  pendingChargeTypeId,
  selectedChargeTypeId
}: {
  branchStates: Record<string, ChargeBranchState>;
  draggingChargeTypeId: number | null;
  expandedBranches: Set<string>;
  node: FittingChargeHierarchyNode;
  onChargeDragEnd: () => void;
  onChargeDragStart: (charge: FittingChargeSearchResult) => void;
  onLoadCharge: ((charge: FittingChargeSearchResult) => Promise<void>) | null;
  onToggle: (node: FittingChargeHierarchyNode) => void;
  pendingChargeTypeId: number | null;
  selectedChargeTypeId: number | null;
}) {
  const expanded = expandedBranches.has(node.key);
  const branchState = branchStates[node.key];

  return (
    <section className="fitting-browser-result-group fitting-module-branch">
      <button
        aria-expanded={expanded}
        className="fitting-browser-group-toggle"
        onClick={() => void onToggle(node)}
        type="button"
      >
        <span>{expanded ? "−" : "+"}</span>
        <strong>{node.label}</strong>
        <small>{node.count}</small>
      </button>
      {expanded ? (
        <div className="fitting-module-branch-children">
          {node.children.map((child) => (
            <ChargeHierarchyBranch
              branchStates={branchStates}
              draggingChargeTypeId={draggingChargeTypeId}
              expandedBranches={expandedBranches}
              key={child.key}
              node={child}
              onChargeDragEnd={onChargeDragEnd}
              onChargeDragStart={onChargeDragStart}
              onLoadCharge={onLoadCharge}
              onToggle={onToggle}
              pendingChargeTypeId={pendingChargeTypeId}
              selectedChargeTypeId={selectedChargeTypeId}
            />
          ))}
          {node.directCount ? (
            branchState?.status === "ready" ? (
              <div className="fitting-charge-list">
                {branchState.results.map((charge) => (
                  <ChargeResultRow
                    charge={charge}
                    loaded={selectedChargeTypeId === charge.typeId}
                    dragging={draggingChargeTypeId === charge.typeId}
                    key={charge.typeId}
                    onDragEnd={onChargeDragEnd}
                    onDragStart={onChargeDragStart}
                    onLoad={onLoadCharge}
                    pending={pendingChargeTypeId === charge.typeId}
                  />
                ))}
              </div>
            ) : branchState?.status === "error" ? (
              <div className="fitting-empty-note" data-tone="error">
                {branchState.message}
              </div>
            ) : (
              <div className="fitting-empty-note">Loading branch charges...</div>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChargeResultRow({
  charge,
  loaded,
  dragging,
  onDragEnd,
  onDragStart,
  onLoad,
  pending
}: {
  charge: FittingChargeSearchResult;
  loaded: boolean;
  dragging: boolean;
  onDragEnd: () => void;
  onDragStart: (charge: FittingChargeSearchResult) => void;
  onLoad: ((charge: FittingChargeSearchResult) => Promise<void>) | null;
  pending: boolean;
}) {
  return (
    <article
      className="fitting-charge-result"
      data-dragging={dragging}
      data-loaded={loaded}
      draggable
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", `fitting-charge:${charge.typeId}`);
        onDragStart(charge);
      }}
    >
      <EveModuleIcon typeId={charge.typeId} typeName={charge.typeName} />
      <span className="fitting-hull-result-copy">
        <strong>{charge.typeName}</strong>
        <span>{formatChargeMetadata(charge)}</span>
      </span>
      {onLoad ? (
        <button
          aria-label={`Load ${charge.typeName} into the selected module`}
          disabled={pending}
          onClick={() => void onLoad(charge)}
          type="button"
        >
          {pending ? "Loading..." : loaded ? "Reload" : "Load"}
        </button>
      ) : (
        <small className="fitting-charge-drag-note">Drag to fit</small>
      )}
    </article>
  );
}

type CargoBrowserProps = {
  active: boolean;
  collapsedGroups: Set<string>;
  draggingCargoTypeId: number | null;
  onAddCargo: (typeId: number) => Promise<CargoHoldAttemptResult>;
  onCargoDragEnd: () => void;
  onCargoDragStart: (cargo: FittingCargoSearchResult) => void;
  onToggleGroup: (groupKey: string) => void;
  query: string;
  selectedHullTypeId: number | null;
  setQuery: (query: string) => void;
};

type CargoSearchState =
  | { status: "loading" }
  | { message: string; requestKey: string; status: "error" }
  | {
      requestKey: string;
      response: FittingCargoSearchResponse;
      status: "ready";
    };

function CargoBrowser({
  active,
  collapsedGroups,
  draggingCargoTypeId,
  onAddCargo,
  onCargoDragEnd,
  onCargoDragStart,
  onToggleGroup,
  query,
  selectedHullTypeId,
  setQuery
}: CargoBrowserProps) {
  const [searchState, setSearchState] = useState<CargoSearchState>({
    status: "loading"
  });
  const [pendingTypeId, setPendingTypeId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    hullTypeId: number | null;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const currentFeedback =
    feedback?.hullTypeId === selectedHullTypeId ? feedback : null;
  const requestKey = query;
  const currentSearchState =
    searchState.status !== "loading" && searchState.requestKey === requestKey
      ? searchState
      : ({ status: "loading" } as const);
  const groupedCargo =
    currentSearchState.status === "ready"
      ? groupCargo(currentSearchState.response.results)
      : [];

  useEffect(() => {
    if (!active) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        limit: String(cargoResultLimit),
        q: query
      });

      try {
        const response = await fetch(`/api/fitting/cargo?${searchParams}`, {
          cache: "no-store",
          signal: abortController.signal
        });
        const payload = (await response.json()) as
          | FittingCargoSearchResponse
          | { error?: string };

        if (!response.ok || !("results" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Cargo search is temporarily unavailable."
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
              : "Cargo search is temporarily unavailable.",
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

  async function addCargo(cargo: FittingCargoSearchResult) {
    if (pendingTypeId !== null) {
      return;
    }

    setPendingTypeId(cargo.typeId);
    setFeedback(null);
    const result = await onAddCargo(cargo.typeId);
    setPendingTypeId(null);

    if (!result.ok) {
      setFeedback({
        hullTypeId: selectedHullTypeId,
        message: result.message,
        tone: "error"
      });
      return;
    }

    setFeedback({
      hullTypeId: selectedHullTypeId,
      message: `Added ${cargo.typeName} to Cargo Hold.`,
      tone: "success"
    });
  }

  return (
    <div className="fitting-browser-index">
      <label className="field-stack">
        <span className="field-label">Search cargo</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search item, group, category, or market path..."
          type="search"
          value={query}
        />
      </label>

      <div className="fitting-browser-result-heading">
        <span>Browser-safe cargo</span>
        <small>Up to {cargoResultLimit} results</small>
      </div>

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
          <div className="fitting-empty-note">Searching cargo cache...</div>
        ) : null}
        {currentSearchState.status === "error" ? (
          <div className="fitting-empty-note" data-tone="error">
            {currentSearchState.message}
          </div>
        ) : null}
        {currentSearchState.status === "ready" ? (
          groupedCargo.length ? (
            <div className="fitting-browser-groups">
              {groupedCargo.map((group) => (
                <BrowserResultGroup
                  collapsed={collapsedGroups.has(group.key)}
                  count={group.items.length}
                  groupKey={group.key}
                  key={group.key}
                  label={group.label}
                  onToggle={onToggleGroup}
                >
                  <div className="fitting-cargo-list">
                    {group.items.map((cargo) => (
                      <CargoResultRow
                        cargo={cargo}
                        dragging={draggingCargoTypeId === cargo.typeId}
                        key={cargo.typeId}
                        onAdd={() => void addCargo(cargo)}
                        onDragEnd={onCargoDragEnd}
                        onDragStart={() => onCargoDragStart(cargo)}
                        pending={pendingTypeId === cargo.typeId}
                      />
                    ))}
                  </div>
                </BrowserResultGroup>
              ))}
            </div>
          ) : (
            <div className="fitting-empty-note">
              {query.trim()
                ? "No browser-safe cargo matches this search. Package-sensitive and instance-specific items remain resolver-only."
                : "No browser-safe cargo is available. The cargo cache may be empty."}
            </div>
          )
        ) : null}
      </div>

      <div className="fitting-browser-readonly-note">
        Browser results exclude blueprints, Abyssal templates, unknown volume, and
        unresolved packaged/assembled state.
      </div>
    </div>
  );
}

function CargoResultRow({
  cargo,
  dragging,
  onAdd,
  onDragEnd,
  onDragStart,
  pending
}: {
  cargo: FittingCargoSearchResult;
  dragging: boolean;
  onAdd: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  pending: boolean;
}) {
  const badges = Array.from(
    new Set(
      [cargo.metaGroupName, formatTechLevel(cargo.techLevel)].filter(
        (value): value is string => Boolean(value)
      )
    )
  );

  return (
    <div
      className="fitting-cargo-result"
      data-dragging={dragging}
      draggable
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", `fitting-cargo:${cargo.typeId}`);
        onDragStart();
      }}
      onDoubleClick={() => {
        if (!pending) {
          onAdd();
        }
      }}
      title={`Double-click or drag to add ${cargo.typeName} to Cargo Hold`}
    >
      <EveModuleIcon typeId={cargo.typeId} typeName={cargo.typeName} />
      <span className="fitting-hull-result-copy">
        <strong>{cargo.typeName}</strong>
        <span>
          {cargo.groupName} · {formatVolume(cargo.volume)} m³ each
        </span>
      </span>
      {badges.length ? (
        <span className="fitting-drone-badges" aria-label="Cargo metadata">
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

type DroneBrowserProps = {
  active: boolean;
  analysis: DroneBayAnalysis;
  draggingDroneTypeId: number | null;
  onAddDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onDecrementDrone: (typeId: number) => Promise<DroneBayAttemptResult>;
  onDroneDragEnd: () => void;
  onDroneDragStart: (drone: FittingDroneSearchResult) => void;
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
  draggingDroneTypeId,
  onAddDrone,
  onDecrementDrone,
  onDroneDragEnd,
  onDroneDragStart,
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
                  draggingDroneTypeId={draggingDroneTypeId}
                  expandedBranches={expandedBranches}
                  forceExpanded={searchActive}
                  key={branch.key}
                  onAddDrone={(drone) =>
                    performDroneOperation(drone.typeId, drone.typeName, "add")
                  }
                  onDroneDragEnd={onDroneDragEnd}
                  onDroneDragStart={onDroneDragStart}
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
  draggingDroneTypeId,
  expandedBranches,
  forceExpanded,
  onAddDrone,
  onDroneDragEnd,
  onDroneDragStart,
  pendingDroneTypeId,
  onToggle
}: {
  branch: DroneHierarchyBranch;
  draggingDroneTypeId: number | null;
  expandedBranches: Set<string>;
  forceExpanded: boolean;
  onAddDrone: (drone: FittingDroneSearchResult) => void;
  onDroneDragEnd: () => void;
  onDroneDragStart: (drone: FittingDroneSearchResult) => void;
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
              draggingDroneTypeId={draggingDroneTypeId}
              expandedBranches={expandedBranches}
              forceExpanded={forceExpanded}
              key={child.key}
              onAddDrone={onAddDrone}
              onDroneDragEnd={onDroneDragEnd}
              onDroneDragStart={onDroneDragStart}
              onToggle={onToggle}
              pendingDroneTypeId={pendingDroneTypeId}
            />
          ))}
          {branch.drones.length ? (
            <div className="fitting-drone-list">
              {branch.drones.map((drone) => (
                <DroneResultRow
                  dragging={draggingDroneTypeId === drone.typeId}
                  drone={drone}
                  key={drone.typeId}
                  onAdd={() => onAddDrone(drone)}
                  onDragEnd={onDroneDragEnd}
                  onDragStart={() => onDroneDragStart(drone)}
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
  dragging,
  drone,
  onAdd,
  onDragEnd,
  onDragStart,
  pending
}: {
  dragging: boolean;
  drone: FittingDroneSearchResult;
  onAdd: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  pending: boolean;
}) {
  const badges = getDroneBadges(drone);

  return (
    <div
      className="fitting-drone-result"
      data-dragging={dragging}
      draggable
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", `fitting-drone:${drone.typeId}`);
        onDragStart();
      }}
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

function groupCargo(cargoItems: FittingCargoSearchResult[]) {
  const groups = new Map<
    string,
    { items: FittingCargoSearchResult[]; key: string; label: string }
  >();

  for (const cargo of cargoItems) {
    const key = `cargo:${cargo.categoryId}:${cargo.groupId}`;
    const marketLeaf = cargo.marketGroupPathNames.at(-1);
    const label = `${cargo.categoryName} · ${marketLeaf || cargo.groupName}`;
    const group = groups.get(key);

    if (group) {
      group.items.push(cargo);
    } else {
      groups.set(key, { items: [cargo], key, label });
    }
  }

  return Array.from(groups.values()).toSorted((left, right) =>
    hullHierarchyCollator.compare(left.label, right.label)
  );
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
