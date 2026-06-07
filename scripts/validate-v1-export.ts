import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type Severity = "info" | "warning" | "error" | "fatal";

type Issue = {
  severity: Severity;
  code: string;
  message: string;
  sheetName?: string;
  rowNumber?: number;
  field?: string;
  value?: string;
  suggestedFix?: string;
};

type ExportWarning = {
  level?: string;
  type?: string;
  sheetName?: string;
  rowNumber?: number | null;
  message?: string;
};

type ExportRow = {
  rowNumber: number;
  values: string[];
  object: Record<string, string>;
};

type ExportSheet = {
  sheetName: string;
  sheetId?: number;
  headers: string[];
  objectKeys?: string[];
  rowCount: number;
  warnings?: ExportWarning[];
  rows: ExportRow[];
};

type ExportPackage = {
  exportVersion: string;
  sourceSystem: string;
  spreadsheetId: string;
  spreadsheetName?: string;
  exportedAt: string;
  warnings?: ExportWarning[];
  sheets: ExportSheet[];
};

type ManifestSheet = {
  sheetName: string;
  sheetId?: number;
  headerCount?: number;
  rowCount: number;
  warnings?: ExportWarning[];
};

type ManifestPackage = {
  exportVersion?: string;
  sourceSystem?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  exportedAt?: string;
  sheetCount?: number;
  sheets: ManifestSheet[];
};

type TargetModel =
  | "Corp"
  | "Officer"
  | "OfficerCorpAssignment"
  | "OfficerPermission"
  | "AllianceHubContent"
  | "Operation"
  | "OperationAttendance"
  | "DoctrineFit"
  | "DoctrineFitReadiness"
  | "DoctrinePilot"
  | "SrpRequest"
  | "RecruitmentApplicant"
  | "LootSplit"
  | "LootSplitParticipant"
  | "EveTypeLookup"
  | "OfficerAuditLog";

type ExpectedSource = {
  model: TargetModel;
  aliases: string[];
};

type SourceInventoryItem = {
  model: TargetModel;
  aliases: string[];
  foundSheets: string[];
  status: "found" | "missing" | "ambiguous";
};

type UnmappedSheet = {
  sheetName: string;
  possibleModels: TargetModel[];
};

type ModelSummary = {
  model: TargetModel;
  sheets: string[];
  rowsChecked: number;
  issueCounts: Record<Severity, number>;
};

type Report = {
  generatedAt: string;
  input: {
    exportPath: string;
    manifestPath: string | null;
    mappingPath: string | null;
    outDir: string;
  };
  referenceFiles: {
    blueprint: FileReference;
    prismaSchema: FileReference;
  };
  summary: {
    sheetCount: number;
    rowCount: number;
    issueCounts: Record<Severity, number>;
  };
  sourceInventory: {
    expected: SourceInventoryItem[];
    unmappedSheets: UnmappedSheet[];
    ambiguousSheets: UnmappedSheet[];
  };
  modelSummaries: ModelSummary[];
  issues: Issue[];
};

type FileReference = {
  path: string;
  present: boolean;
  bytes?: number;
};

type CliOptions = {
  exportPath: string;
  manifestPath: string | null;
  mappingPath: string | null;
  outDir: string;
};

type MigrationMapping = {
  sheetAliases: Record<string, TargetModel>;
  corpAliases: Record<string, string>;
  officerAliases: Record<string, string>;
  operationAliases: Record<string, string>;
  doctrineFitAliases: Record<string, string>;
  lootSplitAliases: Record<string, string>;
};

type ParsedDate = {
  ok: boolean;
  value: Date | null;
};

type ParsedNumber = {
  ok: boolean;
  value: number | null;
};

type RowContext = {
  sheet: ExportSheet;
  row: ExportRow;
};

type Lookups = {
  corpKeys: Map<string, string>;
  knownCorpSlugs: string[];
  operationKeys: Set<string>;
  doctrineFitKeys: Set<string>;
  lootSplitKeys: Set<string>;
};

const sourceSystem = "google_apps_script";
const defaultOutDir = "migration-reports/latest";
const emittedIssueKeys = new Set<string>();
const optionalSourceModels = new Set<TargetModel>(["DoctrinePilot", "LootSplitParticipant"]);

const expectedSources: ExpectedSource[] = [
  {
    model: "Corp",
    aliases: ["Corp Registry", "Corps", "Corp Portals", "Corporations"]
  },
  {
    model: "Officer",
    aliases: ["Officers", "Admin Users", "Officer Registry", "Users"]
  },
  {
    model: "OfficerCorpAssignment",
    aliases: ["Officer Corp Assignments", "Officer Corps", "Officer Access", "Officers"]
  },
  {
    model: "OfficerPermission",
    aliases: ["Officer Permissions", "Permissions", "Officer Access", "Officers"]
  },
  {
    model: "AllianceHubContent",
    aliases: ["Alliance Hub Content", "Alliance Announcements", "Announcements", "Hub Content"]
  },
  {
    model: "Operation",
    aliases: ["Operations", "Ops", "Fleet Ops", "Op Calendar"]
  },
  {
    model: "OperationAttendance",
    aliases: ["Operation Attendance", "Attendance", "Fleet Attendance"]
  },
  {
    model: "DoctrineFit",
    aliases: ["Doctrine Fits", "Doctrine", "Fits"]
  },
  {
    model: "DoctrineFitReadiness",
    aliases: ["Doctrine Readiness", "Doctrine Fit Readiness", "Fit Readiness", "Pilot Readiness"]
  },
  {
    model: "DoctrinePilot",
    aliases: ["Doctrine Pilots", "Pilot Roles", "Pilot Doctrine Profiles"]
  },
  {
    model: "SrpRequest",
    aliases: ["SRP Requests", "SRP", "Ship Replacement"]
  },
  {
    model: "RecruitmentApplicant",
    aliases: ["Recruitment Applicants", "Recruitment", "Applicants"]
  },
  {
    model: "LootSplit",
    aliases: ["Loot Splits", "Loot Split Headers", "Payouts"]
  },
  {
    model: "LootSplitParticipant",
    aliases: ["Loot Split Participants", "Loot Participants", "Payout Participants"]
  },
  {
    model: "EveTypeLookup",
    aliases: ["EVE Type Lookup", "Type Lookup", "Ship Type Lookup"]
  },
  {
    model: "OfficerAuditLog",
    aliases: ["Audit Log", "Admin Audit", "Officer Audit Log"]
  }
];

const knownPermissionKeys = new Set([
  "allianceDashboardView",
  "allianceHubEdit",
  "allianceAnnouncementsEdit",
  "corpDetailsEdit",
  "corpDashboardView",
  "recruitmentReview",
  "lootSplitManage",
  "srpReview",
  "doctrineManage",
  "operationsManage",
  "officerManage"
]);

const permissionAliases = new Map<string, string>([
  ["alliance dashboard view", "allianceDashboardView"],
  ["alliance hub edit", "allianceHubEdit"],
  ["alliance announcements edit", "allianceAnnouncementsEdit"],
  ["corp details edit", "corpDetailsEdit"],
  ["corp dashboard view", "corpDashboardView"],
  ["recruitment review", "recruitmentReview"],
  ["loot split manage", "lootSplitManage"],
  ["loot splits manage", "lootSplitManage"],
  ["srp review", "srpReview"],
  ["doctrine manage", "doctrineManage"],
  ["operations manage", "operationsManage"],
  ["officer manage", "officerManage"]
]);

