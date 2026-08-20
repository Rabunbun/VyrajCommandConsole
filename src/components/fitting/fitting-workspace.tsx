"use client";

import { useCallback, useEffect, useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type {
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
  const [manipulationError, setManipulationError] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<FittingDragSource | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<SelectedFittingSlot | null>(null);
  const [isRemoveDragOver, setIsRemoveDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [resolvedModuleNamesByTypeId, setResolvedModuleNamesByTypeId] = useState<
    Record<number, string>
  >({});
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
  const clearSelectedSlot = useCallback(() => {
    cancelPendingOperation();
    clearDragState();
    setDragError(null);
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(null);
  }, [cancelPendingOperation, clearDragState]);
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setResolvedModuleNamesByTypeId({});
      clearSelectedSlot();
      selectHull(hull);
    },
    [clearSelectedSlot, selectHull]
  );
  const handleSelectSlot = useCallback((slot: SelectedFittingSlot) => {
    setDragError(null);
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(slot);
  }, []);
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
  const handleRemoveModule = useCallback(async (): Promise<FitOperationAttemptResult> => {
    if (!selectedSlot || !selectedModule) {
      return {
        message: "Select a fitted module before removing it.",
        ok: false
      };
    }

    const result = await removeModule(selectedSlot);

    if (result.ok) {
      clearSelectedSlot();
    } else {
      setManipulationError(result.message);
    }

    return result;
  }, [clearSelectedSlot, removeModule, selectedModule, selectedSlot]);
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
          draggingModuleTypeId={
            dragSource?.kind === "browser-module" ? dragSource.typeId : null
          }
          hulls={hulls}
          manipulationError={manipulationError}
          onClearSelectedSlot={clearSelectedSlot}
          onFitModule={handleFitModule}
          onModuleDragEnd={clearDragState}
          onModuleDragStart={handleModuleDragStart}
          onRemoveModule={handleRemoveModule}
          onReplaceModule={handleReplaceModule}
          onReturnToActions={() => {
            setManipulationError(null);
            setModuleActionMode(null);
          }}
          onSelectHull={handleSelectHull}
          onStartMove={() => {
            setManipulationError(null);
            setModuleActionMode("move");
          }}
          onStartReplace={() => {
            setManipulationError(null);
            setModuleActionMode("replace");
          }}
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
          onRemoveDragOverChange={setIsRemoveDragOver}
          onSelectSlot={handleSelectSlot}
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
