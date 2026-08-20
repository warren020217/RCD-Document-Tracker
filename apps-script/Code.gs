/**
 * PRO4A RCD Document Routing System
 * Backend for the separate responsive mobile/desktop website.
 *
 * IMPORTANT:
 * - Existing A:M memo fields are preserved.
 * - New routing fields are N:T.
 * - This script is designed to be installed in the SAME spreadsheet
 *   currently used by the RCD Memo Logbook.
 */

const CONFIG = {
  MAIN_SHEET_NAME: "Memo Logbook",
  MOVEMENT_SHEET: "MOVEMENT LOG",
  PERSONNEL_SHEET: "PERSONNEL",
  SECTIONS_SHEET: "SECTIONS",
  QR_BASE_URL: "", // Set to deployed web app URL after deployment.
  DRIVE_FOLDER_ID: "1uUxq2TwM0UWKL06fIAAVMCJNjbGMg-sh"
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

function doGet(e) {
  return handleRequest_(e);
}
function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || "";

    if (action === "getDocument") {
      return json_(getDocument_(p.id));
    }
    if (action === "getSections") {
      return json_({ result:"success", sections:SECTIONS });
    }
    if (action === "getPersonnel") {
      return json_({ result:"success", personnel:getPersonnel_(p.section) });
    }
    if (action === "routeDocument") {
      return json_(routeDocument_(
        p.id, p.movement, p.section, p.personnel, p.remarks
      ));
    }
    if (action === "dashboard") {
      return json_({ result:"success", metrics:getDashboard_() });
    }

    // Existing API compatibility
    if (p.fileData && p.filename) {
      return uploadFile_(p.fileData, p.filename, p.mimeType);
    }
    if (action === "appendMemo" && p.memo) {
      return appendMemo_(JSON.parse(p.memo));
    }
    if (action === "deleteMemo" || action === "deleteMemos") {
      return deleteMemos_(p);
    }

    return json_({ result:"ignored", message:"No matching action handler" });
  } catch (err) {
    return json_({ result:"error", error:String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getMainSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.MAIN_SHEET_NAME) || ss.getSheets()[0];
}

function appendMemo_(m) {
  const sheet = getMainSheet_();
  const row = sheet.getLastRow() + 1;
  const now = new Date();

  sheet.getRange(row,1,1,20).setValues([[
    row - 1,
    m.id || "",
    m.dateLogged || "",
    m.time || "",
    m.receivedBy || "",
    m.originatingOffice || "",
    m.subject || "",
    m.actionRequired || "",
    m.remarksStatus || "",
    m.transmittedOffice || "",
    m.dateReceived || "",
    "Inside RCD",
    m.driveLink || "",
    "Message Center",
    m.receivedBy || "",
    "At Message Center",
    "",
    "",
    "",
    now
  ]]);

  setQrFormula_(sheet, row, m.id || "");

  addMovement_(
    m.id || "",
    now,
    "RECEIVED",
    "",
    "Message Center",
    m.receivedBy || "",
    "Initial document receipt"
  );

  return json_({ result:"success", rowAdded:row });
}

function setQrFormula_(sheet, row, id) {
  if (!id) return;
  const base = CONFIG.QR_BASE_URL || ScriptApp.getService().getUrl() || "";
  const target = base ? base + "?id=" + encodeURIComponent(id) : id;
  const qr = "https://quickchart.io/qr?text=" + encodeURIComponent(target) + "&size=180";
  sheet.getRange(row,19).setFormula('=IMAGE("' + qr + '")');
}

function getDocument_(id) {
  id = String(id || "").trim();
  if (!id) return { result:"error", message:"Control Ref ID is required." };

  const sheet = getMainSheet_();
  const values = sheet.getDataRange().getValues();
  for (let r=1;r<values.length;r++) {
    if (String(values[r][1] || "").trim() === id) {
      const v = values[r];
      return {
        result:"success",
        document:{
          controlRefId:v[1],
          dateLogged:v[2],
          time:v[3],
          receivedBy:v[4],
          originatingOffice:v[5],
          subject:v[6],
          actionRequired:v[7],
          remarksStatus:v[8],
          transmittedOffice:v[9],
          dateReceived:v[10],
          locationStatus:v[11],
          driveLink:v[12],
          currentSection:v[13],
          currentPersonnel:v[14],
          routingStatus:v[15],
          forwardedDateTime:v[16],
          sectionReceivedDateTime:v[17],
          lastUpdated:v[19],
          history:getMovementHistory_(id)
        }
      };
    }
  }
  return { result:"error", message:"Document not found." };
}

function getPersonnel_(section) {
  return PERSONNEL
    .filter(r => r[1] === section && r[2] === "YES")
    .map(r => r[0]);
}

function routeDocument_(id, movement, section, personnel, remarks) {
  const sheet = getMainSheet_();
  const values = sheet.getDataRange().getValues();
  let row = -1;

  for (let r=1;r<values.length;r++) {
    if (String(values[r][1] || "").trim() === String(id || "").trim()) {
      row = r + 1;
      break;
    }
  }

  if (row < 0) return { result:"error", message:"Document not found." };

  const valid = PERSONNEL.some(r => r[0] === personnel && r[1] === section && r[2] === "YES");
  if (movement !== "COMPLETE" && !valid) {
    return { result:"error", message:"Personnel is not assigned to the selected section." };
  }

  const oldSection = String(sheet.getRange(row,14).getValue() || "");
  const now = new Date();

  if (movement === "FORWARD") {
    sheet.getRange(row,14).setValue(section);
    sheet.getRange(row,15).setValue(personnel);
    sheet.getRange(row,16).setValue("Forwarded");
    sheet.getRange(row,17).setValue(now);
    sheet.getRange(row,20).setValue(now);
    addMovement_(id,now,"FORWARDED",oldSection,section,personnel,remarks);
  } else if (movement === "RECEIVE") {
    sheet.getRange(row,14).setValue(section);
    sheet.getRange(row,15).setValue(personnel);
    sheet.getRange(row,16).setValue("Received by Section");
    sheet.getRange(row,18).setValue(now);
    sheet.getRange(row,20).setValue(now);
    addMovement_(id,now,"RECEIVED",oldSection,section,personnel,remarks);
  } else if (movement === "COMPLETE") {
    sheet.getRange(row,16).setValue("Completed");
    sheet.getRange(row,20).setValue(now);
    addMovement_(id,now,"COMPLETED",oldSection,oldSection,personnel,remarks);
  } else {
    return { result:"error", message:"Invalid movement." };
  }

  return { result:"success", message:"Document movement recorded." };
}

function getMovementHistory_(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MOVEMENT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues()
    .filter(r => String(r[0]) === String(id))
    .map(r => ({
      controlRefId:r[0], dateTime:r[1], action:r[2],
      fromSection:r[3], toSection:r[4], personnel:r[5], remarks:r[6]
    }))
    .reverse();
}

function addMovement_(id, dateTime, action, fromSection, toSection, personnel, remarks) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MOVEMENT_SHEET);
  if (!sheet) return;
  sheet.appendRow([id,dateTime,action,fromSection,toSection,personnel,remarks || ""]);
}

