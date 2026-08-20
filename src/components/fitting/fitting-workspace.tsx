"use client";

import { useCallback, useEffect, useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type {
  ModuleActionMode,
  SelectedFittingSlot
} from "@/components/fitting/fitting-ui-types";
import { ItemBrowser } from "@/components/fitting/item-browser";
import {
  useFittingState,
  type FitModuleAttemptResult,
  type FitOperationAttemptResult
} from "@/components/fitting/use-fitting-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

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
  const clearSelectedSlot = useCallback(() => {
    cancelPendingOperation();
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(null);
  }, [cancelPendingOperation]);
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setResolvedModuleNamesByTypeId({});
      clearSelectedSlot();
      selectHull(hull);
    },
    [clearSelectedSlot, selectHull]
  );
  const handleSelectSlot = useCallback((slot: SelectedFittingSlot) => {
    setManipulationError(null);
    setModuleActionMode(null);
    setSelectedSlot(slot);
  }, []);
  const handleFitModule = useCallback(
    async (typeId: number): Promise<FitModuleAttemptResult> => {
      const targetSlot = selectedSlot;

      if (!targetSlot) {
        return {
          message: "Select an empty socket before fitting a module.",
          ok: false
        };
      }

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
    [clearSelectedSlot, fitModule, selectedSlot]
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

  useEffect(() => {
    if (!selectedSlot) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelectedSlot();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelectedSlot, selectedSlot]);

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          actionMode={moduleActionMode}
          hulls={hulls}
          manipulationError={manipulationError}
          onClearSelectedSlot={clearSelectedSlot}
          onFitModule={handleFitModule}
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
          moduleNamesByTypeId={resolvedModuleNamesByTypeId}
          moveSource={moduleActionMode === "move" ? selectedSlot : null}
          onMoveTarget={handleMoveTarget}
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
