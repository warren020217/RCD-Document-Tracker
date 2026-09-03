/**
 * PRO4A RCD Document Tracker - Supabase Backend API
 * Connects directly to Supabase REST API (PostgREST)
 * Replaces the slow Google Sheets Apps Script proxy.
 */

const SUPABASE_URL = (
  process.env.SUPABASE_URL || "https://insgdxhigsimnaauyhws.supabase.co"
).replace(/\/+$/, "");

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_otleV27L1eC_lZljuYyUcQ_iHwm8WIT";

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

const PERSONNEL = [
  ["PCOL Verna C Cabuhat", "RCD / Office of the Chief", "YES"],
  ["PMAJ Kelvin Kim S Zita", "Management Section", "YES"],
  ["PMAJ Fernando C Punzalan Jr", "PBAS Section", "YES"],
  ["PEMS Maricel A Landicho", "PBAS Section", "YES"],
  ["PCpl Jovin R Recto", "PBAS Section", "YES"],
  ["PMAJ Genesis R Roque", "Budget & Fiscal Section", "YES"],
  ["PCMS Hannah F Novio", "Budget & Fiscal Section", "YES"],
  ["PMSg Derek F Regulacion", "Budget & Fiscal Section", "YES"],
  ["PMAJ Joseph M Dacullo", "Action Section", "YES"],
  ["PCpl Jamielyn V Laguras", "Action Section", "YES"],
  ["NUP Emelita B Paral", "Action Section", "YES"],
  ["NUP Richard R Munangson", "Action Section", "YES"],
  ["NUP Jessie Jim D Sampaga", "Action Section", "YES"],
  ["PEMS Eric A Hurtado", "Admin Section", "YES"],
  ["PMSg Karen C Mayong", "Admin Section", "YES"],
  ["PCpl Mariella R Garcia", "Admin Section", "YES"],
  ["PMSg Mark Anthony R Gayadan", "Management Section", "YES"],
  ["PCpl John Warren B Delos Reyes", "Management Section", "YES"],
  ["NUP Carmelita R Jaca", "Management Section", "YES"],
  ["NUP Ericka Joannah S Peña", "Management Section", "YES"],
  ["PMSg Laiza C Cruzim", "NFA Section", "YES"],
  ["NUP John Wencel M Caldit", "Accounting Section", "YES"],
  ["NUP Liezel A David", "Accounting Section", "YES"],
  ["NUP Annabelle A De Vera", "Accounting Section", "YES"],
  ["NUP Jonah Joy B Fraginal", "Accounting Section", "YES"],
  ["NUP Enery Ann L Oliva", "Accounting Section", "YES"],
  ["NUP Joan M Santos", "Accounting Section", "YES"],
  ["PCpl John Francis V Carradeo", "Message Center", "YES"],
  ["Pat Charmaine C Bornidor", "Message Center", "YES"],
  ["Pat Darwin T Solis", "Message Center", "YES"]
];

