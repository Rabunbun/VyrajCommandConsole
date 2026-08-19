"use client";

import { useCallback, useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import type { SelectedFittingSlot } from "@/components/fitting/fitting-ui-types";
import { ItemBrowser } from "@/components/fitting/item-browser";
import { useFittingState } from "@/components/fitting/use-fitting-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
};

export function FittingWorkspace({ hulls }: FittingWorkspaceProps) {
  const { fitState, selectHull, selectedHull } = useFittingState({ hulls });
  const [selectedSlot, setSelectedSlot] = useState<SelectedFittingSlot | null>(null);
  const handleSelectHull = useCallback(
    (hull: FittingHullSummary) => {
      setSelectedSlot(null);
      selectHull(hull);
    },
    [selectHull]
  );

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          hulls={hulls}
          onClearSelectedSlot={() => setSelectedSlot(null)}
          onSelectHull={handleSelectHull}
          selectedHull={selectedHull}
          selectedSlot={selectedSlot}
        />
        <FittingStage
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
