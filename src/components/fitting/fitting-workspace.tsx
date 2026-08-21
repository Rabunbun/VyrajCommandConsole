"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type {
  FittingBrowserSection,
  FittingDragSource,
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import { ItemBrowser } from "@/components/fitting/item-browser";
import {
  useFittingState,
  type FitModuleAttemptResult,
  type FitOperationAttemptResult
} from "@/components/fitting/use-fitting-state";
import type {
  BrowsableFittingRack,
  FittingHullSummary,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
};

export function FittingWorkspace({ hulls }: FittingWorkspaceProps) {
  const {
    analysis,
    cancelPendingOperation,
    fitModule,
    fitWarnings,
    fitState,
    moveModule,
    removeModule,
    replaceModule,
    selectHull,
    selectedHull
  } = useFittingState({ hulls });
  const [selectedSlot, setSelectedSlot] = useState<SelectedFittingSlot | null>(null);
  const [moduleActionMode, setModuleActionMode] = useState<ModuleActionMode>(null);
  const [browserRack, setBrowserRack] = useState<BrowsableFittingRack>("high");
  const [openBrowserSections, setOpenBrowserSections] = useState<
    Record<FittingBrowserSection, boolean>
  >({ charges: false, hulls: true, modules: false });
  const [manipulationError, setManipulationError] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<FittingDragSource | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<SelectedFittingSlot | null>(null);
  const [isRemoveDragOver, setIsRemoveDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [resolvedModuleNamesByTypeId, setResolvedModuleNamesByTypeId] = useState<
    Record<number, string>
  >({});
  const browserRackBeforeReplacementRef = useRef<BrowsableFittingRack | null>(null);
  const selectedModule = selectedSlot
    ? fitState.slots[selectedSlot.rack].find(
        (slot) => slot.index === selectedSlot.index
      )?.module ?? null
    : null;
  const selectedModuleName = selectedModule
    ? resolvedModuleNamesByTypeId[selectedModule.typeId] ??
      `Module type ${selectedModule.typeId}`
    : null;
  const clearDragState = useCallback(() => {
    setDragOverSlot(null);
    setDragSource(null);
    setIsRemoveDragOver(false);
  }, []);
  const openBrowserSection = useCallback((section: FittingBrowserSection) => {
    setOpenBrowserSections((current) => ({ ...current, [section]: true }));
  }, []);
  const restoreBrowserRackAfterReplacement = useCallback(() => {
    const previousRack = browserRackBeforeReplacementRef.current;

    if (previousRack) {
      setBrowserRack(previousRack);
      browserRackBeforeReplacementRef.current = null;
    }
  }, []);
  const clearSelectedSlot = useCallback(() => {
    cancelPendingOperation();
    clearDragState();
    restoreBrowserRackAfterReplacement();
    setDragError(null);
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(null);
  }, [cancelPendingOperation, clearDragState, restoreBrowserRackAfterReplacement]);
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setResolvedModuleNamesByTypeId({});
      clearSelectedSlot();
      selectHull(hull);
    },
    [clearSelectedSlot, selectHull]
  );
  const handleSelectSlot = useCallback(
    (slot: SelectedFittingSlot) => {
      const fittedModule = fitState.slots[slot.rack].find(
        (candidate) => candidate.index === slot.index
      )?.module;

      restoreBrowserRackAfterReplacement();

      if (fittedModule) {
        openBrowserSection("charges");
      } else {
        setBrowserRack(slot.rack);
        openBrowserSection("modules");
      }

      setDragError(null);
      setManipulationError(null);
      setModuleActionMode(null);
      setSelectedSlot(slot);
    },
    [fitState.slots, openBrowserSection, restoreBrowserRackAfterReplacement]
  );
  const fitModuleAtSlot = useCallback(
    async (
      targetSlot: SelectedFittingSlot,
      typeId: number
    ): Promise<FitModuleAttemptResult> => {
      const result = await fitModule({ ...targetSlot, typeId });

      if (result.ok) {
        setResolvedModuleNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.module.typeId]: result.module.typeName
        }));
        clearSelectedSlot();
      }

      return result;
    },
    [clearSelectedSlot, fitModule]
  );
  const handleFitModule = useCallback(
    async (typeId: number): Promise<FitModuleAttemptResult> => {
      if (!selectedSlot) {
        return {
          message: "Select an empty socket before fitting a module.",
          ok: false
        };
      }

      return fitModuleAtSlot(selectedSlot, typeId);
    },
    [fitModuleAtSlot, selectedSlot]
  );
  const handleAutoFitModule = useCallback(
    async (
      module: FittingModuleSearchResult
    ): Promise<FitModuleAttemptResult> => {
      const emptySlots = fitState.slots[module.rack]
        .filter((slot) => !slot.module)
        .map((slot) => ({ index: slot.index, rack: module.rack }))
        .sort((left, right) => left.index - right.index);

      if (!emptySlots.length) {
        return {
          message: `No empty ${module.rack} slots are available.`,
          ok: false
        };
      }

      let lastSlotError: FitModuleAttemptResult | null = null;

      for (const targetSlot of emptySlots) {
        const result = await fitModuleAtSlot(targetSlot, module.typeId);

        if (result.ok) {
          return result;
        }

        if (result.code !== "SLOT_OCCUPIED" && result.code !== "INVALID_SLOT") {
          return result;
        }

        lastSlotError = result;
      }

      return (
        lastSlotError ?? {
          message: `No empty ${module.rack} slot can accept ${module.typeName}.`,
          ok: false
        }
      );
    },
    [fitModuleAtSlot, fitState.slots]
  );
  const handleReplaceModule = useCallback(
    async (typeId: number): Promise<FitModuleAttemptResult> => {
      const targetSlot = selectedSlot;

      if (!targetSlot || !selectedModule) {
        return {
          message: "Select a fitted module before replacing it.",
          ok: false
        };
      }

      const result = await replaceModule({ ...targetSlot, typeId });

      if (result.ok) {
        setResolvedModuleNamesByTypeId((currentNames) => ({
          ...currentNames,
          [result.module.typeId]: result.module.typeName
        }));
        clearSelectedSlot();
      }

      return result;
    },
    [clearSelectedSlot, replaceModule, selectedModule, selectedSlot]
  );
  const handleRemoveModuleAt = useCallback(
    async (slot: SelectedFittingSlot): Promise<FitOperationAttemptResult> => {
      const fittedModule = fitState.slots[slot.rack].find(
        (candidate) => candidate.index === slot.index
      )?.module;

      if (!fittedModule) {
        return {
          message: "Select a fitted module before removing it.",
          ok: false
        };
      }

      const result = await removeModule(slot);

      if (result.ok) {
        setDragError(null);

        if (
          selectedSlot?.rack === slot.rack &&
          selectedSlot.index === slot.index
        ) {
          clearSelectedSlot();
        } else {
          setManipulationError(null);
        }
      } else {
        setDragError(result.message);
        setManipulationError(result.message);
      }

      return result;
    },
    [clearSelectedSlot, fitState.slots, removeModule, selectedSlot]
  );
  const handleRemoveModule = useCallback(async (): Promise<FitOperationAttemptResult> => {
    if (!selectedSlot || !selectedModule) {
      return {
        message: "Select a fitted module before removing it.",
        ok: false
      };
    }

    return handleRemoveModuleAt(selectedSlot);
  }, [handleRemoveModuleAt, selectedModule, selectedSlot]);
  const handleStartMoveAt = useCallback(
    (slot: SelectedFittingSlot) => {
      restoreBrowserRackAfterReplacement();
      openBrowserSection("charges");
      setDragError(null);
      setManipulationError(null);
      setSelectedSlot(slot);
      setModuleActionMode("move");
    },
    [openBrowserSection, restoreBrowserRackAfterReplacement]
  );
  const handleStartReplaceAt = useCallback(
    (slot: SelectedFittingSlot) => {
      if (!browserRackBeforeReplacementRef.current) {
        browserRackBeforeReplacementRef.current = browserRack;
      }

      setBrowserRack(slot.rack);
      openBrowserSection("modules");
      setDragError(null);
      setManipulationError(null);
      setSelectedSlot(slot);
      setModuleActionMode("replace");
    },
    [browserRack, openBrowserSection]
  );
  const handleMoveTarget = useCallback(
    (target: SelectedFittingSlot) => {
      if (!selectedSlot || moduleActionMode !== "move") {
        return;
      }

      const result = moveModule({ from: selectedSlot, to: target });

      if (result.ok) {
        clearSelectedSlot();
      } else {
        setManipulationError(result.message);
      }
    },
    [clearSelectedSlot, moduleActionMode, moveModule, selectedSlot]
  );
  const handleModuleDragStart = useCallback(
    (module: FittingModuleSearchResult) => {
      setDragError(null);
      setManipulationError(null);
      setDragSource({
        kind: "browser-module",
        rack: module.rack,
        typeId: module.typeId,
        typeName: module.typeName
      });
    },
    []
  );
  const handleFittedModuleDragStart = useCallback(
    (source: Extract<FittingDragSource, { kind: "fitted-module" }>) => {
      setDragError(null);
      setManipulationError(null);
      setDragSource(source);
    },
    []
  );
  const handleDragOverSlot = useCallback((slot: SelectedFittingSlot | null) => {
    setDragOverSlot((currentSlot) =>
      currentSlot?.rack === slot?.rack && currentSlot?.index === slot?.index
        ? currentSlot
        : slot
    );
  }, []);
  const handleDropOnSlot = useCallback(
    async (target: SelectedFittingSlot) => {
      const source = dragSource;

      setDragOverSlot(null);
      setIsRemoveDragOver(false);

      if (!source) {
        return;
      }

      if (source.kind === "browser-module") {
        const result = await fitModuleAtSlot(target, source.typeId);

        if (!result.ok) {
          setDragError(result.message);
          clearDragState();
        }

        return;
      }

      const result = moveModule({ from: source.from, to: target });

      if (result.ok) {
        clearSelectedSlot();
      } else {
        setDragError(result.message);
        clearDragState();
      }
    },
    [clearDragState, clearSelectedSlot, dragSource, fitModuleAtSlot, moveModule]
  );
  const handleDropOnRemove = useCallback(async () => {
    const source = dragSource;

    setIsRemoveDragOver(false);

    if (!source || source.kind !== "fitted-module") {
      return;
    }

    const result = await removeModule(source.from);

    if (result.ok) {
      clearSelectedSlot();
    } else {
      setDragError(result.message);
      clearDragState();
    }
  }, [clearDragState, clearSelectedSlot, dragSource, removeModule]);

  useEffect(() => {
    if (!selectedSlot && !dragSource) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelectedSlot();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelectedSlot, dragSource, selectedSlot]);

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          actionMode={moduleActionMode}
          browserRack={browserRack}
          draggingModuleTypeId={
            dragSource?.kind === "browser-module" ? dragSource.typeId : null
          }
          hulls={hulls}
          manipulationError={manipulationError}
          onAutoFitModule={handleAutoFitModule}
          onClearSelectedSlot={clearSelectedSlot}
          onFitModule={handleFitModule}
          onModuleDragEnd={clearDragState}
          onModuleDragStart={handleModuleDragStart}
          onModuleRackChange={setBrowserRack}
          onRemoveModule={handleRemoveModule}
          onReplaceModule={handleReplaceModule}
          onReturnToActions={() => {
            restoreBrowserRackAfterReplacement();
            setManipulationError(null);
            setModuleActionMode(null);
          }}
          onSelectHull={handleSelectHull}
          onStartMove={() => {
            if (selectedSlot) {
              handleStartMoveAt(selectedSlot);
            }
          }}
          onStartReplace={() => {
            if (selectedSlot) {
              handleStartReplaceAt(selectedSlot);
            }
          }}
          onToggleSection={(section) => {
            setOpenBrowserSections((current) => ({
              ...current,
              [section]: !current[section]
            }));
          }}
          openSections={openBrowserSections}
          selectedHull={selectedHull}
          selectedModule={selectedModule}
          selectedModuleName={selectedModuleName}
          selectedSlot={selectedSlot}
        />
        <FittingStage
          analysis={analysis}
          dragError={dragError}
          dragOverSlot={dragOverSlot}
          dragSource={dragSource}
          isRemoveDragOver={isRemoveDragOver}
          moduleNamesByTypeId={resolvedModuleNamesByTypeId}
          moveSource={moduleActionMode === "move" ? selectedSlot : null}
          onDragEnd={clearDragState}
          onDragOverSlot={handleDragOverSlot}
          onDropOnRemove={handleDropOnRemove}
          onDropOnSlot={handleDropOnSlot}
          onFittedModuleDragStart={handleFittedModuleDragStart}
          onMoveTarget={handleMoveTarget}
          onRemoveModule={handleRemoveModuleAt}
          onRemoveDragOverChange={setIsRemoveDragOver}
          onSelectSlot={handleSelectSlot}
          onStartMove={handleStartMoveAt}
          onStartReplace={handleStartReplaceAt}
          selectedHull={selectedHull}
          selectedSlot={selectedSlot}
          slots={fitState.slots}
        />
        <FitStatistics />
      </div>
      <FittingResources
        analysis={analysis}
        selectedHull={selectedHull}
        warnings={fitWarnings}
      />
    </div>
  );
}