const enumValues = {
  corpStatus: new Set(["ACTIVE", "TRIAL", "INACTIVE", "ARCHIVED"]),
  officerRole: new Set(["SUPER_ADMIN", "ALLIANCE_OFFICER"]),
  officerStatus: new Set(["ACTIVE", "DISABLED"]),
  contentStatus: new Set(["ACTIVE", "DRAFT", "EXPIRED", "ARCHIVED"]),
  contentAudience: new Set(["ALL_MEMBERS", "OFFICERS", "SUPER_ADMINS"]),
  contentType: new Set(["ANNOUNCEMENT", "ALERT", "PRIORITY", "STANDING_ORDER", "FEATURED_OP", "NOTE"]),
  contentPriority: new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
  operationStatus: new Set(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
  doctrineFitStatus: new Set(["ACTIVE", "DRAFT", "RETIRED", "ARCHIVED"]),
  doctrineReadiness: new Set(["READY", "NEEDS_SKILLS", "NEEDS_HULL", "NEEDS_FIT", "NOT_READY", "UNKNOWN"]),
  srpStatus: new Set(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "APPROVED", "DENIED", "PAID", "NEW"]),
  recruitmentStatus: new Set(["NEW", "CONTACTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "ON_HOLD", "ACCEPTED", "REJECTED", "WITHDRAWN"]),
  lootSplitStatus: new Set(["DRAFT", "CALCULATED", "READY", "PAID", "CANCELLED"])
};

const fieldAliases: Record<string, string[]> = {
  applicantName: ["Applicant Name", "Applicant", "Name"],
  audience: ["Audience", "Content Audience"],
  body: ["Body", "Content", "Message", "Announcement"],
  canFlyHull: ["Can Fly Hull", "Hull Ready"],
  canUsePropUtility: ["Can Use Prop Utility", "Prop Utility Ready", "Utility Ready"],
  canUseTank: ["Can Use Tank", "Tank Ready", "Fit Ready"],
  canUseWeapons: ["Can Use Weapons", "Weapons Ready", "Skills Ready"],
  category: ["Category", "Type Category"],
  characterName: ["Character Name", "Character", "Main Character", "Pilot Character"],
  corp: ["Corp", "Corporation", "Corp Name", "Corp Slug", "Ticker", "Corp Ticker"],
  corpCutAmount: ["Corp Cut Amount", "Corp Cut ISK"],
  corpCutPercent: ["Corp Cut Percent", "Corp Cut %"],
  createdAt: ["Created At", "Created", "Timestamp", "Submitted At", "Date Created"],
  createdBy: ["Created By", "Author", "Added By"],
  description: ["Description", "Corp Description"],
  discordName: ["Discord Name", "Discord"],
  doctrineCode: ["Doctrine Code", "Fit Code"],
  doctrineFleet: ["Doctrine Fleet", "Doctrine", "Fleet Doctrine"],
  doctrineFit: ["Doctrine Fit", "Doctrine Name", "Fit", "Fit Name", "Doctrine Code"],
  doctrineName: ["Doctrine Name", "Fit Name", "Doctrine"],
  doctrineReadinessPercent: ["Doctrine Readiness Percent", "Doctrine Readiness %", "Readiness Percent"],
  doctrineUsed: ["Doctrine Used", "Doctrine"],
  enabledModules: ["Enabled Modules", "Modules"],
  endDate: ["End Date", "Ends", "Expires At"],
  estimatedValue: ["Estimated Value", "Estimated ISK", "Loss Value"],
  fcLead: ["FC Lead", "FC", "Fleet Commander"],
  fitText: ["Fit Text", "Fitting", "Fit"],
  imageUrl: ["Image URL", "Image Url", "Render URL"],
  killmailLink: ["Killmail Link", "Killmail", "Killmail URL"],
  legacyKey: ["ID", "Legacy ID", "Key", "Code"],
  location: ["Location", "System", "Staging"],
  lootSplit: ["Loot Split", "Loot Split ID", "Operation Name", "Payout"],
  lossType: ["Loss Type", "Loss Date", "Type"],
  mainCharacter: ["Main Character", "Character Name", "Character"],
  manualImageUrl: ["Manual Image URL", "Manual Image Url"],
  missingSkills: ["Missing Skills", "Skill Gaps"],
  module: ["Module"],
  notes: ["Notes", "Note", "Comments"],
  officerName: ["Officer Name", "Officer", "Admin Name", "User", "Name"],
  operationCode: ["Operation Code", "Op Code", "Fleet Code"],
  operationDate: ["Operation Date", "Op Date", "Scheduled For", "Date"],
  operationName: ["Operation Name", "Op Name", "Fleet Name", "Title"],
  operationRef: ["Operation Code", "Operation Name", "Op Code", "Op Name", "Fleet Code", "Fleet Name"],
  operationType: ["Operation Type", "Op Type", "Type"],
  payoutAmount: ["Payout Amount", "Payout ISK"],
  payoutPool: ["Payout Pool"],
  permissionKey: ["Permission Key", "Permission", "Permission Name"],
  pilotName: ["Pilot Name", "Pilot"],
  preferredContent: ["Preferred Content", "Interested Roles", "Content"],
  priority: ["Priority"],
  recruitmentChannel: ["Recruitment Channel", "Channel"],
  recruitmentStatus: ["Recruitment Status"],
  requestedPayout: ["Requested Payout", "Requested ISK", "Payout Requested"],
  reviewer: ["Reviewer", "Reviewed By"],
  role: ["Role", "Officer Role"],
  roleFlown: ["Role Flown", "Fleet Role"],
  shares: ["Shares", "Share Count"],
  shipFlown: ["Ship Flown", "Ship"],
  shipHull: ["Ship Hull", "Hull", "Ship"],
  shipLost: ["Ship Lost", "Ship", "Hull Lost"],
  shipTypeId: ["Ship Type ID", "Type ID", "EVE Type ID"],
  skillPoints: ["Skill Points", "SP"],
  slug: ["Slug", "Corp Slug"],
  source: ["Source", "Referral"],
  srpReserveAmount: ["SRP Reserve Amount", "SRP Reserve ISK"],
  srpReservePercent: ["SRP Reserve Percent", "SRP Reserve %"],
  startDate: ["Start Date", "Starts", "Published At"],
  status: ["Status", "State"],
  ticker: ["Ticker", "Corp Ticker"],
  timeZone: ["Time Zone", "Timezone", "TZ"],
  title: ["Title", "Name"],
  totalIskValue: ["Total ISK Value", "Total Value", "Total ISK"],
  totalShares: ["Total Shares"],
  typeId: ["Type ID", "EVE Type ID"],
  typeName: ["Type Name", "Ship Type", "Ship Name"],
  updatedAt: ["Updated At", "Updated", "Modified At"]
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const issues: Issue[] = [];
  const blueprintRef = await getFileReference("DATA_MIGRATION_BLUEPRINT.md");
  const schemaRef = await getFileReference("prisma/schema.prisma");
  const exportPackage = await readExportPackage(options.exportPath, issues);
  const manifest = options.manifestPath
    ? await readManifestPackage(options.manifestPath, issues)
    : null;
  const mapping = options.mappingPath
    ? await readMigrationMapping(options.mappingPath, issues)
    : createEmptyMigrationMapping();

  if (!exportPackage) {
    await writeFatalReport(options, blueprintRef, schemaRef, issues);
    process.exitCode = 1;
    return;
  }

  validateExportStructure(exportPackage, issues);

  if (manifest) {
    validateManifest(exportPackage, manifest, issues);
  }

  validateSheetWarnings(exportPackage, issues);
  const inventory = buildSourceInventory(exportPackage, mapping);
  addInventoryIssues(inventory, issues);

  const sheetsByModel = assignSheetsToModels(exportPackage.sheets, inventory.ambiguousSheets, mapping);
  const modelSummaries = createInitialModelSummaries(sheetsByModel);
  const lookups = buildLookups(sheetsByModel, mapping, issues, modelSummaries);

  validateModels(sheetsByModel, lookups, issues, modelSummaries);
  detectNaturalKeyDuplicates(sheetsByModel, issues, modelSummaries);

  const report = buildReport({
    options,
    blueprintRef,
    schemaRef,
    exportPackage,
    inventory,
    modelSummaries,
    issues
  });

  await writeReports(options.outDir, report);
  printSummary(report);
}

function parseArgs(args: string[]): CliOptions {
  let exportPath = "";
  let manifestPath: string | null = null;
  let mappingPath: string | null = null;
  let outDir = defaultOutDir;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--export" && next) {
      exportPath = next;
      index += 1;
      continue;
    }

    if (arg === "--manifest" && next) {
      manifestPath = next;
      index += 1;
      continue;
    }

    if (arg === "--mapping" && next) {
      mappingPath = next;
      index += 1;
      continue;
    }

    if (arg === "--out" && next) {
      outDir = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!exportPath) {
    printUsage();
    throw new Error("Missing required --export path.");
  }

  return {
    exportPath,
    manifestPath,
    mappingPath,
    outDir
  };
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm.cmd run migration:validate -- --export migration-data/v1-export/export.json --manifest migration-data/v1-export/manifest.json --mapping migration-data/v1-export/migration-map.json --out migration-reports/latest",
    "",
    "This is dry-run validation only. It does not connect to or write to Postgres."
  ].join("\n"));
}

async function getFileReference(filePath: string): Promise<FileReference> {
  try {
    const info = await stat(filePath);

    return {
      path: filePath,
      present: true,
      bytes: info.size
    };
  } catch {
    return {
      path: filePath,
      present: false
    };
  }
}

async function readExportPackage(filePath: string, issues: Issue[]): Promise<ExportPackage | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (!isRecord(parsed)) {
      addIssue(issues, "fatal", "invalid_export_root", "export.json root must be an object.");
      return null;
    }

    return coerceExportPackage(parsed, issues);
  } catch (error) {
    addIssue(
      issues,
      "fatal",
      "export_read_failed",
      `Could not read or parse export.json: ${errorMessage(error)}.`
    );
    return null;
  }
}

async function readManifestPackage(filePath: string, issues: Issue[]): Promise<ManifestPackage | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (!isRecord(parsed)) {
      addIssue(issues, "error", "invalid_manifest_root", "manifest.json root must be an object.");
      return null;
    }

    return coerceManifestPackage(parsed, issues);
  } catch (error) {
    addIssue(
      issues,
      "error",
      "manifest_read_failed",
      `Could not read or parse manifest.json: ${errorMessage(error)}.`
    );
    return null;
  }
}

async function readMigrationMapping(filePath: string, issues: Issue[]): Promise<MigrationMapping> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (!isRecord(parsed)) {
      addIssue(issues, "error", "invalid_mapping_root", "migration-map.json root must be an object.");
      return createEmptyMigrationMapping();
    }

    return coerceMigrationMapping(parsed, issues);
  } catch (error) {
    addIssue(
      issues,
      "error",
      "mapping_read_failed",
      `Could not read or parse migration-map.json: ${errorMessage(error)}.`
    );
    return createEmptyMigrationMapping();
  }
}

function createEmptyMigrationMapping(): MigrationMapping {
  return {
    sheetAliases: {},
    corpAliases: {},
    officerAliases: {},
    operationAliases: {},
    doctrineFitAliases: {},
    lootSplitAliases: {}
  };
}

function coerceMigrationMapping(value: Record<string, unknown>, issues: Issue[]): MigrationMapping {
  const mapping: MigrationMapping = {
    sheetAliases: coerceSheetAliasMap(value.sheetAliases, issues),
    corpAliases: coerceStringMap(value.corpAliases),
    officerAliases: coerceStringMap(value.officerAliases),
    operationAliases: coerceStringMap(value.operationAliases),
    doctrineFitAliases: coerceStringMap(value.doctrineFitAliases),
    lootSplitAliases: coerceStringMap(value.lootSplitAliases)
  };

  return mapping;
}

