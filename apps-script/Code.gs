/*******************************************************
 PRO4A RCD DOCUMENT ROUTING DATABASE
 SAFE / FAST VERSION

 OLD SHEET = READ ONLY SOURCE
 NEW SHEET = ROUTING DATABASE

 This version is optimized for 700+ records and also
 contains the Web App API used by the website.
*******************************************************/

const CONFIG = {
  SOURCE_SPREADSHEET_ID: "18GuL5EwafykdUrTBmQKBdQfMIv1BDtios5K-xHjTG1k",
  SOURCE_SHEET_NAME: "Memo Logbook",
  TARGET_SPREADSHEET_ID: "1P64c1lajVbIXyW8deBBwY-od_kseMfk5Y8LXj5ba04I",

  DOCUMENTS: "DOCUMENTS",
  MOVEMENT: "MOVEMENT LOG",
  PERSONNEL: "PERSONNEL",
  SECTIONS: "SECTIONS",
  DASHBOARD: "DASHBOARD",
  SYNC_LOG: "SYNC LOG",
  SETTINGS: "SETTINGS",

  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzXUw5_w_YlCDEHgW0zysoyRDdADF01yK-n7pHpKqv4f8kBFk82O9PXPLn_8GrsJqsMlg/exec",
  APP_URL: "https://rcd-document-tracker.vercel.app"
};

const PERSONNEL = [
  ["PCOL Verna C Cabuhat","RCD / Office of the Chief","YES"],
  ["PMAJ Kelvin Kim S Zita","Management Section","YES"],
  ["PMAJ Fernando C Punzalan Jr","PBAS Section","YES"],
  ["PEMS Maricel A Landicho","PBAS Section","YES"],
  ["PCpl Jovin R Recto","PBAS Section","YES"],
  ["PMAJ Genesis R Roque","Budget & Fiscal Section","YES"],
  ["PCMS Hannah F Novio","Budget & Fiscal Section","YES"],
  ["PMSg Derek F Regulacion","Budget & Fiscal Section","YES"],
  ["PMAJ Joseph M Dacullo","Action Section","YES"],
  ["PCpl Jamielyn V Laguras","Action Section","YES"],
  ["NUP Emelita B Paral","Action Section","YES"],
  ["NUP Richard R Munangson","Action Section","YES"],
  ["NUP Jessie Jim D Sampaga","Action Section","YES"],
  ["PEMS Eric A Hurtado","Admin Section","YES"],
  ["PMSg Karen C Mayong","Admin Section","YES"],
  ["PCpl Mariella R Garcia","Admin Section","YES"],
  ["PMSg Mark Anthony R Gayadan","Management Section","YES"],
  ["PCpl John Warren B Delos Reyes","Management Section","YES"],
  ["NUP Carmelita R Jaca","Management Section","YES"],
  ["NUP Ericka Joannah S Peña","Management Section","YES"],
  ["PMSg Laiza C Cruzim","NFA Section","YES"],
  ["NUP John Wencel M Caldit","Accounting Section","YES"],
  ["NUP Liezel A David","Accounting Section","YES"],
  ["NUP Annabelle A De Vera","Accounting Section","YES"],
  ["NUP Jonah Joy B Fraginal","Accounting Section","YES"],
  ["NUP Enery Ann L Oliva","Accounting Section","YES"],
  ["NUP Joan M Santos","Accounting Section","YES"],
  ["PCpl John Francis V Carradeo","Message Center","YES"],
  ["Pat Charmaine C Bornidor","Message Center","YES"],
  ["Pat Darwin T Solis","Message Center","YES"]
];

const SECTIONS = [
  "RCD / Office of the Chief",
  "Message Center",
  "Accounting Section",
  "Management Section",
  "PBAS Section",
  "Budget & Fiscal Section",
  "Action Section",
  "Admin Section",
  "NFA Section"
];

/**************** WEB API ****************/

function doGet(e) {
  return handleApi_(e, {});
}

function doPost(e) {
  let body = {};
  try {
    body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents) : {};
  } catch (_) {}
  return handleApi_(e, body);
}