async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint.replace(/^\/+/, "")}`;
  const headers = Object.assign(
    {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation"
    },
    options.headers || {}
  );

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!res.ok) {
    const errorMsg =
      (data && (data.message || data.error || data.details || data.hint)) ||
      `Supabase HTTP ${res.status}: ${text.slice(0, 200)}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function mapMemoToDoc(m, index = 0) {
  const controlRefId = m.memo_no || m.legacy_id || m.id;
  const rawStatus = String(m.workflow_status || "").toUpperCase();

  let routingStatus = "At Message Center";
  if (["COMPLETED", "APPROVED", "TRANSMITTED"].includes(rawStatus)) {
    routingStatus = "Completed";
  } else if (["ASSIGNED", "IN_PROCESS"].includes(rawStatus)) {
    routingStatus = "Forwarded";
  } else if (rawStatus === "ACKNOWLEDGED") {
    routingStatus = "Received by Section";
  } else if (
    m.assigned_section &&
    m.assigned_section !== "RCD" &&
    m.assigned_section !== "Message Center"
  ) {
    routingStatus = "Forwarded";
  }

  return {
    controlRefId,
    sourceRow: index + 1,
    dateLogged: m.date_logged || "",
    time: m.time_logged || "",
    receivedBy: m.received_by || "",
    originatingOffice: m.originating_office || "",
    subject: m.subject || "",
    actionRequired: m.action_required || "",
    remarksStatus: m.remarks_status || "",
    transmittedOffice: m.transmitted_office || "",
    dateReceived: m.date_received || "",
    locationStatus: routingStatus,
    driveLink: m.drive_link || "",
    currentSection: m.assigned_section || "Message Center",
    currentPersonnel: m.action_officer || m.received_by || "",
    routingStatus,
    forwardedDateTime: m.date_assigned || m.created_at || "",
    sectionReceivedDateTime: m.date_acknowledged || "",
    lastUpdated: m.updated_at || m.created_at || "",
    memoType: m.memo_type || "INCOMING",
    priority: m.priority || "NORMAL",
    pages: m.pages || 1,
    fileName: m.file_name || ""
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    let body = {};
    if (req.body) {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    }
    const params = Object.assign({}, req.query || {}, body);
    const action = String(params.action || "").trim();

    // 1. DASHBOARD METRICS
    if (action === "dashboard") {
      try {
        const rows = await supabaseFetch(
          "memos?select=id,workflow_status,assigned_section&is_deleted=eq.false"
        );
        const list = Array.isArray(rows) ? rows : [];
        let total = list.length;
        let messageCenter = 0;
        let forwarded = 0;
        let completed = 0;

        list.forEach(r => {
          const st = String(r.workflow_status || "").toUpperCase();
          if (["COMPLETED", "APPROVED", "TRANSMITTED"].includes(st)) {
            completed++;
          } else if (["ASSIGNED", "IN_PROCESS", "ACKNOWLEDGED"].includes(st)) {
            forwarded++;
          } else if (
            r.assigned_section &&
            r.assigned_section !== "RCD" &&
            r.assigned_section !== "Message Center"
          ) {
            forwarded++;
          } else {
            messageCenter++;
          }
        });

        return res.status(200).json({
          result: "success",
          metrics: {
            total,
            messageCenter,
            forwarded,
            completed
          }
        });
      } catch (dbErr) {
        return res.status(200).json({
          result: "error",
          error: `Dashboard query failed: ${dbErr.message}`
        });
      }
    }

    // 2. GET ALL / LATEST MEMOS (INCOMING & OUTGOING)
    if (action === "getDocuments") {
      const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 5000);
      const offset = Math.max(Number(params.offset) || 0, 0);

      try {
        const endpoint = `memos?select=*&is_deleted=eq.false&order=date_logged.desc.nullslast,time_logged.desc.nullslast,created_at.desc.nullslast&limit=${limit}&offset=${offset}`;
        const memos = await supabaseFetch(endpoint);
        const docs = (Array.isArray(memos) ? memos : []).map((m, idx) =>
          mapMemoToDoc(m, offset + idx)
        );

        return res.status(200).json({
          result: "success",
          documents: docs,
          count: docs.length
        });
      } catch (dbErr) {
        return res.status(200).json({
          result: "error",
          error: `Failed to load memos: ${dbErr.message}`,
          documents: []
        });
      }
    }

    // 3. GET SINGLE DOCUMENT & MOVEMENT HISTORY
    if (action === "getDocument") {
      const rawId = String(params.id || "").trim();
      if (!rawId) {
        return res.status(400).json({
          result: "error",
          message: "Control Ref ID is required."
        });
      }

      try {
        const enc = encodeURIComponent(rawId);
        // Look up by exact memo_no, legacy_id, or UUID id
        let rows = await supabaseFetch(
          `memos?or=(memo_no.eq.${enc},legacy_id.eq.${enc},id.eq.${enc})&limit=1`
        );

        // Fallback: Case-insensitive search
        if (!rows || !rows.length) {
          rows = await supabaseFetch(
            `memos?or=(memo_no.ilike.${enc},legacy_id.ilike.${enc})&limit=1`
          );
        }

        if (!rows || !rows.length) {
          return res.status(200).json({
            result: "error",
            message: `Document not found: ${rawId}`
          });
        }

        const memo = rows[0];
        const doc = mapMemoToDoc(memo);

        // Fetch routing movement history
        let history = [];
        try {
          const moveRows = await supabaseFetch(
            `document_movements?or=(control_ref_id.eq.${enc},memo_id.eq.${memo.id})&order=date_time.desc&limit=50`
          );
          if (Array.isArray(moveRows)) {
            history = moveRows.map(m => ({
              controlRefId: m.control_ref_id,
              dateTime: m.date_time,
              action: m.action,
              fromSection: m.from_section,
              toSection: m.to_section,
              personnel: m.personnel,
              remarks: m.remarks
            }));
          }
        } catch (_) {
          // document_movements table might not be created yet, fallback gracefully
        }

        // If no movements logged yet, create an initial entry for routing slip display
        if (!history.length) {
          history.push({
            controlRefId: doc.controlRefId,
            dateTime: doc.dateLogged ? `${doc.dateLogged} ${doc.time || ""}`.trim() : doc.lastUpdated,
            action: "INITIAL",
            fromSection: doc.originatingOffice || "External Office",
            toSection: doc.currentSection || "Message Center",
            personnel: doc.receivedBy || "Duty PNCO",
            remarks: doc.remarksStatus || "Document Logged"
          });
        }

        doc.history = history;

        return res.status(200).json({
          result: "success",
          document: doc
        });
      } catch (dbErr) {
        return res.status(200).json({
          result: "error",
          message: `Error loading document: ${dbErr.message}`
        });
      }
    }

    // 4. ROUTE DOCUMENT (FORWARD, RECEIVE, COMPLETE)
    if (action === "routeDocument") {
      const rawId = String(params.id || "").trim();
      const movement = String(params.movement || "").trim().toUpperCase();
      const section = String(params.section || "").trim();
      const personnel = String(params.personnel || "").trim();
      const remarks = String(params.remarks || "").trim();

      if (!rawId) {
        return res.status(400).json({
          result: "error",
          message: "Control Ref ID is required."
        });
      }

      if (movement !== "COMPLETE" && (!section || !personnel)) {
        return res.status(400).json({
          result: "error",
          message: "Destination section and personnel are required."
        });
      }

      try {
        const enc = encodeURIComponent(rawId);
        let rows = await supabaseFetch(
          `memos?or=(memo_no.eq.${enc},legacy_id.eq.${enc},id.eq.${enc})&limit=1`
        );
        if (!rows || !rows.length) {
          rows = await supabaseFetch(
            `memos?or=(memo_no.ilike.${enc},legacy_id.ilike.${enc})&limit=1`
          );
        }

        if (!rows || !rows.length) {
          return res.status(404).json({
            result: "error",
            message: `Document not found: ${rawId}`
          });
        }

        const memo = rows[0];
        const oldSection = memo.assigned_section || "Message Center";
        const today = new Date().toISOString().split("T")[0];
        const nowIso = new Date().toISOString();

        // Determine workflow_status constraint-compliant values
        let workflowStatus = memo.workflow_status;
        const updatePayload = {
          updated_at: nowIso
        };

        if (movement === "FORWARD") {
          workflowStatus = "ASSIGNED";
          updatePayload.workflow_status = "ASSIGNED";
          updatePayload.assigned_section = section;
          updatePayload.action_officer = personnel;
          updatePayload.date_assigned = today;
        } else if (movement === "RECEIVE") {
          workflowStatus = "ACKNOWLEDGED";
          updatePayload.workflow_status = "ACKNOWLEDGED";
          updatePayload.assigned_section = section;
          updatePayload.action_officer = personnel;
          updatePayload.date_acknowledged = today;
        } else if (movement === "COMPLETE") {
          workflowStatus = "COMPLETED";
          updatePayload.workflow_status = "COMPLETED";
          updatePayload.date_completed = today;
        } else {
          return res.status(400).json({
            result: "error",
            message: "Invalid movement action."
          });
        }

        // Update memo row in Supabase
        await supabaseFetch(`memos?id=eq.${memo.id}`, {
          method: "PATCH",
          body: updatePayload
        });

        // Insert routing movement history log
        try {
          await supabaseFetch("document_movements", {
            method: "POST",
            body: {
              memo_id: memo.id,
              control_ref_id: memo.memo_no || memo.legacy_id || rawId,
              action: movement,
              from_section: oldSection,
              to_section: section || oldSection,
              personnel: personnel || memo.action_officer || "",
              remarks: remarks || "",
              date_time: nowIso
            }
          });
        } catch (logErr) {
          console.warn("Movement log insert skipped:", logErr.message);
        }

        return res.status(200).json({
          result: "success",
          message: "Document movement recorded successfully."
        });
      } catch (dbErr) {
        return res.status(500).json({
          result: "error",
          message: `Movement failed: ${dbErr.message}`
        });
      }
    }

    // 5. SECTIONS LIST
    if (action === "getSections") {
      return res.status(200).json({
        result: "success",
        sections: SECTIONS
      });
    }

    // 6. PERSONNEL LIST
    if (action === "getPersonnel") {
      const section = String(params.section || "").trim();
      const list = PERSONNEL.filter(
        x => x[1] === section && x[2] === "YES"
      ).map(x => x[0]);

      return res.status(200).json({
        result: "success",
        personnel: list
      });
    }

    // 7. SYNC STATUS
    if (action === "sync") {
      return res.status(200).json({
        result: "success",
        message: "Supabase real-time database connected."
      });
    }

    // Default info
    return res.status(200).json({
      result: "success",
      message: "PRO4A RCD Routing API (Supabase Backend) is online.",
      database: "Supabase",
      actions: [
        "dashboard",
        "getDocument",
        "getDocuments",
        "getSections",
        "getPersonnel",
        "routeDocument",
        "sync"
      ]
    });
  } catch (err) {
    return res.status(500).json({
      result: "error",
      error: "API internal error: " + (err && err.message ? err.message : err)
    });
  }
};
