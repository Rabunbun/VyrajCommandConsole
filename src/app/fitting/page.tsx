import type { Metadata } from "next";
import { FittingWorkspace } from "@/components/fitting/fitting-workspace";
import { getFittingHullIndex } from "@/lib/fitting/hulls";

export const metadata: Metadata = {
  title: "Fitting Bay"
};

export const dynamic = "force-dynamic";

export default async function FittingBayPage() {
  const hulls = await getFittingHullIndex();

  return <FittingWorkspace hulls={hulls} />;
}
