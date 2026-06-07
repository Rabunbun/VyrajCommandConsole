/**
 * Vyraj Alliance Command Console v1 migration export utility.
 *
 * This file is migration-only. It reads the active spreadsheet and writes a
 * stable export package to Google Drive. It does not alter sheets, v1 app
 * state, officer auth, permissions, or v2/Postgres data.
 */

var VYRAJ_MIGRATION_EXPORT_VERSION = "1.0.0";
var VYRAJ_MIGRATION_SOURCE_SYSTEM = "google_apps_script";

/**
 * Add tab names here if any v1 sheets should be excluded from migration export.
 * By default, every sheet in the active spreadsheet is exported.
 */
var VYRAJ_MIGRATION_EXCLUDED_SHEETS = [];

function onOpen() {
  vyrajInstallMigrationExportMenu_();
}

function vyrajInstallMigrationExportMenu_() {
  SpreadsheetApp.getUi()
    .createMenu("Vyraj Migration")
    .addItem("Export Migration Package", "vyrajExportMigrationPackageToDrive")
    .addToUi();
}

/**
 * Creates a Drive folder containing export.json, manifest.json, and one CSV per
 * exported sheet.
 *
 * @returns {Object} export result metadata with folder URL and file URLs.
 */
function vyrajExportMigrationPackageToDrive() {
  var packageData = vyrajCreateMigrationExportPackageData_();
  var folderName = "Vyraj Migration Export - " + vyrajFormatFolderTimestamp_(new Date());
  var folder = DriveApp.createFolder(folderName);
  var csvFolder = folder.createFolder("csv");

  var exportFile = folder.createFile(
    "export.json",
    vyrajStableJsonStringify_(packageData.exportData),
    MimeType.PLAIN_TEXT
  );
  var manifestFile = folder.createFile(
    "manifest.json",
    vyrajStableJsonStringify_(packageData.manifest),
    MimeType.PLAIN_TEXT
  );

  var csvFiles = packageData.csvFiles.map(function(csvFile) {
    var file = csvFolder.createFile(
      csvFile.fileName,
      csvFile.contents,
      MimeType.CSV
    );

    return {
      sheetName: csvFile.sheetName,
      fileName: csvFile.fileName,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    };
  });

  var result = {
    exportVersion: VYRAJ_MIGRATION_EXPORT_VERSION,
    sourceSystem: VYRAJ_MIGRATION_SOURCE_SYSTEM,
    spreadsheetId: packageData.exportData.spreadsheetId,
    spreadsheetName: packageData.exportData.spreadsheetName,
    exportedAt: packageData.exportData.exportedAt,
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    exportFileId: exportFile.getId(),
    exportFileUrl: exportFile.getUrl(),
    manifestFileId: manifestFile.getId(),
    manifestFileUrl: manifestFile.getUrl(),
    csvFolderId: csvFolder.getId(),
    csvFolderUrl: csvFolder.getUrl(),
    csvFiles: csvFiles,
    warnings: packageData.exportData.warnings
  };

  SpreadsheetApp.getUi().alert(
    "Vyraj migration export complete.\n\nFolder:\n" + folder.getUrl()
  );

  return result;
}

/**
 * Returns export.json contents as a JSON string for manual copy/download.
 *
 * @returns {string}
 */
function vyrajGetMigrationExportJsonString() {
  return vyrajStableJsonStringify_(vyrajCreateMigrationExportPackageData_().exportData);
}

/**
 * Returns manifest.json contents as a JSON string for manual copy/download.
 *
 * @returns {string}
 */
function vyrajGetMigrationManifestJsonString() {
  return vyrajStableJsonStringify_(vyrajCreateMigrationExportPackageData_().manifest);
}

/**
 * Returns all per-sheet CSV outputs as an object keyed by generated file name.
 *
 * @returns {Object<string, string>}
 */