function coerceSheetAliasMap(value: unknown, issues: Issue[]): Record<string, TargetModel> {
  const result: Record<string, TargetModel> = {};

  if (!isRecord(value)) {
    return result;
  }

  for (const [sheetName, model] of Object.entries(value)) {
    if (isTargetModel(String(model))) {
      result[sheetName] = String(model) as TargetModel;
    } else {
      addIssue(issues, "error", "invalid_sheet_alias_target", "Sheet alias maps to an unknown target model.", {
        sheetName,
        value: safeValue(String(model)),
        suggestedFix: "Use a Prisma target model name such as DoctrineFitReadiness."
      });
    }
  }

  return result;
}

function coerceStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
      .map(([key, entryValue]) => [key, String(entryValue)])
  );
}

function coerceExportPackage(value: Record<string, unknown>, issues: Issue[]): ExportPackage | null {
  const sheetsValue = value.sheets;

  if (!Array.isArray(sheetsValue)) {
    addIssue(issues, "fatal", "export_sheets_missing", "export.json must include a sheets array.");
    return null;
  }

  return {
    exportVersion: stringValue(value.exportVersion),
    sourceSystem: stringValue(value.sourceSystem),
    spreadsheetId: stringValue(value.spreadsheetId),
    spreadsheetName: stringValue(value.spreadsheetName),
    exportedAt: stringValue(value.exportedAt),
    warnings: coerceWarnings(value.warnings),
    sheets: sheetsValue.map((sheet, index) => coerceExportSheet(sheet, index, issues))
  };
}

function coerceExportSheet(value: unknown, index: number, issues: Issue[]): ExportSheet {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid_sheet", `Sheet entry ${index + 1} must be an object.`);
    return {
      sheetName: `__invalid_sheet_${index + 1}`,
      headers: [],
      rowCount: 0,
      rows: []
    };
  }

  const sheetName = stringValue(value.sheetName) || `__unnamed_sheet_${index + 1}`;
  const rowsValue = value.rows;

  return {
    sheetName,
    sheetId: numberOrUndefined(value.sheetId),
    headers: stringArray(value.headers),
    objectKeys: stringArray(value.objectKeys),
    rowCount: numberOrZero(value.rowCount),
    warnings: coerceWarnings(value.warnings),
    rows: Array.isArray(rowsValue)
      ? rowsValue.map((row, rowIndex) => coerceExportRow(row, sheetName, rowIndex, issues))
      : []
  };
}

function coerceExportRow(value: unknown, sheetName: string, rowIndex: number, issues: Issue[]): ExportRow {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid_row", "Row entry must be an object.", {
      sheetName,
      rowNumber: rowIndex + 2
    });
    return {
      rowNumber: rowIndex + 2,
      values: [],
      object: {}
    };
  }

  const objectValue = value.object;

  return {
    rowNumber: numberOrZero(value.rowNumber) || rowIndex + 2,
    values: stringArray(value.values),
    object: isRecord(objectValue) ? recordToStringRecord(objectValue) : {}
  };
}

function coerceManifestPackage(value: Record<string, unknown>, issues: Issue[]): ManifestPackage | null {
  if (!Array.isArray(value.sheets)) {
    addIssue(issues, "error", "manifest_sheets_missing", "manifest.json must include a sheets array.");
    return null;
  }

  return {
    exportVersion: optionalString(value.exportVersion),
    sourceSystem: optionalString(value.sourceSystem),
    spreadsheetId: optionalString(value.spreadsheetId),
    spreadsheetName: optionalString(value.spreadsheetName),
    exportedAt: optionalString(value.exportedAt),
    sheetCount: numberOrUndefined(value.sheetCount),
    sheets: value.sheets.map((sheet, index) => coerceManifestSheet(sheet, index, issues))
  };
}

function coerceManifestSheet(value: unknown, index: number, issues: Issue[]): ManifestSheet {
  if (!isRecord(value)) {
    addIssue(issues, "error", "invalid_manifest_sheet", `Manifest sheet entry ${index + 1} must be an object.`);
    return {
      sheetName: `__invalid_manifest_sheet_${index + 1}`,
      rowCount: 0
    };
  }

  return {
    sheetName: stringValue(value.sheetName) || `__unnamed_manifest_sheet_${index + 1}`,
    sheetId: numberOrUndefined(value.sheetId),
    headerCount: numberOrUndefined(value.headerCount),
    rowCount: numberOrZero(value.rowCount),
    warnings: coerceWarnings(value.warnings)
  };
}

function validateExportStructure(exportPackage: ExportPackage, issues: Issue[]) {
  if (!exportPackage.exportVersion) {
    addIssue(issues, "fatal", "missing_export_version", "exportVersion is missing.");
  }

  if (exportPackage.sourceSystem !== sourceSystem) {
    addIssue(issues, "fatal", "invalid_source_system", "sourceSystem must equal google_apps_script.", {
      value: safeValue(exportPackage.sourceSystem)
    });
  }

  if (!exportPackage.spreadsheetId) {
    addIssue(issues, "fatal", "missing_spreadsheet_id", "spreadsheetId is missing.");
  }

  if (!exportPackage.exportedAt) {
    addIssue(issues, "fatal", "missing_exported_at", "exportedAt is missing.");
  } else if (!parseDate(exportPackage.exportedAt).ok) {
    addIssue(issues, "error", "invalid_exported_at", "exportedAt is not a parseable date.", {
      value: safeValue(exportPackage.exportedAt)
    });
  }

  for (const sheet of exportPackage.sheets) {
    if (!sheet.sheetName) {
      addIssue(issues, "error", "missing_sheet_name", "A sheet entry is missing sheetName.");
    }

    if (!Array.isArray(sheet.headers)) {
      addIssue(issues, "error", "missing_headers_array", "Sheet headers must be an array.", {
        sheetName: sheet.sheetName
      });
    }

    if (!Array.isArray(sheet.rows)) {
      addIssue(issues, "error", "missing_rows_array", "Sheet rows must be an array.", {
        sheetName: sheet.sheetName
      });
    }

    if (sheet.rowCount !== sheet.rows.length) {
      addIssue(issues, "warning", "sheet_row_count_mismatch", "Sheet rowCount does not match rows length.", {
        sheetName: sheet.sheetName,
        value: `${sheet.rowCount} vs ${sheet.rows.length}`,
        suggestedFix: "Re-export the sheet or inspect filtered/truncated rows."
      });
    }

    for (const row of sheet.rows) {
      if (!Number.isInteger(row.rowNumber) || row.rowNumber < 2) {
        addIssue(issues, "error", "invalid_row_number", "Row number must be the original Google Sheets row number and at least 2.", {
          sheetName: sheet.sheetName,
          rowNumber: row.rowNumber
        });
      }

      if (!Array.isArray(row.values)) {
        addIssue(issues, "error", "invalid_row_values", "Row values must be an array.", {
          sheetName: sheet.sheetName,
          rowNumber: row.rowNumber
        });
      }

      if (!isRecord(row.object)) {
        addIssue(issues, "error", "invalid_row_object", "Row object must be an object.", {
          sheetName: sheet.sheetName,
          rowNumber: row.rowNumber
        });
      }
    }
  }
}

function validateManifest(exportPackage: ExportPackage, manifest: ManifestPackage, issues: Issue[]) {
  const exportSheets = new Map(exportPackage.sheets.map((sheet) => [normalizeNameKey(sheet.sheetName), sheet]));
  const manifestSheets = new Map(manifest.sheets.map((sheet) => [normalizeNameKey(sheet.sheetName), sheet]));

  if (!Array.isArray(manifest.sheets)) {
    addIssue(issues, "error", "manifest_sheets_invalid", "Manifest sheet list is missing.");
    return;
  }

  if (manifest.sheetCount !== undefined && manifest.sheetCount !== manifest.sheets.length) {
    addIssue(issues, "warning", "manifest_sheet_count_mismatch", "Manifest sheetCount does not match manifest sheets length.", {
      value: `${manifest.sheetCount} vs ${manifest.sheets.length}`
    });
  }

  for (const sheet of exportPackage.sheets) {
    const manifestSheet = manifestSheets.get(normalizeNameKey(sheet.sheetName));

    if (!manifestSheet) {
      addIssue(issues, "warning", "manifest_missing_sheet", "Manifest is missing a sheet present in export.json.", {
        sheetName: sheet.sheetName
      });
      continue;
    }

    if (manifestSheet.rowCount !== sheet.rowCount) {
      addIssue(issues, "warning", "manifest_row_count_mismatch", "Manifest row count does not match export row count.", {
        sheetName: sheet.sheetName,
        value: `${manifestSheet.rowCount} vs ${sheet.rowCount}`,
        suggestedFix: "Use matching export.json and manifest.json from the same export run."
      });
    }
  }

  for (const sheet of manifest.sheets) {
    if (!exportSheets.has(normalizeNameKey(sheet.sheetName))) {
      addIssue(issues, "warning", "manifest_extra_sheet", "Manifest contains a sheet not present in export.json.", {
        sheetName: sheet.sheetName
      });
    }
  }
}