function handleApi_(e, body) {
  try {
    const p = Object.assign({}, body || {}, (e && e.parameter) || {});
    const action = String(p.action || "").trim();
    const callback = p.callback || "";

    if (action === "dashboard") {
      return json_({result:"success", metrics:getMetrics_()}, callback);
    }

    if (action === "getDocument") {
      return json_(getDocument_(p.id), callback);
    }

    if (action === "getDocuments") {
      // The website refresh button can request a source refresh first.
      if (String(p.sync || "").toLowerCase() === "true") {
        syncDocuments_(false);
      }
      return json_(getDocuments_(p.limit), callback);
    }

    if (action === "getSections") {
      return json_({result:"success", sections:SECTIONS}, callback);
    }

    if (action === "getPersonnel") {
      return json_({
        result:"success",
        personnel:PERSONNEL
          .filter(x => x[1] === String(p.section || "") && x[2] === "YES")
          .map(x => x[0])
      }, callback);
    }

    if (action === "routeDocument") {
      return json_(routeDocument_(
        p.id, p.movement, p.section, p.personnel, p.remarks
      ), callback);
    }

    if (action === "sync") {
      return json_(syncDocuments_(false), callback);
    }

    return json_({
      result:"success",
      message:"PRO4A RCD Routing API is online.",
      actions:["dashboard","getDocument","getDocuments","getSections","getPersonnel","routeDocument","sync"]
    }, callback);

  } catch (err) {
    return json_({result:"error", error:String(err)}, ((e && e.parameter && e.parameter.callback) || ""));
  }
}

