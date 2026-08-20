let API_URL = (window.RCD_CONFIG || {}).API_URL ||
  localStorage.getItem("RCD_API_URL") || "";

let current = null;
let scanner = null;

const $ = id => document.getElementById(id);

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

async function api(params = {}, timeoutMs = 20000) {
  if (!API_URL) throw new Error("RCD API URL is missing.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(API_URL, window.location.origin);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`RCD API HTTP ${response.status}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("RCD API returned invalid JSON.");
    }

    if (data?.result === "error") {
      throw new Error(data.error || data.message || "RCD API returned an error.");
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("RCD API timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function apiAction(action, params = {}) {
  return api({ ...params, action });
}

function page(id) {
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  const target = $(id);
  if (target) target.classList.add("active");

  document.querySelectorAll("nav button").forEach(x => {
    x.classList.toggle("active", x.dataset.page === id);
  });

  document.querySelector("nav")?.classList.remove("open");

  if (id === "scan") startScan();
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.style.display = "none";
  }, 3500);
}

function showDoc(data, target, actions = true) {
  if (!data) {
    target.innerHTML = `<div class="error">Document not found.</div>`;
    return;
  }

  if (data.result === "error") {
    target.innerHTML = `<div class="error">${esc(data.message || data.error || "Document not found.")}</div>`;
    return;
  }

  if (Array.isArray(data.documents)) {
    showDocumentList(data.documents, target);
    return;
  }

  const d = data.document || data;
  current = d;

  const history = (d.history || []).map(x => `
    <div class="move">
      <b>${esc(x.action || "")}</b><br>
      ${esc(x.fromSection || "Initial")} → ${esc(x.toSection || "")}
      <small>${esc(x.personnel || "")} · ${esc(x.dateTime || "")}</small>
      ${x.remarks ? `<small>${esc(x.remarks)}</small>` : ""}
    </div>
  `).join("") || `<p class="muted">No movement history.</p>`;

  target.innerHTML = `
    <div class="doc">
      <div class="docHead">
        <div class="docId">${esc(d.controlRefId)}</div>
        <span class="status">${esc(d.routingStatus || d.locationStatus || "Unassigned")}</span>
      </div>

      <div class="fields">
        <div class="field wide">
          <label>Subject / Title of Memo</label>
          <b>${esc(d.subject || "N/A")}</b>
        </div>

        <div class="field">
          <label>Current Section</label>
          <b>${esc(d.currentSection || "Not assigned")}</b>
        </div>

        <div class="field">
          <label>Current Personnel</label>
          <b>${esc(d.currentPersonnel || "Not assigned")}</b>
        </div>

        <div class="field">
          <label>Originating Office</label>
          <b>${esc(d.originatingOffice || "N/A")}</b>
        </div>

        <div class="field">
          <label>Received By</label>
          <b>${esc(d.receivedBy || "N/A")}</b>
        </div>

        <div class="field">
          <label>Date Logged</label>
          <b>${esc(d.dateLogged || "N/A")}</b>
        </div>

        <div class="field">
          <label>Action Required</label>
          <b>${esc(d.actionRequired || "N/A")}</b>
        </div>

        <div class="field">
          <label>Date Received</label>
          <b>${esc(d.dateReceived || "N/A")}</b>
        </div>

        <div class="field">
          <label>Location Status</label>
          <b>${esc(d.locationStatus || "N/A")}</b>
        </div>

        <div class="field">
          <label>Routing Status</label>
          <b>${esc(d.routingStatus || "N/A")}</b>
        </div>
      </div>

      ${d.driveLink ? `
        <div class="docLink">
          <a href="${esc(d.driveLink)}" target="_blank" rel="noopener">
            Open Google Drive File
          </a>
        </div>
      ` : ""}

      <div class="history">
        <h2>Movement History</h2>
        ${history}
      </div>

      ${actions ? routingPanel() : ""}
    </div>
  `;

  if (actions) loadSections();
}

function showDocumentList(documents, target) {
  if (!documents.length) {
    target.innerHTML = `<div class="error">No matching documents found.</div>`;
    return;
  }

  target.innerHTML = `
    <div class="box">
      <h2>Matching Documents</h2>
      <p class="muted">${documents.length} matching document(s) found.</p>

      <div class="searchResults">
        ${documents.map((d, index) => `
          <div class="searchResult">
            <div class="searchResultInfo">
              <strong>${esc(d.controlRefId)}</strong>
              <div class="resultSubject">${esc(d.subject || "No subject")}</div>
              <small>
                ${esc(d.currentSection || "Unassigned")} ·
                ${esc(d.currentPersonnel || "Unassigned")}
              </small>
            </div>
            <button class="resultBtn" data-result-index="${index}">
              Open &amp; Route
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  target.querySelectorAll("[data-result-index]").forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset.resultIndex);
      showDoc({
        result: "success",
        document: documents[index]
      }, target, true);
    };
  });
}

function routingPanel() {
  return `
    <div class="actions">
      <h2>Forward Document</h2>
      <p class="muted">
        Select the concern section and personnel who will receive this document.
      </p>

      <label class="routeLabel">Concern Section</label>
      <select id="sec">
        <option value="">Select Concern Section</option>
      </select>

      <label class="routeLabel">Concern Personnel</label>
      <select id="person">
        <option value="">Select Concern Personnel</option>
      </select>

      <textarea id="remarks" rows="3"
        placeholder="Routing remarks / instructions (optional)"></textarea>

      <button class="actionBtn" id="forward">
        Forward to Concern Personnel
      </button>

      <div class="two routeSecondary">
        <button class="actionBtn green" id="receive">Receive</button>
        <button class="actionBtn orange" id="complete">Mark Completed</button>
      </div>
    </div>
  `;
}

