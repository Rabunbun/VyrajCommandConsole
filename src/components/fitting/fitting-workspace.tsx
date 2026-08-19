"use client";

import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import { ItemBrowser } from "@/components/fitting/item-browser";
import { useFittingState } from "@/components/fitting/use-fitting-state";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
};

export function FittingWorkspace({ hulls }: FittingWorkspaceProps) {
  const { fitState, selectHull, selectedHull } = useFittingState({ hulls });

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          hulls={hulls}
          onSelectHull={selectHull}
          selectedHull={selectedHull}
        />
        <FittingStage selectedHull={selectedHull} slots={fitState.slots} />
        <FitStatistics />
      </div>
      <FittingResources selectedHull={selectedHull} />
    </div>
  );
}