function json_(obj, callback) {
  const text = JSON.stringify(obj);
  if (callback) {
    const safe = String(callback).replace(/[^a-zA-Z0-9_$.]/g, "");
    return ContentService
      .createTextOutput(safe + "(" + text + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

/**************** SHEET SETUP ****************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("RCD ROUTING")
    .addItem("1. Setup Database","setupDatabase")
    .addItem("2. Sync Existing Memo Logbook","syncDocuments")
    .addItem("3. Generate Missing QR Codes","generateQRCodes")
    .addItem("4. Install Automatic Sync","installAutomaticSync")
    .addItem("5. Test Sync Connection","testSyncConnection")
    .addToUi();
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const documents = getOrCreateSheet_("DOCUMENTS");
  documents.clear();
  documents.getRange(1,1,1,20).setValues([[
    "Control Ref ID","Source Row","Date Logged","Time","Input / Received By",
    "Originating Office","Subject / Title of Memo","Action Required",
    "Remarks / Status","Transmitted Office","Date Received","RCD Location Status",
    "Google Drive Link","Current Section","Current Personnel","Routing Status",
    "Forwarded Date/Time","Section Received Date/Time","QR Code","Last Updated"
  ]]);
  documents.setFrozenRows(1);

  const movement = getOrCreateSheet_("MOVEMENT LOG");
  movement.clear();
  movement.getRange(1,1,1,8).setValues([[
    "Control Ref ID","Date/Time","Action","From Section","To Section",
    "Personnel","Remarks","User"
  ]]);
  movement.setFrozenRows(1);

  const personnel = getOrCreateSheet_("PERSONNEL");
  personnel.clear();
  personnel.getRange(1,1,1,3).setValues([["Personnel","Section","Active"]]);
  personnel.getRange(2,1,PERSONNEL.length,3).setValues(PERSONNEL);
  personnel.setFrozenRows(1);

  const sections = getOrCreateSheet_("SECTIONS");
  sections.clear();
  sections.getRange(1,1).setValue("Section");
  sections.getRange(2,1,SECTIONS.length,1).setValues(SECTIONS.map(x => [x]));
  sections.setFrozenRows(1);

  const syncLog = getOrCreateSheet_("SYNC LOG");
  syncLog.clear();
  syncLog.getRange(1,1,1,4).setValues([[
    "Date/Time","Action","Records Added","Records Updated"
  ]]);
  syncLog.setFrozenRows(1);

  const settings = getOrCreateSheet_("SETTINGS");
  settings.clear();
  settings.getRange(1,1,1,2).setValues([["Setting","Value"]]);
  settings.getRange(2,1,5,2).setValues([
    ["Source Spreadsheet ID",CONFIG.SOURCE_SPREADSHEET_ID],
    ["Source Sheet",CONFIG.SOURCE_SHEET_NAME],
    ["Routing Database Spreadsheet ID",CONFIG.TARGET_SPREADSHEET_ID],
    ["Web App URL",CONFIG.WEB_APP_URL],
    ["Website URL",CONFIG.APP_URL]
  ]);
  settings.setFrozenRows(1);

  buildDashboard_();

  [documents,movement,personnel,sections,syncLog,settings].forEach(s => {
    if (s.getLastColumn()) {
      s.getRange(1,1,1,s.getLastColumn()).setFontWeight("bold");
      s.autoResizeColumns(1,s.getLastColumn());
    }
  });

  SpreadsheetApp.getUi().alert("Database setup completed.");
}

/**************** FAST SYNC ****************/

function syncDocuments() {
  syncDocuments_(true);
}

function getSourceSheet_(sourceSS) {
  const exact = sourceSS.getSheetByName(CONFIG.SOURCE_SHEET_NAME);
  if (exact) return exact;

  const sheets = sourceSS.getSheets();
  if (!sheets.length) throw new Error("Source spreadsheet has no sheets.");

  // If the tab was renamed, use the first non-empty sheet rather than silently
  // failing. The chosen sheet name is written to the sync log for diagnosis.
  const candidate = sheets.find(sh => sh.getLastRow() > 1 && sh.getLastColumn() > 1);
  if (candidate) return candidate;
  return sheets[0];
}

function getControlRefId_(headers, row) {
  // Prefer a header named Control Ref ID if present. Otherwise retain the
  // original project convention where Control Ref ID is column B.
  const normalized = (headers || []).map(h => String(h || '').trim().toLowerCase());
  const idx = normalized.findIndex(h =>
    h === 'control ref id' || h === 'control reference id' || h === 'control ref. id'
  );
  const value = idx >= 0 ? row[idx] : row[1];
  return String(value || '').trim();
}

function testSyncConnection() {
  const targetSS = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);
  const sourceSS = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
  const source = getSourceSheet_(sourceSS);
  const target = targetSS.getSheetByName(CONFIG.DOCUMENTS);

  const sourceLastRow = source.getLastRow();
  const targetLastRow = target ? target.getLastRow() : 0;
  const sourceValues = sourceLastRow > 1
    ? source.getRange(1,1,sourceLastRow,Math.max(2,source.getLastColumn())).getValues()
    : [];
  const targetValues = targetLastRow > 1
    ? target.getRange(2,1,targetLastRow-1,20).getValues()
    : [];
  const sourceLastId = sourceValues.length ? getControlRefId_(sourceValues[0], sourceValues[sourceValues.length-1]) : '';
  const targetLastId = targetValues.length ? String(targetValues[targetValues.length-1][0] || '') : '';

  const msg = [
    'SYNC CONNECTION TEST',
    '',
    'Source spreadsheet: OK',
    'Source sheet: ' + source.getName(),
    'Source last row: ' + sourceLastRow,
    'Source latest Control Ref ID: ' + sourceLastId,
    '',
    'Target spreadsheet: OK',
    'Target DOCUMENTS last row: ' + targetLastRow,
    'Target last Control Ref ID: ' + targetLastId,
    '',
    'If Source last row / ID is newer than Target, run Sync Existing Memo Logbook.'
  ].join('\n');

  const log = targetSS.getSheetByName(CONFIG.SYNC_LOG);
  if (log) log.appendRow([new Date(), 'CONNECTION TEST', sourceLastRow, targetLastRow]);
  SpreadsheetApp.getUi().alert(msg);
  return {result:'success', sourceSheet:source.getName(), sourceLastRow, sourceLastId, targetLastRow, targetLastId};
}

function syncDocuments_(showAlert) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    if (showAlert) SpreadsheetApp.getUi().alert("Another sync is already running. Please wait.");
    return {result:"error", message:"Another sync is already running."};
  }

  try {
    const targetSS = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);
    const sourceSS = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
    const source = getSourceSheet_(sourceSS);
    const target = targetSS.getSheetByName(CONFIG.DOCUMENTS);

    if (!source) throw new Error("Source sheet was not found.");
    if (!target) throw new Error("Run setupDatabase() first.");

    const sourceLastRow = source.getLastRow();
    const sourceLastCol = Math.max(source.getLastColumn(), 13);
    if (sourceLastRow < 2) {
      const result = {result:"success", message:"No memo records found.", recordsFound:0, added:0, updated:0};
      if (showAlert) SpreadsheetApp.getUi().alert(result.message);
      return result;
    }

    const sourceData = source.getRange(1, 1, sourceLastRow, sourceLastCol).getValues();
    const targetLastRow = target.getLastRow();
    const targetRows = targetLastRow > 1
      ? target.getRange(2, 1, targetLastRow - 1, 20).getValues()
      : [];

    const targetById = Object.create(null);
    const targetBySourceRow = Object.create(null);
    targetRows.forEach((row, i) => {
      const targetRowNumber = i + 2;
      const id = String(row[0] || "").trim();
      const sourceRow = Number(row[1]);
      if (id && targetById[id] == null) targetById[id] = targetRowNumber;
      if (sourceRow > 1 && targetBySourceRow[sourceRow] == null) targetBySourceRow[sourceRow] = targetRowNumber;
    });

    const updates = [];
    const newRows = [];
    const newIds = [];
    const now = new Date();
    let recordsFound = 0;

    for (let r = 1; r < sourceData.length; r++) {
      const sourceRowNumber = r + 1;
      const sourceRow = sourceData[r];
      const id = getControlRefId_(sourceData[0], sourceRow);
      if (!id) continue;
      recordsFound++;

      const sourcePart = [
        id,
        sourceRowNumber,
        sourceRow[2], sourceRow[3], sourceRow[4], sourceRow[5], sourceRow[6],
        sourceRow[7], sourceRow[8], sourceRow[9], sourceRow[10], sourceRow[11], sourceRow[12]
      ];

      let targetRowNumber = targetById[id] || null;
      if (!targetRowNumber) targetRowNumber = targetBySourceRow[sourceRowNumber] || null;

      if (targetRowNumber) {
        const old = targetRows[targetRowNumber - 2];
        let changed = false;
        for (let c = 0; c < 13; c++) {
          const a = old[c] instanceof Date ? old[c].getTime() : old[c];
          const b = sourcePart[c] instanceof Date ? sourcePart[c].getTime() : sourcePart[c];
          if (String(a ?? "") !== String(b ?? "")) {
            changed = true;
            break;
          }
        }
        if (changed) updates.push({row: targetRowNumber, values: sourcePart});
      } else {
        newRows.push([
          ...sourcePart,
          "Message Center",
          sourceRow[4] || "",
          "At Message Center",
          "",
          "",
          "",
          now
        ]);
        newIds.push(id);
      }
    }

    // Update existing source fields in contiguous groups. Routing columns N:T
    // are never overwritten by synchronization.
    updates.sort((a,b) => a.row - b.row);
    let updated = 0;
    let i = 0;
    while (i < updates.length) {
      let j = i + 1;
      while (j < updates.length && updates[j].row === updates[j - 1].row + 1) j++;
      const group = updates.slice(i, j);
      target.getRange(group[0].row, 1, group.length, 13).setValues(group.map(x => x.values));
      updated += group.length;
      i = j;
    }

    // Append new records in small chunks. A QR formula failure must never
    // prevent the memo itself from being imported.
    let added = 0;
    const CHUNK = 25;
    for (let start = 0; start < newRows.length; start += CHUNK) {
      const chunk = newRows.slice(start, start + CHUNK);
      const chunkIds = newIds.slice(start, start + CHUNK);
      const firstNewRow = target.getLastRow() + 1;

      target.getRange(firstNewRow, 1, chunk.length, 20).setValues(chunk);
      SpreadsheetApp.flush();
      added += chunk.length;

      try {
        target.getRange(firstNewRow, 19, chunk.length, 1)
          .setFormulas(chunkIds.map(id => [qrFormula_(id)]));
      } catch (qrErr) {
        console.warn("QR formula generation skipped: " + qrErr);
      }
    }

    const log = targetSS.getSheetByName(CONFIG.SYNC_LOG);
    if (log) log.appendRow([now, "SYNC", added, updated]);

    const result = {
      result:"success",
      message:`Sync completed. ${added} new record(s), ${updated} updated record(s).`,
      recordsFound,
      added,
      updated,
      sourceLastRow,
      targetLastRow: target.getLastRow()
    };
    if (showAlert) SpreadsheetApp.getUi().alert(result.message);
    return result;
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    const message = err && err.message ? err.message : String(err);
    if (showAlert) SpreadsheetApp.getUi().alert("Sync failed: " + message);
    return {result:"error", message};
  } finally {
    lock.releaseLock();
  }
}

