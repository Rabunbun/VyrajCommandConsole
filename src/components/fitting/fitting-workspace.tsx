"use client";

import { useState } from "react";
import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import { ItemBrowser } from "@/components/fitting/item-browser";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingWorkspaceProps = {
  hulls: FittingHullSummary[];
};

export function FittingWorkspace({ hulls }: FittingWorkspaceProps) {
  const [selectedHull, setSelectedHull] = useState<FittingHullSummary | null>(null);

  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader selectedHull={selectedHull} />
      <div className="fitting-workspace-grid">
        <ItemBrowser
          hulls={hulls}
          onSelectHull={setSelectedHull}
          selectedHull={selectedHull}
        />
        <FittingStage selectedHull={selectedHull} />
        <FitStatistics />
      </div>
      <FittingResources selectedHull={selectedHull} />
    </div>
  );
}