function vyrajGetMigrationCsvStrings() {
  var csvByFileName = {};

  vyrajCreateMigrationExportPackageData_().csvFiles.forEach(function(csvFile) {
    csvByFileName[csvFile.fileName] = csvFile.contents;
  });

  return csvByFileName;
}

/**
 * Returns the complete export package in memory. Useful from the Apps Script
 * editor when Drive creation is not desired.
 *
 * @returns {{exportData: Object, manifest: Object, csvFiles: Object[]}}
 */
function vyrajBuildMigrationExportPackageForManualUse() {
  return vyrajCreateMigrationExportPackageData_();
}

/**
 * Compatibility wrapper for any already-copied menu item or manual run that
 * points at the old build/export name. The menu should call
 * vyrajExportMigrationPackageToDrive directly.
 *
 * @returns {Object} export result metadata with folder URL and file URLs.
 */
function vyrajBuildMigrationExportPackage_() {
  return vyrajExportMigrationPackageToDrive();
}

function vyrajCreateMigrationExportPackageData_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var exportedAt = new Date().toISOString();
  var excludedSheetNames = vyrajBuildExcludedSheetNameSet_();
  var exportWarnings = [];
  var exportedSheets = [];
  var manifestSheets = [];
  var csvFiles = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    var sheetName = sheet.getName();

    if (excludedSheetNames[vyrajNormalizeSheetName_(sheetName)]) {
      exportWarnings.push({
        level: "info",
        type: "excluded_sheet",
        sheetName: sheetName,
        message: "Sheet was explicitly excluded from migration export."
      });
      return;
    }

    var sheetExport = vyrajExportSheet_(sheet);

    exportedSheets.push(sheetExport.exportSheet);
    manifestSheets.push(sheetExport.manifestSheet);
    csvFiles.push({
      sheetName: sheetName,
      fileName: vyrajBuildCsvFileName_(sheetName),
      contents: sheetExport.csv
    });

    sheetExport.warnings.forEach(function(warning) {
      exportWarnings.push(warning);
    });
  });

  var base = {
    exportVersion: VYRAJ_MIGRATION_EXPORT_VERSION,
    sourceSystem: VYRAJ_MIGRATION_SOURCE_SYSTEM,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    exportedAt: exportedAt
  };

  var exportData = {
    exportVersion: base.exportVersion,
    sourceSystem: base.sourceSystem,
    spreadsheetId: base.spreadsheetId,
    spreadsheetName: base.spreadsheetName,
    exportedAt: base.exportedAt,
    warnings: exportWarnings,
    sheets: exportedSheets
  };

  var manifest = {
    exportVersion: base.exportVersion,
    sourceSystem: base.sourceSystem,
    spreadsheetId: base.spreadsheetId,
    spreadsheetName: base.spreadsheetName,
    exportedAt: base.exportedAt,
    sheetCount: exportedSheets.length,
    warnings: exportWarnings,
    sheets: manifestSheets
  };

  return {
    exportData: exportData,
    manifest: manifest,
    csvFiles: csvFiles
  };
}

