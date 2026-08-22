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
  FitModuleAttemptResult,
  FitOperationAttemptResult,
  LoadChargeAttemptResult
} from "@/components/fitting/use-fitting-state";
import { ModuleIcon } from "@/components/module-visuals";
import type { FittedModule } from "@/lib/fitting/fit-state";
import type {
  BrowsableFittingRack,
  FittingChargeSearchResponse,
  FittingChargeSearchResult,
  FittingHullSummary,
  FittingModuleSearchResponse,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

const initialHullResultLimit = 18;
const filteredHullResultLimit = 36;
const moduleResultLimit = 40;
const chargeResultLimit = 40;
const searchDebounceMs = 250;
const browserRacks: Array<{ label: string; rack: BrowsableFittingRack }> = [
  { label: "High", rack: "high" },
  { label: "Mid", rack: "mid" },
  { label: "Low", rack: "low" },
  { label: "Rig", rack: "rig" }
];

type ItemBrowserProps = {
  actionMode: ModuleActionMode;
  browserRack: BrowsableFittingRack;
  draggingModuleTypeId: number | null;
  hulls: FittingHullSummary[];
  manipulationError: string | null;
  onAutoFitModule: (
    module: FittingModuleSearchResult
  ) => Promise<FitModuleAttemptResult>;
  onClearSelectedSlot: () => void;
  onFitModule: (typeId: number) => Promise<FitModuleAttemptResult>;
  onLoadCharge: (typeId: number) => Promise<LoadChargeAttemptResult>;
  onModuleDragEnd: () => void;
  onModuleDragStart: (module: FittingModuleSearchResult) => void;
  onModuleRackChange: (rack: BrowsableFittingRack) => void;
  onRemoveModule: () => Promise<FitOperationAttemptResult>;
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
  draggingModuleTypeId,
  hulls,
  manipulationError,
  onAutoFitModule,
  onClearSelectedSlot,
  onFitModule,
  onLoadCharge,
  onModuleDragEnd,
  onModuleDragStart,
  onModuleRackChange,
  onRemoveModule,
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
  const hasMoreResults = searchResult.matchCount > searchResult.visibleHulls.length;

  return (
    <>
      <label className="field-stack">
        <span className="field-label">Search hulls</span>
        <input
          className="text-input fitting-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ship name or group..."
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
