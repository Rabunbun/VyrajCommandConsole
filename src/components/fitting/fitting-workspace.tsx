import { FitStatistics } from "@/components/fitting/fit-statistics";
import { FittingHeader } from "@/components/fitting/fitting-header";
import { FittingResources } from "@/components/fitting/fitting-resources";
import { FittingStage } from "@/components/fitting/fitting-stage";
import { ItemBrowser } from "@/components/fitting/item-browser";

export function FittingWorkspace() {
  return (
    <div className="fitting-shell" aria-labelledby="fitting-bay-title">
      <FittingHeader />
      <div className="fitting-workspace-grid">
        <ItemBrowser />
        <FittingStage />
        <FitStatistics />
      </div>
      <FittingResources />
    </div>
  );
}