function vyrajExportSheet_(sheet) {
  var sheetName = sheet.getName();
  var sheetId = sheet.getSheetId();
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var warnings = [];
  var headers = [];
  var objectKeys = [];
  var rows = [];
  var displayValues = [];

  if (lastRow < 1 || lastColumn < 1) {
    warnings.push(vyrajWarning_("warning", "blank_sheet", sheetName, null, "Sheet is blank."));

    return {
      exportSheet: {
        sheetName: sheetName,
        sheetId: sheetId,
        headers: headers,
        objectKeys: objectKeys,
        rowCount: 0,
        warnings: warnings,
        rows: rows
      },
      manifestSheet: {
        sheetName: sheetName,
        sheetId: sheetId,
        headerCount: 0,
        rowCount: 0,
        warnings: warnings
      },
      csv: "",
      warnings: warnings
    };
  }

  displayValues = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  headers = displayValues[0].map(function(value) {
    return String(value);
  });
  objectKeys = vyrajBuildObjectKeys_(headers, sheetName, warnings);

  if (headers.length === 0 || headers.every(vyrajIsBlankValue_)) {
    warnings.push(vyrajWarning_("warning", "missing_headers", sheetName, 1, "Header row is missing or blank."));
  }

  for (var rowIndex = 1; rowIndex < displayValues.length; rowIndex += 1) {
    var rowValues = displayValues[rowIndex].map(function(value) {
      return String(value);
    });
    var rowNumber = rowIndex + 1;
    var isBlankRow = rowValues.every(vyrajIsBlankValue_);
    var object = {};

    objectKeys.forEach(function(key, columnIndex) {
      object[key] = rowValues[columnIndex] || "";
    });

    if (isBlankRow) {
      warnings.push(vyrajWarning_("info", "blank_row", sheetName, rowNumber, "Row has all blank displayed values."));
    }

    rows.push({
      rowNumber: rowNumber,
      values: rowValues,
      object: object
    });
  }

  return {
    exportSheet: {
      sheetName: sheetName,
      sheetId: sheetId,
      headers: headers,
      objectKeys: objectKeys,
      rowCount: rows.length,
      warnings: warnings,
      rows: rows
    },
    manifestSheet: {
      sheetName: sheetName,
      sheetId: sheetId,
      headerCount: headers.length,
      rowCount: rows.length,
      warnings: warnings
    },
    csv: vyrajBuildCsv_(headers, rows),
    warnings: warnings
  };
}

function vyrajBuildObjectKeys_(headers, sheetName, warnings) {
  var seen = {};

  return headers.map(function(rawHeader, index) {
    var header = String(rawHeader);
    var trimmed = header.trim();
    var key = trimmed;

    if (!trimmed) {
      key = "__blank_header_" + (index + 1);
      warnings.push(vyrajWarning_(
        "warning",
        "empty_header_cell",
        sheetName,
        1,
        "Column " + (index + 1) + " has an empty header. Object key " + key + " was generated."
      ));
    }

    if (seen[key]) {
      seen[key] += 1;
      var duplicateKey = key + "__" + seen[key];
      warnings.push(vyrajWarning_(
        "warning",
        "duplicate_header",
        sheetName,
        1,
        "Header " + key + " is duplicated. Object key " + duplicateKey + " was generated for column " + (index + 1) + "."
      ));
      return duplicateKey;
    }

    seen[key] = 1;
    return key;
  });
}

function vyrajBuildCsv_(headers, rows) {
  var lines = [];

  if (!headers.length && !rows.length) {
    return "";
  }

  lines.push(headers.map(vyrajEscapeCsvCell_).join(","));

  rows.forEach(function(row) {
    lines.push(row.values.map(vyrajEscapeCsvCell_).join(","));
  });

  return lines.join("\r\n");
}

function vyrajEscapeCsvCell_(value) {
  var text = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function vyrajBuildExcludedSheetNameSet_() {
  var set = {};

  VYRAJ_MIGRATION_EXCLUDED_SHEETS.forEach(function(sheetName) {
    set[vyrajNormalizeSheetName_(sheetName)] = true;
  });

  return set;
}

function vyrajNormalizeSheetName_(sheetName) {
  return String(sheetName || "").trim().toLowerCase();
}

function vyrajIsBlankValue_(value) {
  return String(value || "").trim() === "";
}

function vyrajWarning_(level, type, sheetName, rowNumber, message) {
  return {
    level: level,
    type: type,
    sheetName: sheetName,
    rowNumber: rowNumber,
    message: message
  };
}

function vyrajBuildCsvFileName_(sheetName) {
  var safeName = String(sheetName || "sheet")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .slice(0, 120);

  return (safeName || "sheet") + ".csv";
}

function vyrajFormatFolderTimestamp_(date) {
  var timeZone = Session.getScriptTimeZone() || "Etc/UTC";

  return Utilities.formatDate(date, timeZone, "yyyy-MM-dd HHmm");
}

function vyrajStableJsonStringify_(value) {
  return JSON.stringify(value, null, 2);
}