function validateSheetWarnings(exportPackage: ExportPackage, issues: Issue[]) {
  for (const sheet of exportPackage.sheets) {
    if (!sheet.headers.length) {
      addIssue(issues, "warning", "missing_headers", "Sheet has no headers.", {
        sheetName: sheet.sheetName,
        rowNumber: 1,
        suggestedFix: "Confirm row 1 contains the sheet headers."
      });
    }

    if (!sheet.rows.length) {
      addIssue(issues, "info", "blank_sheet", "Sheet has no data rows.", {
        sheetName: sheet.sheetName
      });
    }

    validateHeaderCells(sheet, issues);

    for (const row of sheet.rows) {
      if (row.values.every((value) => isBlank(value))) {
        addIssue(issues, "info", "blank_row", "Row has all blank values.", {
          sheetName: sheet.sheetName,
          rowNumber: row.rowNumber,
          suggestedFix: "Delete the blank source row if it is not intentional."
        });
      }
    }

    for (const warning of sheet.warnings || []) {
      addIssue(issues, mapWarningSeverity(warning.level), warning.type || "export_warning", warning.message || "Exporter warning.", {
        sheetName: warning.sheetName || sheet.sheetName,
        rowNumber: warning.rowNumber ?? undefined
      });
    }
  }
}

function validateHeaderCells(sheet: ExportSheet, issues: Issue[]) {
  const seen = new Map<string, number>();

  sheet.headers.forEach((header, index) => {
    const trimmed = header.trim();

    if (!trimmed) {
      addIssue(issues, "warning", "empty_header_cell", `Header cell ${index + 1} is empty.`, {
        sheetName: sheet.sheetName,
        rowNumber: 1,
        field: `Column ${index + 1}`,
        suggestedFix: "Name the header before export, or confirm the generated object key is acceptable."
      });
      return;
    }

    const key = normalizeNameKey(trimmed);
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);

    if (count > 0) {
      addIssue(issues, "warning", "duplicate_header", `Duplicate header: ${trimmed}.`, {
        sheetName: sheet.sheetName,
        rowNumber: 1,
        field: trimmed,
        suggestedFix: "Rename duplicate headers so each column maps cleanly."
      });
    }
  });
}

function buildSourceInventory(exportPackage: ExportPackage, mapping: MigrationMapping) {
  const sheetMatches = exportPackage.sheets.map((sheet) => ({
    sheet,
    possibleModels: modelsForSheetName(sheet.sheetName, mapping)
  }));

  const expected = expectedSources.map((source) => {
    const foundSheets = sheetMatches
      .filter((match) => match.possibleModels.includes(source.model))
      .map((match) => match.sheet.sheetName);
    const ambiguous = foundSheets.some((sheetName) => modelsForSheetName(sheetName, mapping).length > 1);

    return {
      model: source.model,
      aliases: source.aliases,
      foundSheets,
      status: foundSheets.length ? ambiguous ? "ambiguous" : "found" : "missing"
    } satisfies SourceInventoryItem;
  });

  const unmappedSheets = sheetMatches
    .filter((match) => !match.possibleModels.length)
    .map((match) => ({
      sheetName: match.sheet.sheetName,
      possibleModels: match.possibleModels
    }));
  const ambiguousSheets = sheetMatches
    .filter((match) => match.possibleModels.length > 1)
    .map((match) => ({
      sheetName: match.sheet.sheetName,
      possibleModels: match.possibleModels
    }));

  return {
    expected,
    unmappedSheets,
    ambiguousSheets
  };
}

function addInventoryIssues(
  inventory: {
    expected: SourceInventoryItem[];
    unmappedSheets: UnmappedSheet[];
    ambiguousSheets: UnmappedSheet[];
  },
  issues: Issue[]
) {
  for (const item of inventory.expected) {
    if (item.status === "missing") {
      addIssue(issues, optionalSourceModels.has(item.model) ? "info" : "warning", "expected_sheet_missing", `No source sheet matched ${item.model}.`, {
        suggestedFix: `Expected aliases: ${item.aliases.join(", ")}.`
      });
    }
  }

  for (const item of inventory.unmappedSheets) {
    addIssue(issues, "info", "unmapped_sheet", "Sheet does not map to a known target model.", {
      sheetName: item.sheetName,
      suggestedFix: "Confirm whether this v1 tab should be ignored or mapped manually."
    });
  }

  for (const item of inventory.ambiguousSheets) {
    const isOfficersCombined =
      normalizeNameKey(item.sheetName) === "officers" &&
      item.possibleModels.includes("Officer") &&
      item.possibleModels.includes("OfficerCorpAssignment") &&
      item.possibleModels.includes("OfficerPermission");

    addIssue(issues, isOfficersCombined ? "info" : "warning", "ambiguous_sheet_mapping", isOfficersCombined
      ? "Officers sheet may contain combined officer, assignment, and permission fields."
      : "Sheet name matches multiple target models.", {
      sheetName: item.sheetName,
      value: item.possibleModels.join(", "),
      suggestedFix: isOfficersCombined
        ? "This is acceptable for now. Add specific sheets later if the combined Officers tab is hard to validate."
        : "Rename/export with a more specific tab name or add an explicit mapping in migration-map.json."
    });
  }
}

function assignSheetsToModels(sheets: ExportSheet[], ambiguousSheets: UnmappedSheet[], mapping: MigrationMapping) {
  const assigned = new Map<TargetModel, ExportSheet[]>();
  const ambiguousNames = new Set(ambiguousSheets.map((sheet) => normalizeNameKey(sheet.sheetName)));

  for (const source of expectedSources) {
    assigned.set(source.model, []);
  }

  for (const sheet of sheets) {
    const model = validationModelForSheet(sheet.sheetName, ambiguousNames, mapping);

    if (model) {
      assigned.get(model)?.push(sheet);
    }
  }

  return assigned;
}

function createInitialModelSummaries(sheetsByModel: Map<TargetModel, ExportSheet[]>): ModelSummary[] {
  return expectedSources.map((source) => ({
    model: source.model,
    sheets: (sheetsByModel.get(source.model) || []).map((sheet) => sheet.sheetName),
    rowsChecked: 0,
    issueCounts: emptyIssueCounts()
  }));
}

function buildLookups(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  mapping: MigrationMapping,
  issues: Issue[],
  summaries: ModelSummary[]
): Lookups {
  const corpKeys = new Map<string, string>();
  const knownCorpSlugs = new Set<string>();
  const operationKeys = new Set<string>();
  const doctrineFitKeys = new Set<string>();
  const lootSplitKeys = new Set<string>();

  forEachModelRow(sheetsByModel, "Corp", summaries, (context) => {
    const name = getField(context.row, fieldAliases.title) || getField(context.row, fieldAliases.corp) || getField(context.row, ["Name", "Corp Name"]);
    const ticker = getField(context.row, fieldAliases.ticker);
    const slug = getField(context.row, fieldAliases.slug) || normalizeSlug(name);

    if (!name) {
      addModelIssue(issues, summaries, "Corp", "error", "missing_required_field", "Corp name is required.", {
        context,
        field: "name",
        suggestedFix: "Fill the corp name before migration."
      });
      return;
    }

    if (!slug) {
      addModelIssue(issues, summaries, "Corp", "error", "missing_required_field", "Corp slug could not be generated.", {
        context,
        field: "slug",
        suggestedFix: "Add a corp slug or a usable corp name."
      });
      return;
    }

    addLookupKey(corpKeys, normalizeSlug(slug), slug);
    knownCorpSlugs.add(normalizeSlug(slug));
    addLookupKey(corpKeys, normalizeNameKey(name), slug);

    if (ticker) {
      addLookupKey(corpKeys, normalizeNameKey(ticker), slug);
    }
  }, false);

  applyCorpAliases(corpKeys, knownCorpSlugs, mapping, issues);

  const seenCorpSlugs = new Map<string, RowContext>();
  forEachModelRow(sheetsByModel, "Corp", summaries, (context) => {
    const name = getField(context.row, fieldAliases.title) || getField(context.row, fieldAliases.corp) || getField(context.row, ["Name", "Corp Name"]);
    const slug = normalizeSlug(getField(context.row, fieldAliases.slug) || name);

    if (!slug) {
      return;
    }

    const prior = seenCorpSlugs.get(slug);

    if (prior) {
      addModelIssue(issues, summaries, "Corp", "error", "duplicate_corp_slug", `Duplicate corp slug: ${slug}.`, {
        context,
        field: "slug",
        value: slug,
        suggestedFix: `Resolve duplicate with row ${prior.row.rowNumber} in ${prior.sheet.sheetName}.`
      });
    } else {
      seenCorpSlugs.set(slug, context);
    }
  }, false);

  forEachModelRow(sheetsByModel, "Operation", summaries, (context) => {
    const corpKey = resolveCorpKey(context, corpKeys, knownCorpSlugs, issues, summaries, "Operation");
    const operationCode = getField(context.row, fieldAliases.operationCode);
    const operationName = getField(context.row, fieldAliases.operationName);
    const operationDate = getField(context.row, fieldAliases.operationDate);

    if (!corpKey || !operationName) {
      return;
    }

    addNaturalKeys(operationKeys, corpKey, [operationCode, `${operationName}|${normalizeDateKey(operationDate)}`]);
  }, false);

  forEachModelRow(sheetsByModel, "DoctrineFit", summaries, (context) => {
    const corpKey = resolveCorpKey(context, corpKeys, knownCorpSlugs, issues, summaries, "DoctrineFit");
    const doctrineCode = getField(context.row, fieldAliases.doctrineCode);
    const doctrineName = getField(context.row, fieldAliases.doctrineName);
    const shipHull = getField(context.row, fieldAliases.shipHull);

    if (!corpKey || !doctrineName) {
      return;
    }

    addNaturalKeys(doctrineFitKeys, corpKey, [doctrineCode, `${doctrineName}|${shipHull}`]);
  }, false);

  forEachModelRow(sheetsByModel, "LootSplit", summaries, (context) => {
    const corpKey = resolveCorpKey(context, corpKeys, knownCorpSlugs, issues, summaries, "LootSplit");
    const operationName = getField(context.row, fieldAliases.operationName);
    const createdAt = getField(context.row, fieldAliases.createdAt);

    if (!corpKey || !operationName) {
      return;
    }

    addNaturalKeys(lootSplitKeys, corpKey, [`${operationName}|${normalizeDateKey(createdAt)}`, operationName]);
  }, false);

  return {
    corpKeys,
    knownCorpSlugs: Array.from(knownCorpSlugs).sort(),
    operationKeys,
    doctrineFitKeys,
    lootSplitKeys
  };
}