async function findDocument(query, target, actions = true) {
  query = (query || "").trim();

  if (!query) {
    toast("Enter the Control Ref ID or Subject / Title of Memo.");
    return;
  }

  target.innerHTML = `<div class="box loading">Searching document...</div>`;

  try {
    const data = await apiAction("getDocument", { query });
    showDoc(data, target, actions);
  } catch (error) {
    target.innerHTML = `<div class="error">${esc(error.message)}</div>`;
  }
}

async function loadSections() {
  try {
    const data = await apiAction("getSections");
    const select = $("sec");
    if (!select) return;

    select.innerHTML = `<option value="">Select Concern Section</option>`;

    (data.sections || []).forEach(section => {
      const option = document.createElement("option");
      option.value = section;
      option.textContent = section;
      select.appendChild(option);
    });

    select.onchange = loadPeople;
  } catch (error) {
    toast(error.message);
  }
}

async function loadPeople() {
  const section = $("sec");
  const personnel = $("person");
  if (!section || !personnel) return;

  personnel.innerHTML = `<option value="">Select Concern Personnel</option>`;
  if (!section.value) return;

  try {
    const data = await apiAction("getPersonnel", { section: section.value });

    (data.personnel || []).forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      personnel.appendChild(option);
    });
  } catch (error) {
    toast(error.message);
  }
}

async function move(type) {
  const id = current?.controlRefId;
  const section = $("sec")?.value || "";
  const personnel = $("person")?.value || "";
  const remarks = $("remarks")?.value || "";

  if (!id) return toast("Load a document first.");

  if (type !== "COMPLETE" && (!section || !personnel)) {
    return toast("Select the concern section and personnel.");
  }

  try {
    const data = await apiAction("routeDocument", {
      id,
      movement: type,
      section,
      personnel,
      remarks
    });

    if (data?.result === "error") {
      throw new Error(data.error || data.message || "Movement was not recorded.");
    }

    toast(data.message || "Document movement recorded.");

    const resultTarget = $("routeResult") || $("result") || $("homeResult");
    await findDocument(id, resultTarget, true);
    dashboard();
  } catch (error) {
    toast(error.message);
  }
}

async function startScan() {
  if (scanner || !window.Html5Qrcode) {
    if (!scanner) setTimeout(startScan, 500);
    return;
  }

  const reader = $("reader");
  if (!reader) return;

  scanner = new Html5Qrcode("reader");

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async text => {
        try { await scanner.stop(); } catch (_) {}
        try { scanner.clear(); } catch (_) {}
        scanner = null;

        let query = text;
        try {
          query = new URL(text).searchParams.get("id") || text;
        } catch (_) {}

        page("track");
        $("trackQuery").value = query;
        findDocument(query, $("result"), true);
      },
      () => {}
    );

    $("scanStatus").textContent = "Point the camera at the QR code.";
  } catch (_) {
    $("scanStatus").textContent =
      "Camera access is unavailable. Enter the Control Ref ID manually.";
  }
}

async function dashboard() {
  try {
    const data = await apiAction("dashboard");
    const m = data.metrics || {};

    $("total").textContent = Number(m.total ?? 0).toLocaleString();
    $("message").textContent = Number(m.messageCenter ?? 0).toLocaleString();
    $("forwarded").textContent = Number(m.forwarded ?? 0).toLocaleString();
    $("completed").textContent = Number(m.completed ?? 0).toLocaleString();

    $("connectionStatus").textContent = "Connected to RCD routing database";
    $("connectionStatus").className = "connection ok";
  } catch (error) {
    $("total").textContent = "-";
    $("message").textContent = "-";
    $("forwarded").textContent = "-";
    $("completed").textContent = "-";

    $("connectionStatus").textContent =
      "RCD API unavailable: " + error.message;
    $("connectionStatus").className = "connection errorConn";

    console.error("Dashboard API error:", error);
  }
}

document.querySelectorAll("nav button").forEach(button => {
  button.onclick = () => page(button.dataset.page);
});

$("menu").onclick = () => {
  document.querySelector("nav").classList.toggle("open");
};

$("homeTrack").onclick = () => {
  const query = $("homeQuery").value;
  page("track");
  $("trackQuery").value = query;
  findDocument(query, $("result"), true);
};

$("trackBtn").onclick = () => {
  findDocument($("trackQuery").value, $("result"), true);
};

$("routeLoad").onclick = () => {
  findDocument($("routeQuery").value, $("routeResult"), true);
};

document.addEventListener("click", event => {
  if (event.target.id === "receive") move("RECEIVE");
  if (event.target.id === "forward") move("FORWARD");
  if (event.target.id === "complete") move("COMPLETE");
});

document.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;

  if (document.activeElement === $("homeQuery")) $("homeTrack").click();
  if (document.activeElement === $("trackQuery")) $("trackBtn").click();
  if (document.activeElement === $("routeQuery")) $("routeLoad").click();
});

window.addEventListener("load", () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  if (id) {
    page("track");
    $("trackQuery").value = id;
    findDocument(id, $("result"), true);
  } else {
    dashboard();
  }
});