function qrFormula_(id) {
  const target = CONFIG.APP_URL + "?id=" + encodeURIComponent(id);
  const qr = "https://quickchart.io/qr?text=" + encodeURIComponent(target) + "&size=180";
  return '=IMAGE("' + qr + '")';
}

function generateQRCodes() {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.DOCUMENTS);
  if (!sheet) throw new Error("Run setupDatabase() first.");

  const n = sheet.getLastRow() - 1;
  if (n <= 0) return;

  const ids = sheet.getRange(2,1,n,1).getValues();
  const formulas = ids.map(r => [r[0] ? qrFormula_(String(r[0])) : ""]);
  sheet.getRange(2,19,n,1).setFormulas(formulas);

  SpreadsheetApp.getUi().alert("QR codes updated.");
}

/**************** WEBSITE DATA ****************/

function getDocument_(id) {
  id = String(id || "").trim();
  if (!id) return {result:"error", message:"Control Ref ID is required."};

  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.DOCUMENTS);
  if (!sheet || sheet.getLastRow() < 2) {
    return {result:"error", message:"No documents are available."};
  }

  const values = sheet.getRange(2,1,sheet.getLastRow()-1,20).getValues();
  const found = values.find(r => String(r[0] || "").trim() === id);

  if (!found) return {result:"error", message:"Document not found: " + id};

  return {
    result:"success",
    document:{
      controlRefId:found[0],
      sourceRow:found[1],
      dateLogged:found[2],
      time:found[3],
      receivedBy:found[4],
      originatingOffice:found[5],
      subject:found[6],
      actionRequired:found[7],
      remarksStatus:found[8],
      transmittedOffice:found[9],
      dateReceived:found[10],
      locationStatus:found[11],
      driveLink:found[12],
      currentSection:found[13],
      currentPersonnel:found[14],
      routingStatus:found[15],
      forwardedDateTime:found[16],
      sectionReceivedDateTime:found[17],
      lastUpdated:found[19],
      history:getMovementHistory_(id)
    }
  };
}

