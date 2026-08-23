import type {
  EftModuleChargeSplitCandidate,
  EftParseDiagnostic,
  EftParseResult,
  EftParsedDocument,
  EftParsedQuantityLine,
  EftParsedSlotLine,
  EftSourceLine,
  EftSupportedRack,
  EftUnsupportedBlock,
  EftUnsupportedBlockKind,
} from "./types";

type ParserSection =
  | EftSupportedRack
  | "subsystem"
  | "service"
  | "drone"
  | "cargo"
  | "extension";

const EMPTY_SLOT_PATTERN = /^\[Empty\s+(low|med|mid|high|rig)\s+slot\]$/i;
const QUANTITY_PATTERN = /^(.*\S)\s+[xX](\d+)$/;
const QUANTITY_LIKE_SUFFIX_PATTERN = /\s+[xX]\S+\s*$/;

function sourceLine(rawText: string, lineNumber: number): EftSourceLine {
  return { lineNumber, rawText, text: rawText.trim() };
}

function normalizeRack(value: string): EftSupportedRack {
  return value.toLowerCase() === "med"
    ? "mid"
    : (value.toLowerCase() as EftSupportedRack);
}

function diagnostic(
  severity: "error" | "warning",
  code: EftParseDiagnostic["code"],
  message: string,
  source: EftSourceLine | null,
): EftParseDiagnostic {
  return {
    severity,
    code,
    message,
    lineNumber: source?.lineNumber ?? null,
    rawText: source?.rawText ?? null,
  };
}

function parseHeader(
  source: EftSourceLine,
  diagnostics: EftParseDiagnostic[],
): EftParsedDocument["header"] | null {
  if (!source.text.startsWith("[") || !source.text.endsWith("]")) {
    diagnostics.push(
      diagnostic("error", "MALFORMED_HEADER", "Expected an EFT header in the form [Hull Type, Fit Name].", source),
    );
    return null;
  }

  const body = source.text.slice(1, -1);
  const separatorIndex = body.indexOf(",");
  if (separatorIndex < 0) {
    diagnostics.push(
      diagnostic("error", "MALFORMED_HEADER", "The EFT header must contain a hull and fit name separated by a comma.", source),
    );
    return null;
  }

  const hullName = body.slice(0, separatorIndex).trim();
  const fitName = body.slice(separatorIndex + 1).trim();
  if (!hullName) {
    diagnostics.push(
      diagnostic("error", "MISSING_HULL_NAME", "The EFT header does not contain a hull name.", source),
    );
    return null;
  }

  return { hullName, fitName, source };
}

function stripOfflineMarker(text: string): {
  unresolvedText: string;
  offlineRequested: boolean;
} {
  let unresolvedText = text;
  let offlineRequested = false;

  unresolvedText = unresolvedText.replace(/\s+\/offline(?=\s*,)/gi, () => {
    offlineRequested = true;
    return "";
  });
  unresolvedText = unresolvedText.replace(/\s+\/offline\s*$/i, () => {
    offlineRequested = true;
    return "";
  });

  return { unresolvedText: unresolvedText.trim(), offlineRequested };
}

function findChargeSplitCandidates(text: string): EftModuleChargeSplitCandidate[] {
  const candidates: EftModuleChargeSplitCandidate[] = [];
  for (let index = text.indexOf(","); index >= 0; index = text.indexOf(",", index + 1)) {
    const moduleName = text.slice(0, index).trim();
    const chargeName = text.slice(index + 1).trim();
    if (moduleName && chargeName) {
      candidates.push({ commaIndex: index, moduleName, chargeName });
    }
  }
  return candidates;
}

function parseSlotLine(
  rack: EftSupportedRack,
  index: number,
  source: EftSourceLine,
  diagnostics: EftParseDiagnostic[],
): EftParsedSlotLine {
  const emptyMatch = source.text.match(EMPTY_SLOT_PATTERN);
  if (emptyMatch) {
    const declaredRack = normalizeRack(emptyMatch[1]);
    if (declaredRack !== rack) {
      diagnostics.push(
        diagnostic(
          "error",
          "EMPTY_SLOT_RACK_MISMATCH",
          `An empty ${declaredRack} slot marker appeared in the ${rack} section.`,
          source,
        ),
      );
    }
    return { kind: "empty", rack, index, declaredRack, source };
  }

  const { unresolvedText, offlineRequested } = stripOfflineMarker(source.text);
  if (offlineRequested) {
    diagnostics.push(
      diagnostic(
        "warning",
        "OFFLINE_STATE_UNSUPPORTED",
        "The requested offline state was retained for later handling but is not otherwise interpreted.",
        source,
      ),
    );
  }
  if (!unresolvedText) {
    diagnostics.push(
      diagnostic("error", "EMPTY_FITTED_LINE", "The fitted line contains no unresolved item text.", source),
    );
  }

  return {
    kind: "module",
    rack,
    index,
    unresolvedText,
    offlineRequested,
    chargeSplitCandidates: findChargeSplitCandidates(unresolvedText),
    source,
  };
}