function validateModels(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  validateCorpRows(sheetsByModel, lookups, issues, summaries);
  validateOfficerRows(sheetsByModel, issues, summaries);
  validateOfficerAssignmentRows(sheetsByModel, lookups, issues, summaries);
  validateOfficerPermissionRows(sheetsByModel, lookups, issues, summaries);
  validateAllianceHubRows(sheetsByModel, issues, summaries);
  validateOperationRows(sheetsByModel, lookups, issues, summaries);
  validateAttendanceRows(sheetsByModel, lookups, issues, summaries);
  validateDoctrineFitRows(sheetsByModel, lookups, issues, summaries);
  validateDoctrineReadinessRows(sheetsByModel, lookups, issues, summaries);
  validateDoctrinePilotRows(sheetsByModel, lookups, issues, summaries);
  validateSrpRows(sheetsByModel, lookups, issues, summaries);
  validateRecruitmentRows(sheetsByModel, lookups, issues, summaries);
  validateLootSplitRows(sheetsByModel, lookups, issues, summaries);
  validateLootParticipantRows(sheetsByModel, lookups, issues, summaries);
  validateEveTypeRows(sheetsByModel, issues, summaries);
  validateAuditLogRows(sheetsByModel, lookups, issues, summaries);
}

function validateCorpRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "Corp", summaries, (context) => {
    requireField(context, "Corp", "name", ["Name", "Corp Name", "Corporation"], issues, summaries);
    requireField(context, "Corp", "ticker", fieldAliases.ticker, issues, summaries);
    validateEnumField(context, "Corp", "status", fieldAliases.status, enumValues.corpStatus, issues, summaries);
    validateIntegerField(context, "Corp", "activeMembers", ["Active Members", "Members"], issues, summaries);
    validateIntegerField(context, "Corp", "recentOps", ["Recent Ops"], issues, summaries);
    validateIntegerField(context, "Corp", "pendingSrp", ["Pending SRP"], issues, summaries);
    validateIntegerField(context, "Corp", "doctrineReadinessPercent", fieldAliases.doctrineReadinessPercent, issues, summaries);

    const enabledModules = getField(context.row, fieldAliases.enabledModules);
    if (enabledModules) {
      const modules = normalizeEnabledModules(enabledModules);

      if (!modules.ok) {
        addModelIssue(issues, summaries, "Corp", "warning", "malformed_enabled_modules", modules.message, {
          context,
          field: "enabledModules",
          value: safeValue(enabledModules),
          suggestedFix: "Use JSON or a comma/newline list of known module names."
        });
      }
    }

    const announcements = getField(context.row, ["Announcements", "Announcement"]);
    if (announcements && !parseJsonOrList(announcements).ok) {
      addModelIssue(issues, summaries, "Corp", "warning", "malformed_json_or_list", "Announcements could not be parsed as JSON or a list.", {
        context,
        field: "announcements",
        value: safeValue(announcements)
      });
    }

    const corpName = getField(context.row, ["Name", "Corp Name", "Corporation"]);
    const slug = normalizeSlug(getField(context.row, fieldAliases.slug) || corpName);
    if (slug && !lookups.corpKeys.has(slug)) {
      addLookupKey(lookups.corpKeys, slug, slug);
    }
  });
}

function validateOfficerRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const seen = new Map<string, RowContext>();

  forEachModelRow(sheetsByModel, "Officer", summaries, (context) => {
    const officerName = requireField(context, "Officer", "officerName", fieldAliases.officerName, issues, summaries);
    validateEnumField(context, "Officer", "role", fieldAliases.role, enumValues.officerRole, issues, summaries);
    validateEnumField(context, "Officer", "status", fieldAliases.status, enumValues.officerStatus, issues, summaries);
    validateDateField(context, "Officer", "lastLoginAt", ["Last Login At", "Last Login"], issues, summaries);

    if (officerName) {
      const key = normalizeNameKey(officerName);
      const prior = seen.get(key);

      if (prior) {
        addModelIssue(issues, summaries, "Officer", "error", "duplicate_officer_name", `Duplicate officer name: ${safeValue(officerName)}.`, {
          context,
          field: "officerName",
          suggestedFix: `Resolve duplicate with row ${prior.row.rowNumber} in ${prior.sheet.sheetName}.`
        });
      } else {
        seen.set(key, context);
      }
    }
  });
}

function validateOfficerAssignmentRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "OfficerCorpAssignment", summaries, (context) => {
    requireField(context, "OfficerCorpAssignment", "officerName", fieldAliases.officerName, issues, summaries);
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "OfficerCorpAssignment");
  });
}

function validateOfficerPermissionRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "OfficerPermission", summaries, (context) => {
    requireField(context, "OfficerPermission", "officerName", fieldAliases.officerName, issues, summaries);
    const permissionValue = requireField(context, "OfficerPermission", "permissionKey", fieldAliases.permissionKey, issues, summaries);

    if (permissionValue) {
      const permissionKey = normalizePermissionKey(permissionValue);

      if (!permissionKey) {
        addModelIssue(issues, summaries, "OfficerPermission", "error", "unknown_permission_key", "Permission key is not recognized.", {
          context,
          field: "permissionKey",
          value: safeValue(permissionValue),
          suggestedFix: "Map this permission to a known v2 permission key."
        });
      }
    }

    const corpValue = getField(context.row, fieldAliases.corp);
    if (corpValue && !resolveCorpValue(corpValue, lookups.corpKeys)) {
      addModelIssue(issues, summaries, "OfficerPermission", "error", "unresolved_corp_reference", "Corp-scoped permission references an unknown corp.", {
        context,
        field: "corp",
        value: safeValue(corpValue)
      });
    }
  });
}

function validateAllianceHubRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "AllianceHubContent", summaries, (context) => {
    requireField(context, "AllianceHubContent", "title", fieldAliases.title, issues, summaries);
    requireField(context, "AllianceHubContent", "body", fieldAliases.body, issues, summaries);
    validateEnumField(context, "AllianceHubContent", "contentType", ["Content Type", "Type"], enumValues.contentType, issues, summaries);
    validateEnumField(context, "AllianceHubContent", "audience", fieldAliases.audience, enumValues.contentAudience, issues, summaries);
    validateEnumField(context, "AllianceHubContent", "priority", fieldAliases.priority, enumValues.contentPriority, issues, summaries);
    validateEnumField(context, "AllianceHubContent", "status", fieldAliases.status, enumValues.contentStatus, issues, summaries);
    validateDateField(context, "AllianceHubContent", "startDate", fieldAliases.startDate, issues, summaries);
    validateDateField(context, "AllianceHubContent", "endDate", fieldAliases.endDate, issues, summaries);
  });
}

function validateOperationRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "Operation", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "Operation");
    requireField(context, "Operation", "operationName", fieldAliases.operationName, issues, summaries);
    validateEnumField(context, "Operation", "status", fieldAliases.status, enumValues.operationStatus, issues, summaries);
    validateDateField(context, "Operation", "operationDate", fieldAliases.operationDate, issues, summaries);
  });
}

function validateAttendanceRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "OperationAttendance", summaries, (context) => {
    const corpKey = resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "OperationAttendance");
    const operationRef = getField(context.row, fieldAliases.operationRef);
    requireField(context, "OperationAttendance", "characterName", fieldAliases.characterName, issues, summaries);

    if (corpKey && operationRef && !hasNaturalKey(lookups.operationKeys, corpKey, operationRef)) {
      addModelIssue(issues, summaries, "OperationAttendance", "error", "unresolved_operation_reference", "Attendance row references an unknown operation.", {
        context,
        field: "operation",
        value: safeValue(operationRef),
        suggestedFix: "Confirm operation code/name and corp mapping."
      });
    }
  });
}

function validateDoctrineFitRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "DoctrineFit", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "DoctrineFit");
    requireField(context, "DoctrineFit", "doctrineName", fieldAliases.doctrineName, issues, summaries);
    validateIntegerField(context, "DoctrineFit", "shipTypeId", fieldAliases.shipTypeId, issues, summaries);
    validateEnumField(context, "DoctrineFit", "status", fieldAliases.status, enumValues.doctrineFitStatus, issues, summaries);
  });
}

function validateDoctrineReadinessRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "DoctrineFitReadiness", summaries, (context) => {
    const corpKey = resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "DoctrineFitReadiness");
    const doctrineFit = getField(context.row, fieldAliases.doctrineFit);
    requireField(context, "DoctrineFitReadiness", "characterName", fieldAliases.characterName, issues, summaries);
    validateEnumField(context, "DoctrineFitReadiness", "readiness", ["Readiness", "Status"], enumValues.doctrineReadiness, issues, summaries);

    if (corpKey && doctrineFit && !hasNaturalKey(lookups.doctrineFitKeys, corpKey, doctrineFit)) {
      addModelIssue(issues, summaries, "DoctrineFitReadiness", "error", "unresolved_doctrine_fit_reference", "Doctrine readiness references an unknown doctrine fit.", {
        context,
        field: "doctrineFit",
        value: safeValue(doctrineFit),
        suggestedFix: "Confirm doctrine fit name/code and corp mapping."
      });
    }
  });
}

function validateDoctrinePilotRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "DoctrinePilot", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "DoctrinePilot");
    requireField(context, "DoctrinePilot", "characterName", fieldAliases.characterName, issues, summaries);
  });
}

function validateSrpRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "SrpRequest", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "SrpRequest");
    requireField(context, "SrpRequest", "characterName", fieldAliases.characterName, issues, summaries);
    requireField(context, "SrpRequest", "shipLost", fieldAliases.shipLost, issues, summaries);
    validateEnumField(context, "SrpRequest", "status", fieldAliases.status, enumValues.srpStatus, issues, summaries);
    validateNumberField(context, "SrpRequest", "estimatedValue", fieldAliases.estimatedValue, issues, summaries);
    validateNumberField(context, "SrpRequest", "requestedPayout", fieldAliases.requestedPayout, issues, summaries);
    validateDateField(context, "SrpRequest", "createdAt", fieldAliases.createdAt, issues, summaries);
  });
}

function validateRecruitmentRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "RecruitmentApplicant", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "RecruitmentApplicant");
    requireField(context, "RecruitmentApplicant", "applicantName", fieldAliases.applicantName, issues, summaries);
    validateEnumField(context, "RecruitmentApplicant", "status", fieldAliases.status, enumValues.recruitmentStatus, issues, summaries);
    validateDateField(context, "RecruitmentApplicant", "createdAt", fieldAliases.createdAt, issues, summaries);
  });
}

function validateLootSplitRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "LootSplit", summaries, (context) => {
    resolveCorpKey(context, lookups.corpKeys, lookups.knownCorpSlugs, issues, summaries, "LootSplit");
    requireField(context, "LootSplit", "operationName", fieldAliases.operationName, issues, summaries);
    validateEnumField(context, "LootSplit", "status", fieldAliases.status, enumValues.lootSplitStatus, issues, summaries);
    validateNumberField(context, "LootSplit", "totalIskValue", fieldAliases.totalIskValue, issues, summaries);
    validateNumberField(context, "LootSplit", "corpCutPercent", fieldAliases.corpCutPercent, issues, summaries);
    validateNumberField(context, "LootSplit", "corpCutAmount", fieldAliases.corpCutAmount, issues, summaries);
    validateNumberField(context, "LootSplit", "srpReservePercent", fieldAliases.srpReservePercent, issues, summaries);
    validateNumberField(context, "LootSplit", "srpReserveAmount", fieldAliases.srpReserveAmount, issues, summaries);
    validateNumberField(context, "LootSplit", "payoutPool", fieldAliases.payoutPool, issues, summaries);
    validateNumberField(context, "LootSplit", "totalShares", fieldAliases.totalShares, issues, summaries);
  });
}

function validateLootParticipantRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "LootSplitParticipant", summaries, (context) => {
    const lootSplit = getField(context.row, fieldAliases.lootSplit);
    const corpKey = resolveCorpValue(getField(context.row, fieldAliases.corp), lookups.corpKeys);
    requireField(context, "LootSplitParticipant", "pilotName", fieldAliases.pilotName, issues, summaries);
    validateNumberField(context, "LootSplitParticipant", "shares", fieldAliases.shares, issues, summaries);
    validateNumberField(context, "LootSplitParticipant", "payoutAmount", fieldAliases.payoutAmount, issues, summaries);

    if (lootSplit && corpKey && !hasNaturalKey(lookups.lootSplitKeys, corpKey, lootSplit)) {
      addModelIssue(issues, summaries, "LootSplitParticipant", "error", "unresolved_loot_split_reference", "Loot participant references an unknown loot split.", {
        context,
        field: "lootSplit",
        value: safeValue(lootSplit),
        suggestedFix: "Confirm loot split operation name and corp mapping."
      });
    }
  });
}

function validateEveTypeRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "EveTypeLookup", summaries, (context) => {
    requireField(context, "EveTypeLookup", "typeName", fieldAliases.typeName, issues, summaries);
    validateIntegerField(context, "EveTypeLookup", "typeId", fieldAliases.typeId, issues, summaries);
  });
}

function validateAuditLogRows(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  lookups: Lookups,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  forEachModelRow(sheetsByModel, "OfficerAuditLog", summaries, (context) => {
    requireField(context, "OfficerAuditLog", "module", fieldAliases.module, issues, summaries);
    requireField(context, "OfficerAuditLog", "action", ["Action"], issues, summaries);
    validateDateField(context, "OfficerAuditLog", "createdAt", fieldAliases.createdAt, issues, summaries);

    const corpValue = getField(context.row, fieldAliases.corp);
    if (corpValue && !resolveCorpValue(corpValue, lookups.corpKeys)) {
      addModelIssue(issues, summaries, "OfficerAuditLog", "warning", "unresolved_corp_reference", "Audit log corp reference is not known.", {
        context,
        field: "corp",
        value: safeValue(corpValue)
      });
    }

    for (const field of ["Before", "After", "Details"]) {
      const value = getField(context.row, [field]);
      if (value && !parseJsonOrList(value, true).ok) {
        addModelIssue(issues, summaries, "OfficerAuditLog", "warning", "malformed_json", `${field} is not parseable JSON.`, {
          context,
          field
        });
      }
    }
  });
}

function detectNaturalKeyDuplicates(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const configs: Array<{
    model: TargetModel;
    code: string;
    keyFor: (context: RowContext) => string;
  }> = [
    {
      model: "Operation",
      code: "duplicate_operation_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), getField(context.row, fieldAliases.operationCode) || getField(context.row, fieldAliases.operationName), normalizeDateKey(getField(context.row, fieldAliases.operationDate))].join("|")
    },
    {
      model: "OperationAttendance",
      code: "duplicate_attendance_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.operationRef), normalizeNameKey(getField(context.row, fieldAliases.characterName))].join("|")
    },
    {
      model: "DoctrineFit",
      code: "duplicate_doctrine_fit_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), getField(context.row, fieldAliases.doctrineCode) || getField(context.row, fieldAliases.doctrineName), getField(context.row, fieldAliases.shipHull)].join("|")
    },
    {
      model: "DoctrineFitReadiness",
      code: "duplicate_doctrine_readiness_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), getField(context.row, fieldAliases.doctrineFit), normalizeNameKey(getField(context.row, fieldAliases.characterName))].join("|")
    },
    {
      model: "SrpRequest",
      code: "duplicate_srp_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), normalizeNameKey(getField(context.row, fieldAliases.characterName)), getField(context.row, fieldAliases.killmailLink) || getField(context.row, fieldAliases.shipLost)].join("|")
    },
    {
      model: "RecruitmentApplicant",
      code: "duplicate_recruitment_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), normalizeNameKey(getField(context.row, fieldAliases.mainCharacter) || getField(context.row, fieldAliases.applicantName)), normalizeDateKey(getField(context.row, fieldAliases.createdAt))].join("|")
    },
    {
      model: "LootSplit",
      code: "duplicate_loot_split_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.corp), getField(context.row, fieldAliases.operationName), normalizeDateKey(getField(context.row, fieldAliases.createdAt))].join("|")
    },
    {
      model: "LootSplitParticipant",
      code: "duplicate_loot_participant_natural_key",
      keyFor: (context) => [getField(context.row, fieldAliases.lootSplit), normalizeNameKey(getField(context.row, fieldAliases.characterName) || getField(context.row, fieldAliases.pilotName))].join("|")
    }
  ];

  for (const config of configs) {
    const seen = new Map<string, RowContext>();

    forEachModelRow(sheetsByModel, config.model, summaries, (context) => {
      const key = config.keyFor(context);

      if (!key || key.split("|").every((part) => !part.trim())) {
        return;
      }

      const prior = seen.get(key);

      if (prior) {
        addModelIssue(issues, summaries, config.model, "warning", config.code, "Likely duplicate natural key.", {
          context,
          suggestedFix: `Compare with row ${prior.row.rowNumber} in ${prior.sheet.sheetName}.`
        });
      } else {
        seen.set(key, context);
      }
    }, false);
  }
}

function requireField(
  context: RowContext,
  model: TargetModel,
  field: string,
  candidates: string[],
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const value = getField(context.row, candidates);

  if (!value) {
    addModelIssue(issues, summaries, model, "error", "missing_required_field", `${model}.${field} is required.`, {
      context,
      field,
      suggestedFix: `Fill a value for ${field} or add a source mapping.`
    });
  }

  return value;
}

function validateEnumField(
  context: RowContext,
  model: TargetModel,
  field: string,
  candidates: string[],
  allowed: Set<string>,
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const value = getField(context.row, candidates);

  if (!value) {
    return;
  }

  const normalized = normalizeStatus(value);

  if (!allowed.has(normalized)) {
    addModelIssue(issues, summaries, model, "error", "bad_status_value", `${model}.${field} has an unknown status/enum value.`, {
      context,
      field,
      value: safeValue(value),
      suggestedFix: `Use one of: ${Array.from(allowed).join(", ")}.`
    });
  }
}

function validateDateField(
  context: RowContext,
  model: TargetModel,
  field: string,
  candidates: string[],
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const value = getField(context.row, candidates);

  if (!value) {
    return;
  }

  if (!parseDate(value).ok) {
    addModelIssue(issues, summaries, model, "warning", "invalid_date", `${model}.${field} is not a parseable date.`, {
      context,
      field,
      value: safeValue(value),
      suggestedFix: "Use ISO format or a clear date/time value before export."
    });
  }
}

