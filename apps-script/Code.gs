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
      syncDocuments_(false);
      return json_({result:"success", message:"Synchronization completed."}, callback);
    }

    return json_({
      result:"success",
      message:"PRO4A RCD Routing API is online.",
      actions:["dashboard","getDocument","getSections","getPersonnel","routeDocument","sync"]
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
    ["Routing Database Spreadsheet ID",ss.getId()],
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

function syncDocuments_(showAlert) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    if (showAlert) SpreadsheetApp.getUi().alert("Another sync is already running. Please wait.");
    return;
  }

  try {
    const sourceSS = SpreadsheetApp.openById(CONFIG.SOURCE_SPREADSHEET_ID);
    const source = sourceSS.getSheetByName(CONFIG.SOURCE_SHEET_NAME) || sourceSS.getSheets()[0];
    const sourceData = source.getDataRange().getValues();

    if (sourceData.length < 2) {
      if (showAlert) SpreadsheetApp.getUi().alert("No memo records found.");
      return;
    }

    const target = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DOCUMENTS);
    if (!target) throw new Error("Run setupDatabase() first.");

    const lastTargetRow = target.getLastRow();
    const oldData = lastTargetRow > 1
      ? target.getRange(2,1,lastTargetRow-1,20).getValues()
      : [];

    const oldById = {};
    oldData.forEach((r,i) => {
      const id = String(r[0] || "").trim();
      if (id) oldById[id] = r;
    });

    const output = [];
    const qrFormulas = [];
    let added = 0;
    let updated = 0;

    for (let r = 1; r < sourceData.length; r++) {
      const row = sourceData[r];
      const id = String(row[1] || "").trim();
      if (!id) continue;

      const old = oldById[id];

      const currentSection = old ? (old[13] || "Message Center") : "Message Center";
      const currentPersonnel = old ? (old[14] || row[4] || "") : (row[4] || "");
      const routingStatus = old ? (old[15] || "At Message Center") : "At Message Center";
      const forwarded = old ? (old[16] || "") : "";
      const received = old ? (old[17] || "") : "";
      const lastUpdated = old ? (old[19] || new Date()) : new Date();

      output.push([
        id, r+1, row[2], row[3], row[4], row[5], row[6], row[7],
        row[8], row[9], row[10], row[11], row[12],
        currentSection, currentPersonnel, routingStatus,
        forwarded, received, "", lastUpdated
      ]);

      qrFormulas.push([qrFormula_(id)]);

      if (old) updated++;
      else added++;
    }

    /*
     * One bulk write instead of hundreds of setValue calls.
     */
    if (output.length) {
      target.getRange(2,1,output.length,20).setValues(output);
      target.getRange(2,19,qrFormulas.length,1).setFormulas(qrFormulas);
    }

    /*
     * Remove old rows if the source has fewer records than before.
     */
    const neededLastRow = output.length + 1;
    if (target.getLastRow() > neededLastRow) {
      target.deleteRows(neededLastRow + 1, target.getLastRow() - neededLastRow);
    }

    const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SYNC_LOG);
    if (log) log.appendRow([new Date(),"SYNC",added,updated]);

    buildDashboard_();

    if (showAlert) {
      SpreadsheetApp.getUi().alert(
        "Synchronization completed.\n\n" +
        "Records found: " + output.length +
        "\nNew records: " + added +
        "\nUpdated records: " + updated
      );
    }

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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DOCUMENTS);
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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DOCUMENTS);
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

function getMetrics_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DOCUMENTS);
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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.DOCUMENTS);
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MOVEMENT);
  if (!sheet) return;

  sheet.appendRow([
    id,dateTime,action,fromSection,toSection,personnel,
    remarks || "",
    Session.getActiveUser().getEmail() || ""
  ]);
}

function getMovementHistory_(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MOVEMENT);
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
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncDocumentsAutomatic_") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("syncDocumentsAutomatic_")
    .timeBased()
    .everyMinutes(15)
    .create();

  SpreadsheetApp.getUi().alert("Automatic sync installed.");
}

function syncDocumentsAutomatic_() {
  syncDocuments_(false);
}

/**************** HELPERS ****************/

function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