function getDocuments_(limit) {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.DOCUMENTS);
  if (!sheet || sheet.getLastRow() < 2) {
    return {result:"success", documents:[]};
  }

  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const values = sheet.getRange(2,1,sheet.getLastRow()-1,20).getValues();

  const documents = values
    .filter(r => String(r[0] || "").trim())
    .map(r => ({
      controlRefId:r[0],
      sourceRow:r[1],
      dateLogged:r[2],
      time:r[3],
      receivedBy:r[4],
      originatingOffice:r[5],
      subject:r[6],
      actionRequired:r[7],
      remarksStatus:r[8],
      transmittedOffice:r[9],
      dateReceived:r[10],
      locationStatus:r[11],
      driveLink:r[12],
      currentSection:r[13],
      currentPersonnel:r[14],
      routingStatus:r[15],
      forwardedDateTime:r[16],
      sectionReceivedDateTime:r[17],
      lastUpdated:r[19]
    }))
    .sort((a,b) => {
      const ar = Number(a.sourceRow) || 0;
      const br = Number(b.sourceRow) || 0;
      return br - ar;
    })
    .slice(0, max);

  return {result:"success", documents:documents};
}

function getMetrics_() {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.DOCUMENTS);
  if (!sheet || sheet.getLastRow() < 2) {
    return {total:0,messageCenter:0,forwarded:0,completed:0};
  }

  const rows = sheet.getRange(2,14,sheet.getLastRow()-1,3).getValues();
  let messageCenter=0, forwarded=0, completed=0;

  rows.forEach(r => {
    const status = String(r[2] || "");
    if (status === "At Message Center") messageCenter++;
    if (status === "Forwarded") forwarded++;
    if (status === "Completed") completed++;
  });

  return {
    total: rows.length,
    messageCenter,
    forwarded,
    completed
  };
}

/**************** ROUTING ****************/

