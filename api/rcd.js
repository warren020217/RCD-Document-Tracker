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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(str) {
  return UUID_REGEX.test(String(str || "").trim());
}

let metricsCache = null;
let metricsCacheTime = 0;
const METRICS_TTL = 30000; // 30s cache

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

/**
 * Robust multi-strategy memo finder.
 * Handles IDs with special characters: parentheses '(', ')', slashes, hyphens, and spaces.
 */
async function findMemoRecord(rawId) {
  const cleanId = String(rawId || "").trim();
  if (!cleanId) return null;
  const enc = encodeURIComponent(cleanId);

  // Strategy 1: Exact memo_no match
  try {
    const r1 = await supabaseFetch(`memos?memo_no=eq.${enc}&limit=1`);
    if (r1 && r1.length) return r1[0];
  } catch (_) {}

  // Strategy 2: Exact legacy_id match
  try {
    const r2 = await supabaseFetch(`memos?legacy_id=eq.${enc}&limit=1`);
    if (r2 && r2.length) return r2[0];
  } catch (_) {}

  // Strategy 3: UUID match if cleanId is a valid UUID
  if (isUuid(cleanId)) {
    try {
      const r3 = await supabaseFetch(`memos?id=eq.${enc}&limit=1`);
      if (r3 && r3.length) return r3[0];
    } catch (_) {}
  }

  // Strategy 4: Case-insensitive ilike on memo_no
  try {
    const r4 = await supabaseFetch(`memos?memo_no=ilike.${enc}&limit=1`);
    if (r4 && r4.length) return r4[0];
  } catch (_) {}

  // Strategy 5: Case-insensitive ilike on legacy_id
  try {
    const r5 = await supabaseFetch(`memos?legacy_id=ilike.${enc}&limit=1`);
    if (r5 && r5.length) return r5[0];
  } catch (_) {}

  return null;
}

/**
 * Calculates metrics exactly matching rcd-memo.vercel.app:
 * - total: Total memos logged
 * - pendingRcd: Inside RCD (Pending)
 * - transmitted: Transmitted / Released
 * - concurred: Concurred / Approved
 */
async function getDashboardMetrics() {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const rows = await supabaseFetch(
      `memos?select=id,memo_no,remarks_status,transmitted_office,is_deleted&is_deleted=eq.false&limit=${pageSize}&offset=${from}`
    );
    if (Array.isArray(rows)) {
      all.push(...rows);
    }
    if (!rows || rows.length < pageSize) break;
  }

  const total = all.length;
  const pendingRcd = all.filter(
    m => !(m.remarks_status === "Transmitted to" || (m.transmitted_office && m.transmitted_office.trim().length > 2))
  ).length;
  const transmitted = all.filter(
    m => m.remarks_status === "Transmitted to" || (m.transmitted_office && m.transmitted_office.trim().length > 2)
  ).length;
  const concurred = all.filter(
    m => (m.remarks_status || "").includes("Concur") || (m.remarks_status || "").includes("Approved") || (m.remarks_status || "").includes("Signed")
  ).length;

  return {
    total,
    messageCenter: pendingRcd, // Inside RCD (Pending)
    forwarded: transmitted,    // Transmitted / Released
    completed: concurred       // Concurred / Approved
  };
}

function mapMemoToDoc(m, index = 0) {
  const controlRefId = m.memo_no || m.legacy_id || m.id;
  const rawStatus = String(m.workflow_status || "").toUpperCase();

  let routingStatus = "Inside RCD (Pending)";
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

    // 1. DASHBOARD METRICS (Exactly matching rcd-memo.vercel.app counts)
    if (action === "dashboard") {
      res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=59");

      if (metricsCache && Date.now() - metricsCacheTime < METRICS_TTL) {
        return res.status(200).json({
          result: "success",
          metrics: metricsCache
        });
      }

      try {
        const metrics = await getDashboardMetrics();
        metricsCache = metrics;
        metricsCacheTime = Date.now();
        return res.status(200).json({
          result: "success",
          metrics
        });
      } catch (dbErr) {
        return res.status(200).json({
          result: "error",
          error: `Dashboard query failed: ${dbErr.message}`
        });
      }
    }

    // 2. GET LATEST MEMOS (INCOMING & OUTGOING, DEDUPLICATED STRICTLY)
    if (action === "getDocuments") {
      res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
      const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 5000);
      const offset = Math.max(Number(params.offset) || 0, 0);

      try {
        const fetchLimit = Math.min(limit * 2, 5000);
        const endpoint = `memos?select=*&is_deleted=eq.false&order=date_logged.desc.nullslast,time_logged.desc.nullslast,created_at.desc.nullslast&limit=${fetchLimit}&offset=${offset}`;
        const memos = await supabaseFetch(endpoint);
        const list = Array.isArray(memos) ? memos : [];

        // Deduplicate strictly: no duplicate memo numbers or duplicate subjects on same date
        const seenMemoNos = new Set();
        const seenFingerprints = new Set();
        const seenSubjectDate = new Set();
        const uniqueDocs = [];

        for (const m of list) {
          const memoNo = String(m.memo_no || m.legacy_id || m.id || "").trim().toUpperCase();
          const fp = String(m.duplicate_fingerprint || "").trim();
          const subjDate = `${String(m.subject || "").trim().toLowerCase()}|${m.date_logged || ""}`;

          if (memoNo && seenMemoNos.has(memoNo)) continue;
          if (fp && seenFingerprints.has(fp)) continue;
          if (subjDate.length > 5 && seenSubjectDate.has(subjDate)) continue;

          if (memoNo) seenMemoNos.add(memoNo);
          if (fp) seenFingerprints.add(fp);
          if (subjDate.length > 5) seenSubjectDate.add(subjDate);

          uniqueDocs.push(mapMemoToDoc(m, offset + uniqueDocs.length));
          if (uniqueDocs.length >= limit) break;
        }

        return res.status(200).json({
          result: "success",
          documents: uniqueDocs,
          count: uniqueDocs.length
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
        const memo = await findMemoRecord(rawId);
        if (!memo) {
          return res.status(200).json({
            result: "error",
            message: `Document not found: ${rawId}`
          });
        }

        const doc = mapMemoToDoc(memo);

        // Fetch routing movement history
        let history = [];
        try {
          const encId = encodeURIComponent(doc.controlRefId);
          const memoIdEnc = encodeURIComponent(memo.id);
          const moveRows = await supabaseFetch(
            `document_movements?or=(control_ref_id.eq.%22${encId}%22,memo_id.eq.${memoIdEnc})&order=date_time.desc&limit=50`
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
        } catch (_) {}

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
        const memo = await findMemoRecord(rawId);
        if (!memo) {
          return res.status(404).json({
            result: "error",
            message: `Document not found: ${rawId}`
          });
        }

        const oldSection = memo.assigned_section || "Message Center";
        const today = new Date().toISOString().split("T")[0];
        const nowIso = new Date().toISOString();

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

        await supabaseFetch(`memos?id=eq.${memo.id}`, {
          method: "PATCH",
          body: updatePayload
        });

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

        metricsCache = null;

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
