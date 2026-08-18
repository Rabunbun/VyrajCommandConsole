import { StatusPip } from "@/components/module-visuals";
import type { FittingHullSummary } from "@/lib/fitting/types";

type FittingHeaderProps = {
  selectedHull: FittingHullSummary | null;
};

export function FittingHeader({ selectedHull }: FittingHeaderProps) {
  return (
    <header className="fitting-header">
      <div className="fitting-header-main">
        <div className="eyebrow">Vyraj Fitting Systems</div>
        <h1 className="page-title" id="fitting-bay-title">
          FITTING BAY
        </h1>
        <p className="page-copy">
          Ship Fitting Workspace
        </p>
      </div>
      <div className="fitting-header-state" aria-label="Fit state">
        <StatusPip
          label={selectedHull ? "Hull Selected" : "Hull Selection Ready"}
          tone={selectedHull ? "verified" : "info"}
        />
        <span className="badge" data-state="PENDING">
          Unsaved Fit
        </span>
      </div>
    </header>
  );
}
