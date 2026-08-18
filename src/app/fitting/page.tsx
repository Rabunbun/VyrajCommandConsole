import type { Metadata } from "next";
import { FittingWorkspace } from "@/components/fitting/fitting-workspace";

export const metadata: Metadata = {
  title: "Fitting Bay"
};

export default function FittingBayPage() {
  return <FittingWorkspace />;
}