function parseQuantityLine(
  source: EftSourceLine,
  diagnostics: EftParseDiagnostic[],
): EftParsedQuantityLine {
  const match = source.text.match(QUANTITY_PATTERN);
  if (!match) {
    if (QUANTITY_LIKE_SUFFIX_PATTERN.test(source.text)) {
      diagnostics.push(
        diagnostic(
          "error",
          "MALFORMED_QUANTITY",
          "A trailing quantity must use xN with a positive safe integer.",
          source,
        ),
      );
      return { itemName: source.text, quantity: null, explicitQuantity: true, source };
    }
    return { itemName: source.text, quantity: 1, explicitQuantity: false, source };
  }

  const itemName = match[1].trim();
  const parsedQuantity = Number(match[2]);
  const quantity =
    Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null;

  if (!itemName || quantity === null) {
    diagnostics.push(
      diagnostic(
        "error",
        "MALFORMED_QUANTITY",
        "A trailing quantity must use xN with a non-empty item name and positive safe integer.",
        source,
      ),
    );
  }

  return { itemName, quantity, explicitQuantity: true, source };
}

function advanceSection(section: ParserSection): ParserSection {
  switch (section) {
    case "low":
      return "mid";
    case "mid":
      return "high";
    case "high":
      return "rig";
    case "rig":
      return "subsystem";
    case "subsystem":
      return "service";
    case "service":
      return "drone";
    case "drone":
      return "cargo";
    case "cargo":
      return "extension";
    case "extension":
      return "extension";
  }
}

function nextSection(section: ParserSection, blankCount: number): ParserSection {
  let next = section;
  for (let index = 0; index < blankCount; index += 1) {
    next = advanceSection(next);
  }
  return next;
}

function appendUnsupportedBlock(
  blocks: EftUnsupportedBlock[],
  kind: EftUnsupportedBlockKind,
  lines: EftSourceLine[],
): void {
  if (lines.length > 0) {
    blocks.push({ kind, lines: [...lines] });
  }
}

export function parseEft(input: string): EftParseResult {
  const diagnostics: EftParseDiagnostic[] = [];
  const normalizedInput = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rawLines = normalizedInput.split("\n");
  const headerIndex = rawLines.findIndex((line) => line.trim().length > 0);

  if (headerIndex < 0) {
    diagnostics.push(diagnostic("error", "EMPTY_INPUT", "The EFT text is empty.", null));
    return { ok: false, document: null, diagnostics };
  }

  const headerSource = sourceLine(rawLines[headerIndex], headerIndex + 1);
  const header = parseHeader(headerSource, diagnostics);
  if (!header) {
    return { ok: false, document: null, diagnostics };
  }

  const document: EftParsedDocument = {
    header,
    slots: { low: [], mid: [], high: [], rig: [] },
    subsystems: [],
    services: [],
    droneAndFighterBay: [],
    cargo: [],
    unsupportedBlocks: [],
  };

  let section: ParserSection = "low";
  let blankCount = 0;
  let extensionLines: EftSourceLine[] = [];
  const extensionBlocks: EftSourceLine[][] = [];

  for (let rawIndex = headerIndex + 1; rawIndex < rawLines.length; rawIndex += 1) {
    const source = sourceLine(rawLines[rawIndex], rawIndex + 1);
    if (!source.text) {
      blankCount += 1;
      continue;
    }

    if (blankCount > 0) {
      if (section === "extension" && extensionLines.length > 0) {
        extensionBlocks.push(extensionLines);
        extensionLines = [];
      }
      section = nextSection(section, blankCount);
      blankCount = 0;
    }

    if (section === "low" || section === "mid" || section === "high" || section === "rig") {
      const lines = document.slots[section];
      lines.push(parseSlotLine(section, lines.length, source, diagnostics));
    } else if (section === "subsystem") {
      document.subsystems.push(source);
    } else if (section === "service") {
      document.services.push(source);
    } else if (section === "drone") {
      document.droneAndFighterBay.push(parseQuantityLine(source, diagnostics));
    } else if (section === "cargo") {
      document.cargo.push(parseQuantityLine(source, diagnostics));
    } else {
      extensionLines.push(source);
    }
  }

  appendUnsupportedBlock(document.unsupportedBlocks, "subsystem", document.subsystems);
  appendUnsupportedBlock(document.unsupportedBlocks, "service", document.services);
  appendUnsupportedBlock(
    document.unsupportedBlocks,
    "cargo",
    document.cargo.map((line) => line.source),
  );
  if (extensionLines.length > 0) {
    extensionBlocks.push(extensionLines);
  }
  for (const lines of extensionBlocks) {
    appendUnsupportedBlock(document.unsupportedBlocks, "extension", lines);
  }

  for (const block of document.unsupportedBlocks) {
    diagnostics.push(
      diagnostic(
        "warning",
        "UNSUPPORTED_SECTION",
        `The ${block.kind} block was retained but is not supported by the current fit state.`,
        block.lines[0] ?? null,
      ),
    );
  }

  return {
    ok: !diagnostics.some((entry) => entry.severity === "error"),
    document,
    diagnostics,
  };
}
