import type { Metadata } from "next";
import { FittingWorkspace } from "@/components/fitting/fitting-workspace";
import { getFittingHullIndex } from "@/lib/fitting/hulls";
import { getCurrentOwnerSavedFittingLibrary } from "@/lib/fitting/saved/current-owner";
import { getCurrentFittingSimulationBootstrap } from "@/lib/fitting/simulation-server";

export const metadata: Metadata = {
  title: "Fitting Bay"
};

export const dynamic = "force-dynamic";

export default async function FittingBayPage() {
  const [hulls, savedFittings, simulationBootstrap] = await Promise.all([
    getFittingHullIndex(),
    getCurrentOwnerSavedFittingLibrary(),
    getCurrentFittingSimulationBootstrap()
  ]);

  return (
    <div className="fitting-route-wide">
      <FittingWorkspace
        hulls={hulls}
        initialSavedFittings={savedFittings}
        simulationBootstrap={simulationBootstrap}
      />
    </div>
  );
}
