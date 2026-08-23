import assert from "node:assert/strict";
import test from "node:test";

import { EftFormatError, formatEft } from "./formatter";
import {
  COMPREHENSIVE_EFT_FIXTURE,
  FULL_EMPTY_EFT_FIXTURE,
  MALFORMED_HEADER_FIXTURE,
  MALFORMED_QUANTITY_FIXTURE,
  PUNCTUATION_EFT_FIXTURE,
  VYRAJ_EXPECTED_EFT,
  VYRAJ_EXPORT_FIXTURE,
} from "./fixtures";
import { parseEft } from "./parser";
import type { EftExportDocument, EftParsedModuleLine, EftParsedSlotLine } from "./types";

function parsedModule(value: unknown): EftParsedModuleLine {
  assert.ok(value && typeof value === "object" && "kind" in value && value.kind === "module");
  return value as EftParsedModuleLine;
}

test("parses canonical racks without relocating duplicates, charges, scripts, or probes", () => {
  const result = parseEft(COMPREHENSIVE_EFT_FIXTURE);
  assert.ok(result.document);
  assert.equal(result.document.header.hullName, "Vexor Navy Issue");
  assert.equal(result.document.header.fitName, "Commas, Charges & Drones");
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.document.slots).map(([rack, lines]) => [rack, lines.length])),
    { low: 4, mid: 3, high: 5, rig: 3 },
  );
  assert.equal(parsedModule(result.document.slots.low[0]).unresolvedText, "Drone Damage Amplifier II");
  assert.equal(parsedModule(result.document.slots.low[1]).unresolvedText, "Drone Damage Amplifier II");
  assert.equal(result.document.slots.low[2].kind, "empty");

  assert.equal(parsedModule(result.document.slots.high[0]).unresolvedText, "Light Electron Blaster II");
  assert.equal(parsedModule(result.document.slots.high[0]).chargeSplitCandidates.length, 0);
  const railgun = parsedModule(result.document.slots.high[1]);
  assert.deepEqual(railgun.chargeSplitCandidates, [
    {
      commaIndex: 16,
      moduleName: "200mm Railgun II",
      chargeName: "Caldari Navy Antimatter Charge M",
    },
  ]);
  assert.equal(parsedModule(result.document.slots.high[2]).chargeSplitCandidates[0].chargeName, "Caldari Navy Scourge Light Missile");
  assert.equal(parsedModule(result.document.slots.high[3]).chargeSplitCandidates[0].chargeName, "Sisters Core Scanner Probe");
  assert.equal(parsedModule(result.document.slots.mid[1]).chargeSplitCandidates[0].chargeName, "Tracking Speed Script");
});

test("retains offline requests and every plausible comma split without choosing one", () => {
  const result = parseEft(PUNCTUATION_EFT_FIXTURE);
  assert.ok(result.document);
  const line = parsedModule(result.document.slots.high[0]);
  assert.equal(line.unresolvedText, "Experimental, Prototype Module, Charge, Mark II");
  assert.equal(line.offlineRequested, true);
  assert.equal(line.chargeSplitCandidates.length, 3);
  assert.deepEqual(
    line.chargeSplitCandidates.map((candidate) => candidate.commaIndex),
    [12, 30, 38],
  );
  assert.ok(result.diagnostics.some((entry) => entry.code === "OFFLINE_STATE_UNSUPPORTED"));
});

test("keeps unsupported blocks, source locations, drone repetitions, and cargo separate", () => {
  const result = parseEft(COMPREHENSIVE_EFT_FIXTURE);
  assert.ok(result.document);
  assert.equal(result.document.subsystems[0].text, "Legion Defensive - Covert Reconfiguration");
  assert.equal(result.document.services[0].text, "Standup Multirole Missile Launcher I");
  assert.deepEqual(
    result.document.droneAndFighterBay.map(({ itemName, quantity }) => [itemName, quantity]),
    [
      ["Hobgoblin II", 5],
      ["Warrior II", 2],
      ["Hobgoblin II", 1],
    ],
  );
  assert.deepEqual(
    result.document.cargo.map(({ itemName, quantity }) => [itemName, quantity]),
    [
      ["Nanite Repair Paste", 100],
      ["Mobile Depot", 1],
    ],
  );
  assert.deepEqual(result.document.unsupportedBlocks.map((block) => block.kind), [
    "subsystem",
    "service",
    "cargo",
    "extension",
    "extension",
  ]);
  assert.ok(result.document.unsupportedBlocks.every((block) => block.lines.every((line) => line.lineNumber > 0)));
});

