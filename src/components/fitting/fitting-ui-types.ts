import type { BrowsableFittingRack } from "@/lib/fitting/types";

export type SelectedFittingSlot = {
  index: number;
  rack: BrowsableFittingRack;
};

export type ModuleActionMode = "move" | "replace" | null;

export type FittingBrowserSection = "charges" | "drones" | "hulls" | "modules";

export type FittingDragSource =
  | {
      kind: "browser-module";
      rack: BrowsableFittingRack;
      typeId: number;
      typeName: string;
    }
  | {
      from: SelectedFittingSlot;
      instanceId: string;
      kind: "fitted-module";
      typeId: number;
    };
