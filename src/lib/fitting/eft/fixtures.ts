import type { EftExportDocument } from "./types";

function eft(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

export const COMPREHENSIVE_EFT_FIXTURE = eft([
  "[Vexor Navy Issue, Commas, Charges & Drones]",
  "Drone Damage Amplifier II",
  "Drone Damage Amplifier II",
  "[Empty low slot]",
  "Damage Control II /offline",
  "",
  "10MN Afterburner II",
  "Tracking Computer II, Tracking Speed Script",
  "[Empty med slot]",
  "",
  "Light Electron Blaster II",
  "200mm Railgun II, Caldari Navy Antimatter Charge M",
  "Rapid Light Missile Launcher II, Caldari Navy Scourge Light Missile",
  "Core Probe Launcher I, Sisters Core Scanner Probe",
  "[Empty high slot]",
  "",
  "Medium Core Defense Field Extender I",
  "[Empty rig slot]",
  "Medium Core Defense Field Extender I",
  "",
  "Legion Defensive - Covert Reconfiguration",
  "",
  "Standup Multirole Missile Launcher I",
  "",
  "Hobgoblin II x5",
  "Warrior II x2",
  "Hobgoblin II x1",
  "",
  "Nanite Repair Paste x100",
  "Mobile Depot x1",
  "",
  "Implants & Boosters",
  "Mid-grade Asklepian Alpha",
  "",
  "Mutated item data: 12,34,56",
]);

export const FULL_EMPTY_EFT_FIXTURE = eft([
  "[Merlin, Empty Shell]",
  "[Empty low slot]",
  "[Empty low slot]",
  "",
  "[Empty med slot]",
  "[Empty med slot]",
  "[Empty med slot]",
  "",
  "[Empty high slot]",
  "[Empty high slot]",
  "[Empty high slot]",
  "",
  "[Empty rig slot]",
  "[Empty rig slot]",
  "[Empty rig slot]",
]);

export const PUNCTUATION_EFT_FIXTURE = eft([
  "[Gnosis, Punctuation]",
  "Damage Control II",
  "",
  "[Empty med slot]",
  "",
  "Experimental, Prototype Module, Charge, Mark II /offline",
  "",
  "[Empty rig slot]",
]);

export const MALFORMED_HEADER_FIXTURE = "Vexor, Missing Brackets\n";

export const MALFORMED_QUANTITY_FIXTURE = eft([
  "[Vexor, Broken Quantity]",
  "Damage Control II",
  "",
  "10MN Afterburner II",
  "",
  "Drone Link Augmentor I",
  "",
  "Medium Trimark Armor Pump I",
  "",
  "",
  "",
  "Hobgoblin II x0",
  "Warrior II x9007199254740992",
  "Hammerhead II xmany",
]);

export const VYRAJ_EXPORT_FIXTURE: EftExportDocument = {
  hullName: "Vexor",
  fitName: "Vyraj Structural Round Trip",
  slots: {
    low: [
      { index: 0, moduleName: "Damage Control II", chargeName: null },
      { index: 1, moduleName: null, chargeName: null },
      { index: 2, moduleName: "Drone Damage Amplifier II", chargeName: null },
    ],
    mid: [
      { index: 0, moduleName: "10MN Afterburner II", chargeName: null },
      { index: 1, moduleName: "Tracking Computer II", chargeName: "Tracking Speed Script" },
    ],
    high: [
      {
        index: 0,
        moduleName: "200mm Railgun II",
        chargeName: "Caldari Navy Antimatter Charge M",
      },
      { index: 1, moduleName: null, chargeName: null },
      {
        index: 2,
        moduleName: "Core Probe Launcher I",
        chargeName: "Sisters Core Scanner Probe",
      },
    ],
    rig: [
      { index: 0, moduleName: "Medium Trimark Armor Pump I", chargeName: null },
      { index: 1, moduleName: null, chargeName: null },
    ],
  },
  drones: [
    { typeId: 2488, typeName: "Warrior II", quantity: 2 },
    { typeId: 2456, typeName: "Hobgoblin II", quantity: 5 },
  ],
};

export const VYRAJ_EXPECTED_EFT = eft([
  "[Vexor, Vyraj Structural Round Trip]",
  "Damage Control II",
  "[Empty low slot]",
  "Drone Damage Amplifier II",
  "",
  "10MN Afterburner II",
  "Tracking Computer II, Tracking Speed Script",
  "",
  "200mm Railgun II, Caldari Navy Antimatter Charge M",
  "[Empty high slot]",
  "Core Probe Launcher I, Sisters Core Scanner Probe",
  "",
  "Medium Trimark Armor Pump I",
  "[Empty rig slot]",
  "",
  "",
  "",
  "Hobgoblin II x5",
  "Warrior II x2",
]);