test("accepts explicit empty markers and preserves every slot index", () => {
  const result = parseEft(FULL_EMPTY_EFT_FIXTURE);
  assert.equal(result.ok, true);
  assert.ok(result.document);
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.document.slots).map(([rack, lines]) => [rack, lines.map((line) => line.index)])),
    { low: [0, 1], mid: [0, 1, 2], high: [0, 1, 2], rig: [0, 1, 2] },
  );
  assert.ok(Object.values(result.document.slots).flat().every((line) => line.kind === "empty"));
});

test("reports a malformed header without inventing a document", () => {
  const result = parseEft(MALFORMED_HEADER_FIXTURE);
  assert.equal(result.ok, false);
  assert.equal(result.document, null);
  assert.equal(result.diagnostics[0].code, "MALFORMED_HEADER");
});

test("accepts a valid header with an empty fit name", () => {
  const result = parseEft("[Merlin, ]\n");
  assert.equal(result.ok, true);
  assert.ok(result.document);
  assert.equal(result.document.header.hullName, "Merlin");
  assert.equal(result.document.header.fitName, "");
});

test("reports invalid, zero, and unsafe quantities without silently coercing them", () => {
  const result = parseEft(MALFORMED_QUANTITY_FIXTURE);
  assert.equal(result.ok, false);
  assert.ok(result.document);
  assert.deepEqual(result.document.droneAndFighterBay.map((line) => line.quantity), [null, null, null]);
  assert.equal(result.diagnostics.filter((entry) => entry.code === "MALFORMED_QUANTITY").length, 3);
});

test("formats resolved data deterministically with explicit empties and canonical drone order", () => {
  const first = formatEft(VYRAJ_EXPORT_FIXTURE);
  const second = formatEft(VYRAJ_EXPORT_FIXTURE);
  assert.equal(first, VYRAJ_EXPECTED_EFT);
  assert.equal(second, first);
  assert.equal(first.includes("\r"), false);
  assert.match(first, /\n$/);
  assert.doesNotMatch(first, /\n\n$/);
  assert.ok(first.split("\n").every((line) => !line.endsWith(" ")));
});

test("Vyraj export parses back to the same supported slot structure", () => {
  const parsed = parseEft(formatEft(VYRAJ_EXPORT_FIXTURE));
  assert.equal(parsed.ok, true);
  const document = parsed.document;
  assert.ok(document);
  for (const rack of ["low", "mid", "high", "rig"] as const) {
    const expected = VYRAJ_EXPORT_FIXTURE.slots[rack];
    const actual: EftParsedSlotLine[] = document.slots[rack];
    assert.equal(actual.length, expected.length);
    assert.deepEqual(actual.map((line) => line.index), expected.map((line) => line.index));
    assert.deepEqual(
      actual.map((line) => line.kind),
      expected.map((slot) => (slot.moduleName === null ? "empty" : "module")),
    );
  }
  assert.deepEqual(
    document.droneAndFighterBay.map(({ itemName, quantity }) => ({ itemName, quantity })),
    [
      { itemName: "Hobgoblin II", quantity: 5 },
      { itemName: "Warrior II", quantity: 2 },
    ],
  );
  assert.deepEqual(
    document.cargo.map(({ itemName, quantity }) => ({ itemName, quantity })),
    [
      { itemName: "Mobile Depot", quantity: 1 },
      { itemName: "Nanite Repair Paste", quantity: 100 },
    ],
  );
});

test("formatter rejects structurally invalid indices and quantities", () => {
  const missingIndex: EftExportDocument = {
    ...VYRAJ_EXPORT_FIXTURE,
    slots: {
      ...VYRAJ_EXPORT_FIXTURE.slots,
      low: [{ index: 1, moduleName: "Damage Control II", chargeName: null }],
    },
  };
  assert.throws(() => formatEft(missingIndex), EftFormatError);

  const invalidQuantity: EftExportDocument = {
    ...VYRAJ_EXPORT_FIXTURE,
    drones: [{ typeId: 2456, typeName: "Hobgoblin II", quantity: 0 }],
  };
  assert.throws(() => formatEft(invalidQuantity), EftFormatError);

  const invalidCargoQuantity: EftExportDocument = {
    ...VYRAJ_EXPORT_FIXTURE,
    cargo: [{ typeId: 28668, typeName: "Nanite Repair Paste", quantity: 0 }],
  };
  assert.throws(() => formatEft(invalidCargoQuantity), EftFormatError);
});

test("formatter aggregates repeated cargo by typeId in canonical order", () => {
  const formatted = formatEft({
    ...VYRAJ_EXPORT_FIXTURE,
    cargo: [
      { typeId: 28668, typeName: "Nanite Repair Paste", quantity: 40 },
      { typeId: 33474, typeName: "Mobile Depot", quantity: 1 },
      { typeId: 28668, typeName: "Nanite Repair Paste", quantity: 60 },
    ],
  });
  assert.match(formatted, /Mobile Depot x1\nNanite Repair Paste x100\n$/);
});