function routeDocument_(id,movement,section,personnel,remarks) {
  id = String(id || "").trim();
  movement = String(movement || "").trim().toUpperCase();

  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.DOCUMENTS);
  if (!sheet || sheet.getLastRow() < 2) return {result:"error",message:"No documents available."};

  const values = sheet.getRange(2,1,sheet.getLastRow()-1,20).getValues();
  const index = values.findIndex(r => String(r[0] || "").trim() === id);

  if (index < 0) return {result:"error",message:"Document not found."};

  const rowNumber = index + 2;
  const row = values[index];
  const oldSection = String(row[13] || "");

  if (movement !== "COMPLETE") {
    const valid = PERSONNEL.some(p => p[0] === personnel && p[1] === section && p[2] === "YES");
    if (!valid) return {result:"error",message:"Personnel is not assigned to the selected section."};
  }

  const now = new Date();

  if (movement === "FORWARD") {
    sheet.getRange(rowNumber,14,1,4).setValues([[
      section, personnel, "Forwarded", now
    ]]);
    sheet.getRange(rowNumber,20).setValue(now);

  } else if (movement === "RECEIVE") {
    sheet.getRange(rowNumber,14,1,5).setValues([[
      section, personnel, "Received by Section", row[16] || "", now
    ]]);
    sheet.getRange(rowNumber,20).setValue(now);

  } else if (movement === "COMPLETE") {
    sheet.getRange(rowNumber,16).setValue("Completed");
    sheet.getRange(rowNumber,20).setValue(now);

  } else {
    return {result:"error",message:"Invalid movement."};
  }

  addMovement_(id,now,movement,oldSection,section,personnel,remarks || "");

  return {result:"success",message:"Document movement recorded."};
}

function addMovement_(id,dateTime,action,fromSection,toSection,personnel,remarks) {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.MOVEMENT);
  if (!sheet) return;

  sheet.appendRow([
    id,dateTime,action,fromSection,toSection,personnel,
    remarks || "",
    Session.getActiveUser().getEmail() || ""
  ]);
}

function getMovementHistory_(id) {
  const sheet = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID).getSheetByName(CONFIG.MOVEMENT);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues();

  return values
    .filter(r => String(r[0] || "") === String(id))
    .reverse()
    .map(r => ({
      controlRefId:r[0],
      dateTime:r[1],
      action:r[2],
      fromSection:r[3],
      toSection:r[4],
      personnel:r[5],
      remarks:r[6]
    }));
}

/**************** DASHBOARD / TRIGGER ****************/

function buildDashboard_() {
  const sheet = getOrCreateSheet_("DASHBOARD");
  sheet.clear();

  sheet.getRange("A1").setValue("PRO4A RCD DOCUMENT ROUTING DASHBOARD");
  sheet.getRange("A1").setFontWeight("bold").setFontSize(16);

  sheet.getRange("A3:B9").setValues([
    ["Metric","Count"],
    ["Total Documents",""],
    ["At Message Center",""],
    ["Forwarded",""],
    ["Received by Section",""],
    ["Completed",""],
    ["Pending",""]
  ]);

  sheet.getRange("B4").setFormula("=COUNTA(DOCUMENTS!A2:A)");
  sheet.getRange("B5").setFormula('=COUNTIF(DOCUMENTS!P2:P,"At Message Center")');
  sheet.getRange("B6").setFormula('=COUNTIF(DOCUMENTS!P2:P,"Forwarded")');
  sheet.getRange("B7").setFormula('=COUNTIF(DOCUMENTS!P2:P,"Received by Section")');
  sheet.getRange("B8").setFormula('=COUNTIF(DOCUMENTS!P2:P,"Completed")');
  sheet.getRange("B9").setFormula("=B5+B6");

  sheet.getRange("A3:B3").setFontWeight("bold");
}

function installAutomaticSync() {
  const handler = "syncDocumentsAutomatic_";

  // Remove only the triggers owned by this synchronization feature.
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Near-real-time sync when a user edits the source Memo Logbook.
  // The trigger is attached to the SOURCE spreadsheet, while the script
  // remains owned by the ROUTING DATABASE project.
  ScriptApp.newTrigger(handler)
    .forSpreadsheet(CONFIG.SOURCE_SPREADSHEET_ID)
    .onEdit()
    .create();

  // Safety net for imports, formulas, pasted data, and other changes that
  // do not fire the source onEdit trigger.
  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(5)
    .create();

  SpreadsheetApp.getUi().alert(
    "Automatic sync installed.\n\n" +
    "• Source edits trigger synchronization.\n" +
    "• A 5-minute backup sync also runs automatically."
  );
}

function syncDocumentsAutomatic_() {
  try {
    syncDocuments_(false);
  } catch (err) {
    const targetSS = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);
    const log = targetSS.getSheetByName(CONFIG.SYNC_LOG);
    if (log) log.appendRow([new Date(), 'SYNC ERROR', String(err), '']);
    throw err;
  }
}

/**************** HELPERS ****************/

function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.openById(CONFIG.TARGET_SPREADSHEET_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