function validateNumberField(
  context: RowContext,
  model: TargetModel,
  field: string,
  candidates: string[],
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const value = getField(context.row, candidates);

  if (!value) {
    return;
  }

  if (!parseNumberOrISK(value).ok) {
    addModelIssue(issues, summaries, model, "warning", "invalid_number", `${model}.${field} is not a parseable number/ISK value.`, {
      context,
      field,
      value: safeValue(value),
      suggestedFix: "Remove non-numeric notes from numeric cells."
    });
  }
}

function validateIntegerField(
  context: RowContext,
  model: TargetModel,
  field: string,
  candidates: string[],
  issues: Issue[],
  summaries: ModelSummary[]
) {
  const value = getField(context.row, candidates);

  if (!value) {
    return;
  }

  const parsed = parseNumberOrISK(value);

  if (!parsed.ok || parsed.value === null || !Number.isInteger(parsed.value)) {
    addModelIssue(issues, summaries, model, "warning", "invalid_integer", `${model}.${field} is not a parseable integer.`, {
      context,
      field,
      value: safeValue(value)
    });
  }
}

function resolveCorpKey(
  context: RowContext,
  corpKeys: Map<string, string>,
  knownCorpSlugs: string[] | Set<string>,
  issues: Issue[],
  summaries: ModelSummary[],
  model: TargetModel
) {
  const corpValue = getField(context.row, fieldAliases.corp);
  const resolved = resolveCorpValue(corpValue, corpKeys);

  if (!resolved) {
    addModelIssue(issues, summaries, model, "error", "unresolved_corp_reference", "Row references an unknown or missing corp.", {
      context,
      field: "corp",
      value: safeValue(corpValue),
      suggestedFix: buildUnresolvedCorpFix(corpValue, knownCorpSlugs)
    });
  }

  return resolved;
}

function resolveCorpValue(value: string, corpKeys: Map<string, string>) {
  if (!value) {
    return "";
  }

  return corpKeys.get(normalizeSlug(value)) || corpKeys.get(normalizeNameKey(value)) || "";
}

function applyCorpAliases(
  corpKeys: Map<string, string>,
  knownCorpSlugs: Set<string>,
  mapping: MigrationMapping,
  issues: Issue[]
) {
  for (const [sourceAlias, targetSlugValue] of Object.entries(mapping.corpAliases)) {
    const targetSlug = normalizeSlug(targetSlugValue);

    if (!targetSlug || !knownCorpSlugs.has(targetSlug)) {
      addIssue(issues, "error", "invalid_corp_alias_target", "Corp alias points to a slug that does not exist in the exported Corp Registry.", {
        field: "corpAliases",
        value: `${safeValue(sourceAlias)} -> ${safeValue(targetSlugValue)}`,
        suggestedFix: `Map the alias to one of: ${Array.from(knownCorpSlugs).sort().join(", ") || "no known corps found"}.`
      });
      continue;
    }

    addLookupKey(corpKeys, sourceAlias, targetSlug);
    addLookupKey(corpKeys, normalizeSlug(sourceAlias), targetSlug);
    addLookupKey(corpKeys, normalizeNameKey(sourceAlias), targetSlug);
  }
}

function buildUnresolvedCorpFix(value: string, knownCorpSlugs: string[] | Set<string>) {
  const known = Array.isArray(knownCorpSlugs)
    ? knownCorpSlugs
    : Array.from(knownCorpSlugs);
  const normalized = normalizeSlug(value);
  const suggestions = suggestCloseMatches(normalized, known);
  const base = `Attempted normalized value: ${normalized || "(blank)"}. Add this value to corpAliases or fix the source corp cell.`;

  if (!suggestions.length) {
    return `${base} Known corp slugs: ${known.slice(0, 8).join(", ") || "none"}.`;
  }

  return `${base} Possible matches: ${suggestions.join(", ")}.`;
}

function suggestCloseMatches(value: string, candidates: string[]) {
  if (!value) {
    return [];
  }

  return candidates
    .map((candidate) => ({
      candidate,
      score: similarityScore(value, candidate)
    }))
    .filter((item) => item.score > 0.35 || item.candidate.includes(value) || value.includes(item.candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.candidate);
}

function similarityScore(a: string, b: string) {
  const aParts = new Set(a.split("-").filter(Boolean));
  const bParts = new Set(b.split("-").filter(Boolean));
  const intersection = Array.from(aParts).filter((part) => bParts.has(part)).length;
  const union = new Set([...aParts, ...bParts]).size || 1;

  return intersection / union;
}

function addNaturalKeys(set: Set<string>, corpKey: string, values: string[]) {
  for (const value of values) {
    if (value.trim()) {
      set.add(`${corpKey}|${normalizeNameKey(value)}`);
    }
  }
}

function hasNaturalKey(set: Set<string>, corpKey: string, value: string) {
  return set.has(`${corpKey}|${normalizeNameKey(value)}`);
}

function addLookupKey(map: Map<string, string>, key: string, value: string) {
  if (key) {
    map.set(key, value);
  }
}

function forEachModelRow(
  sheetsByModel: Map<TargetModel, ExportSheet[]>,
  model: TargetModel,
  summaries: ModelSummary[],
  callback: (context: RowContext) => void,
  countRows = true
) {
  const sheets = sheetsByModel.get(model) || [];
  const summary = summaries.find((item) => item.model === model);

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      if (summary && countRows) {
        summary.rowsChecked += 1;
      }
      callback({ sheet, row });
    }
  }
}

function addModelIssue(
  issues: Issue[],
  summaries: ModelSummary[],
  model: TargetModel,
  severity: Severity,
  code: string,
  message: string,
  detail: {
    context: RowContext;
    field?: string;
    value?: string;
    suggestedFix?: string;
  }
) {
  const added = addIssue(issues, severity, code, message, {
    sheetName: detail.context.sheet.sheetName,
    rowNumber: detail.context.row.rowNumber,
    field: detail.field,
    value: detail.value,
    suggestedFix: detail.suggestedFix
  });

  const summary = summaries.find((item) => item.model === model);
  if (summary && added) {
    summary.issueCounts[severity] += 1;
  }
}

function buildReport(input: {
  options: CliOptions;
  blueprintRef: FileReference;
  schemaRef: FileReference;
  exportPackage: ExportPackage;
  inventory: {
    expected: SourceInventoryItem[];
    unmappedSheets: UnmappedSheet[];
    ambiguousSheets: UnmappedSheet[];
  };
  modelSummaries: ModelSummary[];
  issues: Issue[];
}): Report {
  return {
    generatedAt: new Date().toISOString(),
    input: {
      exportPath: input.options.exportPath,
      manifestPath: input.options.manifestPath,
      mappingPath: input.options.mappingPath,
      outDir: input.options.outDir
    },
    referenceFiles: {
      blueprint: input.blueprintRef,
      prismaSchema: input.schemaRef
    },
    summary: {
      sheetCount: input.exportPackage.sheets.length,
      rowCount: input.exportPackage.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      issueCounts: countIssues(input.issues)
    },
    sourceInventory: input.inventory,
    modelSummaries: input.modelSummaries,
    issues: input.issues
  };
}

async function writeFatalReport(
  options: CliOptions,
  blueprintRef: FileReference,
  schemaRef: FileReference,
  issues: Issue[]
) {
  const report: Report = {
    generatedAt: new Date().toISOString(),
    input: {
      exportPath: options.exportPath,
      manifestPath: options.manifestPath,
      mappingPath: options.mappingPath,
      outDir: options.outDir
    },
    referenceFiles: {
      blueprint: blueprintRef,
      prismaSchema: schemaRef
    },
    summary: {
      sheetCount: 0,
      rowCount: 0,
      issueCounts: countIssues(issues)
    },
    sourceInventory: {
      expected: [],
      unmappedSheets: [],
      ambiguousSheets: []
    },
    modelSummaries: [],
    issues
  };

  await writeReports(options.outDir, report);
  printSummary(report);
}

async function writeReports(outDir: string, report: Report) {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "migration-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "migration-report.md"), renderMarkdownReport(report));
}

