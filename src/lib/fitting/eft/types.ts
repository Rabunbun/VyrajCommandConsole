export const EFT_SUPPORTED_RACKS = ["low", "mid", "high", "rig"] as const;

export type EftSupportedRack = (typeof EFT_SUPPORTED_RACKS)[number];

export type EftSourceLine = {
  lineNumber: number;
  rawText: string;
  text: string;
};

export type EftParseDiagnosticSeverity = "error" | "warning";

export type EftParseDiagnosticCode =
  | "EMPTY_INPUT"
  | "MALFORMED_HEADER"
  | "MISSING_HULL_NAME"
  | "EMPTY_SLOT_RACK_MISMATCH"
  | "EMPTY_FITTED_LINE"
  | "MALFORMED_QUANTITY"
  | "OFFLINE_STATE_UNSUPPORTED"
  | "UNSUPPORTED_SECTION";

export type EftParseDiagnostic = {
  severity: EftParseDiagnosticSeverity;
  code: EftParseDiagnosticCode;
  message: string;
  lineNumber: number | null;
  rawText: string | null;
};

export type EftModuleChargeSplitCandidate = {
  commaIndex: number;
  moduleName: string;
  chargeName: string;
};

export type EftParsedEmptySlotLine = {
  kind: "empty";
  rack: EftSupportedRack;
  index: number;
  declaredRack: EftSupportedRack;
  source: EftSourceLine;
};

export type EftParsedModuleLine = {
  kind: "module";
  rack: EftSupportedRack;
  index: number;
  unresolvedText: string;
  offlineRequested: boolean;
  chargeSplitCandidates: EftModuleChargeSplitCandidate[];
  source: EftSourceLine;
};

export type EftParsedSlotLine = EftParsedEmptySlotLine | EftParsedModuleLine;

export type EftParsedQuantityLine = {
  itemName: string;
  quantity: number | null;
  explicitQuantity: boolean;
  source: EftSourceLine;
};

export type EftUnsupportedBlockKind =
  | "subsystem"
  | "service"
  | "cargo"
  | "extension";

export type EftUnsupportedBlock = {
  kind: EftUnsupportedBlockKind;
  lines: EftSourceLine[];
};

export type EftParsedDocument = {
  header: {
    hullName: string;
    fitName: string;
    source: EftSourceLine;
  };
  slots: Record<EftSupportedRack, EftParsedSlotLine[]>;
  subsystems: EftSourceLine[];
  services: EftSourceLine[];
  droneAndFighterBay: EftParsedQuantityLine[];
  cargo: EftParsedQuantityLine[];
  unsupportedBlocks: EftUnsupportedBlock[];
};

export type EftParseResult = {
  ok: boolean;
  document: EftParsedDocument | null;
  diagnostics: EftParseDiagnostic[];
};

export type EftExportSlot = {
  index: number;
  moduleName: string | null;
  chargeName: string | null;
};

export type EftExportDrone = {
  typeId: number;
  typeName: string;
  quantity: number;
};

export type EftExportDocument = {
  hullName: string;
  fitName: string;
  slots: Record<EftSupportedRack, EftExportSlot[]>;
  drones: EftExportDrone[];
};
