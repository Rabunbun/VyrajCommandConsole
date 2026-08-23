import type { BrowsableFittingRack } from "@/lib/fitting/types";

export type SelectedFittingSlot = {
  index: number;
  rack: BrowsableFittingRack;
};

export type ModuleActionMode = "move" | "replace" | null;

export type FittingBrowserSection =
  | "cargo"
  | "charges"
  | "drones"
  | "hulls"
  | "modules";

export type FittingDragSource =
  | {
      kind: "browser-module";
      rack: BrowsableFittingRack;
      typeId: number;
      typeName: string;
    }
  | {
      kind: "browser-charge";
      typeId: number;
      typeName: string;
    }
  | {
      kind: "browser-drone";
      typeId: number;
      typeName: string;
    }
  | {
      kind: "browser-cargo";
      typeId: number;
      typeName: string;
    }
  | {
      from: SelectedFittingSlot;
      instanceId: string;
      kind: "fitted-module";
      typeId: number;
    };

export type BrowserFittingDragSource = Extract<
  FittingDragSource,
  {
    kind:
      | "browser-cargo"
      | "browser-charge"
      | "browser-drone"
      | "browser-module";
  }
>;