function renderMarkdownReport(report: Report) {
  const lines: string[] = [];

  lines.push("# Vyraj v1 Export Validation Report", "");
  lines.push(`Generated: ${report.generatedAt}`, "");
  lines.push("## Summary", "");
  lines.push(`- Sheets: ${report.summary.sheetCount}`);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Issues: ${formatIssueCounts(report.summary.issueCounts)}`);
  lines.push("");
  lines.push("## Source Inventory", "");
  lines.push("| Target model | Status | Found sheets | Expected aliases |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of report.sourceInventory.expected) {
    lines.push(`| ${item.model} | ${item.status} | ${item.foundSheets.join(", ") || "-"} | ${item.aliases.join(", ")} |`);
  }
  lines.push("");
  lines.push("## Model Summary", "");
  lines.push("| Model | Sheets | Rows checked | Issues |");
  lines.push("| --- | --- | ---: | --- |");
  for (const item of report.modelSummaries) {
    lines.push(`| ${item.model} | ${item.sheets.join(", ") || "-"} | ${item.rowsChecked} | ${formatIssueCounts(item.issueCounts)} |`);
  }
  lines.push("");
  lines.push("## Issues", "");

  if (!report.issues.length) {
    lines.push("No issues found.", "");
  } else {
    lines.push("| Severity | Code | Sheet | Row | Field | Message | Suggested fix |");
    lines.push("| --- | --- | --- | ---: | --- | --- | --- |");
    for (const issue of report.issues) {
      lines.push([
        issue.severity,
        issue.code,
        issue.sheetName || "-",
        issue.rowNumber === undefined ? "-" : String(issue.rowNumber),
        issue.field || "-",
        escapeMarkdownTable(issue.message),
        escapeMarkdownTable(issue.suggestedFix || "-")
      ].join(" | ").replace(/^/, "| ").concat(" |"));
    }
    lines.push("");
  }

  lines.push("## Notes", "");
  lines.push("- This is dry-run validation only.");
  lines.push("- The validator does not import data or write to Postgres.");
  lines.push("- Full row payloads are intentionally omitted from reports.");

  return `${lines.join("\n")}\n`;
}

function printSummary(report: Report) {
  console.log(`Migration validation report written to ${report.input.outDir}`);
  console.log(`Sheets: ${report.summary.sheetCount}`);
  console.log(`Rows: ${report.summary.rowCount}`);
  console.log(`Issues: ${formatIssueCounts(report.summary.issueCounts)}`);
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeStatus(value: string) {
  const trimmed = value.trim();
  const alias = new Map<string, string>([
    ["live", "ACTIVE"],
    ["enabled", "ACTIVE"],
    ["enable", "ACTIVE"],
    ["disabled", "DISABLED"],
    ["disable", "DISABLED"],
    ["super admin", "SUPER_ADMIN"],
    ["superadmin", "SUPER_ADMIN"],
    ["alliance officer", "ALLIANCE_OFFICER"],
    ["all members", "ALL_MEMBERS"],
    ["super admins", "SUPER_ADMINS"],
    ["standing order", "STANDING_ORDER"],
    ["featured op", "FEATURED_OP"],
    ["needs skills", "NEEDS_SKILLS"],
    ["needs hull", "NEEDS_HULL"],
    ["needs fit", "NEEDS_FIT"],
    ["not ready", "NOT_READY"],
    ["under review", "UNDER_REVIEW"],
    ["needs info", "NEEDS_INFO"],
    ["on hold", "ON_HOLD"]
  ]);

  return alias.get(normalizeNameKey(trimmed)) || trimmed.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
}

export function parseDate(value: string): ParsedDate {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 0) {
      const millis = Math.round((serial - 25569) * 86400 * 1000);
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? { ok: false, value: null } : { ok: true, value: date };
    }
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? { ok: false, value: null } : { ok: true, value: date };
}

export function parseNumberOrISK(value: string): ParsedNumber {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/[(),]/g, "")
    .replace(/\bisk\b/gi, "")
    .replace(/\$/g, "")
    .trim();
  const number = Number(cleaned);

  if (!Number.isFinite(number)) {
    return { ok: false, value: null };
  }

  return {
    ok: true,
    value: negative ? -number : number
  };
}

export function parseJsonOrList(value: string, jsonOnly = false) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: true, value: null as unknown };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    if (jsonOnly) {
      return { ok: false, value: null as unknown };
    }

    if (trimmed.includes("\n") || trimmed.includes(",")) {
      return {
        ok: true,
        value: trimmed.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
      };
    }

    return { ok: true, value: [trimmed] };
  }
}

export function normalizePermissionKey(value: string) {
  const trimmed = value.trim();

  if (knownPermissionKeys.has(trimmed)) {
    return trimmed;
  }

  return permissionAliases.get(normalizeNameKey(trimmed)) || "";
}

export function normalizeEnabledModules(value: string) {
  const parsed = parseJsonOrList(value);

  if (!parsed.ok) {
    return {
      ok: false,
      message: "Enabled modules could not be parsed."
    };
  }

  const allowed = new Set(["attendance", "doctrine", "srp", "recruitment", "lootSplits", "dashboard"]);
  const aliases = new Map<string, string>([
    ["op attendance", "attendance"],
    ["attendance", "attendance"],
    ["doctrine readiness", "doctrine"],
    ["doctrine", "doctrine"],
    ["srp requests", "srp"],
    ["srp", "srp"],
    ["recruitment review", "recruitment"],
    ["recruitment", "recruitment"],
    ["loot", "lootSplits"],
    ["loot splits", "lootSplits"],
    ["loot split calculation", "lootSplits"],
    ["dashboard", "dashboard"],
    ["corp dashboard", "dashboard"]
  ]);

  if (Array.isArray(parsed.value)) {
    for (const item of parsed.value) {
      const moduleKey = aliases.get(normalizeNameKey(String(item)));
      if (!moduleKey || !allowed.has(moduleKey)) {
        return {
          ok: false,
          message: `Unknown enabled module: ${safeValue(String(item))}.`
        };
      }
    }
  }

  if (isRecord(parsed.value)) {
    for (const key of Object.keys(parsed.value)) {
      const moduleKey = aliases.get(normalizeNameKey(key)) || key;
      if (!allowed.has(moduleKey)) {
        return {
          ok: false,
          message: `Unknown enabled module key: ${safeValue(key)}.`
        };
      }
    }
  }

  return {
    ok: true,
    message: "Enabled modules parsed."
  };
}

function modelsForSheetName(sheetName: string, mapping: MigrationMapping): TargetModel[] {
  const mappedModel = mappedSheetModel(sheetName, mapping);

  if (mappedModel) {
    return [mappedModel];
  }

  const normalized = normalizeNameKey(sheetName);

  return expectedSources
    .filter((source) => source.aliases.some((alias) => normalizeNameKey(alias) === normalized))
    .map((source) => source.model);
}

function validationModelForSheet(sheetName: string, ambiguousNames: Set<string>, mapping: MigrationMapping): TargetModel | null {
  const mappedModel = mappedSheetModel(sheetName, mapping);

  if (mappedModel) {
    return mappedModel;
  }

  const normalized = normalizeNameKey(sheetName);
  const matches = expectedSources.filter((source) =>
    source.aliases.some((alias) => normalizeNameKey(alias) === normalized)
  );

  if (!matches.length) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0].model;
  }

  const primary = matches.find((source) => normalizeNameKey(source.aliases[0]) === normalized);

  if (primary) {
    return primary.model;
  }

  if (ambiguousNames.has(normalized)) {
    return null;
  }

  return matches[0].model;
}

function mappedSheetModel(sheetName: string, mapping: MigrationMapping): TargetModel | null {
  const exact = mapping.sheetAliases[sheetName];

  if (exact) {
    return exact;
  }

  const normalizedSheetName = normalizeNameKey(sheetName);
  const normalizedMatch = Object.entries(mapping.sheetAliases).find(
    ([mappedSheetName]) => normalizeNameKey(mappedSheetName) === normalizedSheetName
  );

  return normalizedMatch ? normalizedMatch[1] : null;
}

function getField(row: ExportRow, candidates: string[]) {
  const objectEntries = Object.entries(row.object);
  const normalizedCandidates = candidates.map(normalizeNameKey);

  for (const candidate of normalizedCandidates) {
    const found = objectEntries.find(([key]) => normalizeNameKey(key) === candidate);
    if (found && !isBlank(found[1])) {
      return String(found[1]).trim();
    }
  }

  return "";
}

function normalizeDateKey(value: string) {
  const parsed = parseDate(value);
  if (parsed.ok && parsed.value) {
    return parsed.value.toISOString().slice(0, 10);
  }
  return normalizeNameKey(value);
}

function addIssue(
  issues: Issue[],
  severity: Severity,
  code: string,
  message: string,
  detail: Partial<Omit<Issue, "severity" | "code" | "message">> = {}
) {
  const issue = {
    severity,
    code,
    message,
    ...detail
  };
  const key = [
    issue.severity,
    issue.code,
    issue.sheetName || "",
    issue.rowNumber ?? "",
    issue.field || "",
    issue.value || ""
  ].join("|");

  if (emittedIssueKeys.has(key)) {
    return false;
  }

  emittedIssueKeys.add(key);
  issues.push(issue);
  return true;
}

function countIssues(issues: Issue[]) {
  const counts = emptyIssueCounts();

  for (const issue of issues) {
    counts[issue.severity] += 1;
  }

  return counts;
}

function emptyIssueCounts(): Record<Severity, number> {
  return {
    info: 0,
    warning: 0,
    error: 0,
    fatal: 0
  };
}

function formatIssueCounts(counts: Record<Severity, number>) {
  return `fatal ${counts.fatal}, error ${counts.error}, warning ${counts.warning}, info ${counts.info}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTargetModel(value: string): value is TargetModel {
  return expectedSources.some((source) => source.model === value);
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function optionalString(value: unknown) {
  const text = stringValue(value);
  return text || undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)) : [];
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(stringValue(value)) || 0;
}

function numberOrUndefined(value: unknown) {
  const number = typeof value === "number" ? value : Number(stringValue(value));
  return Number.isFinite(number) ? number : undefined;
}

function recordToStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, stringValue(entryValue)]));
}

function coerceWarnings(value: unknown): ExportWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((warning) => ({
    level: optionalString(warning.level),
    type: optionalString(warning.type),
    sheetName: optionalString(warning.sheetName),
    rowNumber: numberOrUndefined(warning.rowNumber) ?? null,
    message: optionalString(warning.message)
  }));
}

function isBlank(value: string) {
  return value.trim() === "";
}

function safeValue(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 48) {
    return trimmed;
  }
  return `${trimmed.slice(0, 45)}...`;
}

function mapWarningSeverity(level: string | undefined): Severity {
  if (level === "fatal" || level === "error" || level === "warning" || level === "info") {
    return level;
  }
  return "warning";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeMarkdownTable(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
