"use client";

import { useCallback, useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type { SelectedFittingSlot } from "@/components/fitting/fitting-ui-types";
import { ItemBrowser } from "@/components/fitting/item-browser";
import {
  useFittingState,
  type FitModuleAttemptResult
} from "@/components/fitting/use-fitting-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
};

export function FittingWorkspace({ hulls }: FittingWorkspaceProps) {
  const { fitModule, fitState, selectHull, selectedHull } = useFittingState({ hulls });
  const [selectedSlot, setSelectedSlot] = useState<SelectedFittingSlot | null>(null);
  const [resolvedModuleNamesByTypeId, setResolvedModuleNamesByTypeId] = useState<
    Record<number, string>
  >({});
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setResolvedModuleNamesByTypeId({});
      setSelectedSlot(null);
      selectHull(hull);
    },
    [selectHull]
  );
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
        setSelectedSlot((currentSlot) =>
          currentSlot?.rack === targetSlot.rack &&
          currentSlot.index === targetSlot.index
            ? null
            : currentSlot
        );
      }

      return result;
    },
    [fitModule, selectedSlot]
  );

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          hulls={hulls}
          onClearSelectedSlot={() => setSelectedSlot(null)}
          onFitModule={handleFitModule}
          onSelectHull={handleSelectHull}
          selectedHull={selectedHull}
          selectedSlot={selectedSlot}
        />
        <FittingStage
          moduleNamesByTypeId={resolvedModuleNamesByTypeId}
          onSelectSlot={setSelectedSlot}
          selectedHull={selectedHull}
          selectedSlot={selectedSlot}
          slots={fitState.slots}
        />
        <FitStatistics />
      </div>
      <FittingResources selectedHull={selectedHull} />
    </div>
  );
}