function getDashboard_() {
  const sheet = getMainSheet_();
  const values = sheet.getDataRange().getValues();
  let total=0,messageCenter=0,forwarded=0,completed=0;
  for (let r=1;r<values.length;r++) {
    if (!values[r][1]) continue;
    total++;
    if (values[r][15] === "At Message Center") messageCenter++;
    if (values[r][15] === "Forwarded") forwarded++;
    if (values[r][15] === "Completed") completed++;
  }
  return { total, messageCenter, forwarded, completed };
}

function uploadFile_(fileData, filename, mimeType) {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const bytes = Utilities.base64Decode(fileData);
  const blob = Utilities.newBlob(bytes, mimeType || "application/pdf", filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return json_({
    result:"success",
    fileUrl:file.getUrl(),
    fileId:file.getId()
  });
}

function deleteMemos_(p) {
  const sheet = getMainSheet_();
  let ids = [];
  if (p.id) ids.push(String(p.id).trim().toUpperCase());
  if (p.ids) {
    try {
      const parsed = JSON.parse(p.ids);
      if (Array.isArray(parsed)) ids = ids.concat(parsed.map(String));
    } catch (_) {}
  }
  ids = ids.map(x => x.trim().toUpperCase()).filter(Boolean);
  if (!ids.length) return json_({result:"error",error:"No memo ID specified for deletion"});

  const values = sheet.getDataRange().getValues();
  let deleted=0;
  for (let r=values.length-1;r>=1;r--) {
    const cell = String(values[r][1] || "").trim().toUpperCase();
    const match = ids.some(target => cell === target || cell.indexOf(target+"-")===0 || target.indexOf(cell+"-")===0);
    if (match) {
      sheet.deleteRow(r+1);
      deleted++;
    }
  }
  return json_({result:"success",deletedCount:deleted});
}

function setupRCDSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const main = getMainSheet_();

  main.getRange(1,14,1,7).setValues([[
    "Current Section","Current Personnel","Routing Status",
    "Forwarded Date/Time","Section Received Date/Time",
    "QR Code","Last Updated"
  ]]);

  const movement = ss.getSheetByName(CONFIG.MOVEMENT_SHEET) || ss.insertSheet(CONFIG.MOVEMENT_SHEET);
  movement.clear();
  movement.getRange(1,1,1,7).setValues([[
    "Control Ref ID","Date/Time","Action","From Section","To Section","Personnel","Remarks"
  ]]);

  const personnel = ss.getSheetByName(CONFIG.PERSONNEL_SHEET) || ss.insertSheet(CONFIG.PERSONNEL_SHEET);
  personnel.clear();
  personnel.getRange(1,1,1,3).setValues([["Personnel","Section","Active"]]);
  personnel.getRange(2,1,PERSONNEL.length,3).setValues(PERSONNEL);

  const sections = ss.getSheetByName(CONFIG.SECTIONS_SHEET) || ss.insertSheet(CONFIG.SECTIONS_SHEET);
  sections.clear();
  sections.getRange(1,1).setValue("Section");
  sections.getRange(2,1,SECTIONS.length,1).setValues(SECTIONS.map(x => [x]));

  for (let c=1;c<=20;c++) main.autoResizeColumn(c);
  [movement,personnel,sections].forEach(s => s.setFrozenRows(1));

  // Initialize existing records without changing A:M.
  const lastRow = main.getLastRow();
  if (lastRow > 1) {
    for (let r=2;r<=lastRow;r++) {
      const id = String(main.getRange(r,2).getValue() || "").trim();
      if (!id) continue;
      if (!main.getRange(r,14).getValue()) main.getRange(r,14).setValue("Message Center");
      if (!main.getRange(r,15).getValue()) main.getRange(r,15).setValue(main.getRange(r,5).getValue());
      if (!main.getRange(r,16).getValue()) main.getRange(r,16).setValue("At Message Center");
      if (!main.getRange(r,19).getFormula()) setQrFormula_(main,r,id);
      if (!main.getRange(r,20).getValue()) main.getRange(r,20).setValue(new Date());
    }
  }
}

function testDriveAccess() {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  Logger.log(folder.getName());
}
