let API_URL =
  (window.RCD_CONFIG || {}).API_URL ||
  localStorage.getItem("RCD_API_URL") ||
  "";

let current = null;
let scanner = null;

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");


/* =========================================================
   API
========================================================= */

async function api(params = {}, timeoutMs = 20000) {

  if (!API_URL) {
    throw new Error("RCD API URL is missing.");
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {

    const url = new URL(
      API_URL,
      window.location.origin
    );

    Object.entries(params).forEach(([key, value]) => {

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }

    });

    const response = await fetch(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      }
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `RCD API HTTP ${response.status}`
      );
    }

    let data;

    try {

      data = JSON.parse(text);

    } catch {

      throw new Error(
        "RCD API returned invalid JSON."
      );

    }

    if (data?.result === "error") {

      throw new Error(
        data.error ||
        data.message ||
        "RCD API returned an error."
      );

    }

    return data;

  } catch (error) {

    if (error.name === "AbortError") {

      throw new Error(
        "RCD API timed out. Please try again."
      );

    }

    throw error;

  } finally {

    clearTimeout(timer);

  }

}


async function apiAction(
  action,
  params = {}
) {

  return api({
    ...params,
    action
  });

}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function page(id) {

  document
    .querySelectorAll(".page")
    .forEach(section =>
      section.classList.remove("active")
    );

  const target = $(id);

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll("nav button")
    .forEach(button =>
      button.classList.toggle(
        "active",
        button.dataset.page === id
      )
    );

  document
    .querySelector("nav")
    ?.classList.remove("open");

  if (id === "scan") {
    startScan();
  }

}


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

  const element = $("toast");

  if (!element) return;

  element.textContent = message;
  element.style.display = "block";

  clearTimeout(
    window.__toastTimer
  );

  window.__toastTimer =
    setTimeout(
      () => {
        element.style.display = "none";
      },
      3500
    );

}


/* =========================================================
   DOCUMENT DISPLAY
========================================================= */

function showDoc(
  data,
  target,
  actions = true
) {

  if (!data) {

    target.innerHTML =
      `<div class="error">
        Document not found.
      </div>`;

    return;

  }


  if (data.result === "error") {

    target.innerHTML =
      `<div class="error">
        ${esc(
          data.message ||
          data.error ||
          "Document not found."
        )}
      </div>`;

    return;

  }


  /*
   * If subject search returns multiple documents,
   * show the matching documents first.
   */

  if (
    Array.isArray(data.documents)
  ) {

    showDocumentList(
      data.documents,
      target
    );

    return;

  }


  const d =
    data.document ||
    data;

  current = d;


  const history =
    (d.history || [])
      .map(item => `

        <div class="move">

          <b>
            ${esc(item.action)}
          </b>

          <br>

          ${esc(
            item.fromSection ||
            "Initial"
          )}

          →

          ${esc(
            item.toSection ||
            ""
          )}

          <small>
            ${esc(item.personnel || "")}
            ·
            ${esc(item.dateTime || "")}
          </small>

          ${
            item.remarks
              ? `
                <small>
                  ${esc(item.remarks)}
                </small>
              `
              : ""
          }

        </div>

      `)
      .join("")
      ||
      `
        <p class="muted">
          No movement history.
        </p>
      `;


  target.innerHTML = `

    <div class="doc">

      <div class="docHead">

        <div class="docId">
          ${esc(d.controlRefId)}
        </div>

        <span class="status">
          ${esc(
            d.routingStatus ||
            d.locationStatus ||
            "Unassigned"
          )}
        </span>

      </div>


      <div class="fields">

        <div class="field wide">

          <label>
            Subject / Title of Memo
          </label>

          <b>
            ${esc(
              d.subject ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Current Section
          </label>

          <b>
            ${esc(
              d.currentSection ||
              "Not assigned"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Current Personnel
          </label>

          <b>
            ${esc(
              d.currentPersonnel ||
              "Not assigned"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Originating Office
          </label>

          <b>
            ${esc(
              d.originatingOffice ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Received By
          </label>

          <b>
            ${esc(
              d.receivedBy ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Date Logged
          </label>

          <b>
            ${esc(
              d.dateLogged ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Action Required
          </label>

          <b>
            ${esc(
              d.actionRequired ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Date Received
          </label>

          <b>
            ${esc(
              d.dateReceived ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Location Status
          </label>

          <b>
            ${esc(
              d.locationStatus ||
              "N/A"
            )}
          </b>

        </div>


        <div class="field">

          <label>
            Routing Status
          </label>

          <b>
            ${esc(
              d.routingStatus ||
              "N/A"
            )}
          </b>

        </div>

      </div>


      ${
        d.driveLink
          ? `
            <div class="docLink">

              <a
                href="${esc(d.driveLink)}"
                target="_blank"
                rel="noopener">

                Open Google Drive File

              </a>

            </div>
          `
          : ""
      }


      <div class="history">

        <h2>
          Movement History
        </h2>

        ${history}

      </div>


      ${
        actions
          ? routingPanel()
          : ""
      }

    </div>

  `;


  if (actions) {
    loadSections();
  }

}


/* =========================================================
   MULTIPLE SEARCH RESULTS
========================================================= */

function showDocumentList(
  documents,
  target
) {

  if (!documents.length) {

    target.innerHTML =
      `
      <div class="error">
        No matching documents found.
      </div>
      `;

    return;

  }


  target.innerHTML = `

    <div class="box">

      <h2>
        Matching Documents
      </h2>

      <p class="muted">
        ${documents.length}
        matching document(s) found.
      </p>

      <div class="searchResults">

        ${documents
          .map(
            (d, index) => `

            <div class="searchResult">

              <div class="searchResultInfo">

                <strong>
                  ${esc(
                    d.controlRefId
                  )}
                </strong>

                <div class="resultSubject">

                  ${esc(
                    d.subject ||
                    "No subject"
                  )}

                </div>

                <small>

                  ${esc(
                    d.currentSection ||
                    "Unassigned"
                  )}

                  ·

                  ${esc(
                    d.currentPersonnel ||
                    "Unassigned"
                  )}

                </small>

              </div>


              <button
                class="resultBtn"
                data-result-index="${index}">

                Open &amp; Route

              </button>

            </div>

          `
          )
          .join("")}

      </div>

    </div>

  `;


  target
    .querySelectorAll(
      "[data-result-index]"
    )
    .forEach(button => {

      button.onclick = () => {

        const index =
          Number(
            button.dataset.resultIndex
          );

        showDoc(
          {
            result: "success",

            document:
              documents[index]

          },
          target,
          true
        );

      };

    });

}


/* =========================================================
   ROUTING PANEL
========================================================= */

function routingPanel() {

  return `

    <div class="actions">

      <h2>
        Forward Document
      </h2>

      <p class="muted">

        Select the concern section and
        personnel who will receive this document.

      </p>


      <label class="routeLabel">

        Concern Section

      </label>


      <select id="sec">

        <option value="">

          Select Concern Section

        </option>

      </select>


      <label class="routeLabel">

        Concern Personnel

      </label>


      <select id="person">

        <option value="">

          Select Concern Personnel

        </option>

      </select>


      <textarea
        id="remarks"
        rows="3"
        placeholder="Routing remarks / instructions (optional)">
      </textarea>


      <button
        class="actionBtn"
        id="forward">

        Forward to Concern Personnel

      </button>


      <div class="two routeSecondary">

        <button
          class="actionBtn green"
          id="receive">

          Receive

        </button>


        <button
          class="actionBtn orange"
          id="complete">

          Mark Completed

        </button>

      </div>

    </div>

  `;

}


/* =========================================================
   FIND DOCUMENT
========================================================= */

async function findDocument(
  controlId,
  subject,
  target,
  actions = true
) {

  controlId =
    (controlId || "").trim();

  subject =
    (subject || "").trim();


  if (!controlId && !subject) {

    toast(
      "Enter the Control Ref ID or Subject / Title of Memo."
    );

    return;

  }


  target.innerHTML =
    `
      <div class="box loading">

        Searching document...

      </div>
    `;


  try {

    /*
     * Control Ref ID takes priority
     * when both are supplied.
     */

    const data =
      await apiAction(
        "getDocument",
        {
          id: controlId,
          subject: subject
        }
      );


    showDoc(
      data,
      target,
      actions
    );


  } catch (error) {

    target.innerHTML =
      `
      <div class="error">

        ${esc(
          error.message
        )}

      </div>
      `;

  }

}


/* =========================================================
   SECTION LIST
========================================================= */

async function loadSections() {

  try {

    const data =
      await apiAction(
        "getSections"
      );


    const select =
      $("sec");


    if (!select) return;


    select.innerHTML =
      `
      <option value="">

        Select Concern Section

      </option>
      `;


    (data.sections || [])
      .forEach(section => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          section;

        option.textContent =
          section;

        select.appendChild(
          option
        );

      });


    select.onchange =
      loadPeople;


  } catch (error) {

    toast(
      error.message
    );

  }

}


/* =========================================================
   PERSONNEL LIST
========================================================= */

async function loadPeople() {

  const section =
    $("sec");

  const personnel =
    $("person");


  if (
    !section ||
    !personnel
  ) {
    return;
  }


  personnel.innerHTML =
    `
    <option value="">

      Select Concern Personnel

    </option>
    `;


  if (!section.value) {
    return;
  }


  try {

    const data =
      await apiAction(
        "getPersonnel",
        {
          section:
            section.value
        }
      );


    (data.personnel || [])
      .forEach(name => {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          name;

        option.textContent =
          name;

        personnel.appendChild(
          option
        );

      });


  } catch (error) {

    toast(
      error.message
    );

  }

}


/* =========================================================
   MOVEMENT
========================================================= */

async function move(
  type
) {

  const id =
    current?.controlRefId;

  const section =
    $("sec")?.value || "";

  const personnel =
    $("person")?.value || "";

  const remarks =
    $("remarks")?.value || "";


  if (!id) {

    toast(
      "Load a document first."
    );

    return;

  }


  if (
    type !== "COMPLETE" &&
    (!section || !personnel)
  ) {

    toast(
      "Select the concern section and personnel."
    );

    return;

  }


  if (
    type === "FORWARD" &&
    current.currentSection === section &&
    current.currentPersonnel === personnel
  ) {

    toast(
      "This document is already assigned to this personnel."
    );

    return;

  }


  try {

    const button =
      type === "FORWARD"
        ? $("forward")
        : type === "RECEIVE"
          ? $("receive")
          : $("complete");


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Saving...";

    }


    const data =
      await apiAction(
        "routeDocument",
        {
          id,
          movement: type,
          section,
          personnel,
          remarks
        }
      );


    if (
      data?.result === "error"
    ) {

      throw new Error(
        data.error ||
        data.message ||
        "Movement was not recorded."
      );

    }


    toast(
      data.message ||
      "Document movement recorded."
    );


    /*
     * Reload the document after
     * successful routing.
     */

    const resultTarget =
      $("result") ||
      $("routeResult");


    if (resultTarget) {

      await findDocument(
        id,
        "",
        resultTarget,
        true
      );

    }


    dashboard();


  } catch (error) {

    toast(
      error.message
    );


  } finally {

    const button =
      type === "FORWARD"
        ? $("forward")
        : type === "RECEIVE"
          ? $("receive")
          : $("complete");


    if (button) {

      button.disabled =
        false;


      button.textContent =
        type === "FORWARD"
          ? "Forward to Concern Personnel"
          : type === "RECEIVE"
            ? "Receive"
            : "Mark Completed";

    }

  }

}


/* =========================================================
   QR SCANNER
========================================================= */

async function startScan() {

  if (
    scanner ||
    !window.Html5Qrcode
  ) {

    if (!scanner) {

      setTimeout(
        startScan,
        500
      );

    }

    return;

  }


  scanner =
    new Html5Qrcode(
      "reader"
    );


  try {

    await scanner.start(

      {
        facingMode:
          "environment"
      },

      {
        fps: 10,

        qrbox: {
          width: 240,
          height: 240
        }

      },

      async text => {

        try {

          await scanner.stop();

        } catch (_) {}


        try {

          scanner.clear();

        } catch (_) {}


        scanner = null;


        let id = text;


        try {

          id =
            new URL(text)
              .searchParams
              .get("id") ||
            text;

        } catch (_) {}


        page("track");


        $("trackId").value =
          id;

        $("trackSubject").value =
          "";


        findDocument(
          id,
          "",
          $("result"),
          true
        );

      },

      () => {}

    );


    $("scanStatus")
      .textContent =
      "Point the camera at the QR code.";


  } catch (_) {

    $("scanStatus")
      .textContent =
      "Camera access is unavailable. Enter the Control Ref ID manually.";

  }

}


/* =========================================================
   DASHBOARD
========================================================= */

async function dashboard() {

  try {

    const data =
      await apiAction(
        "dashboard"
      );


    const metrics =
      data.metrics || {};


    $("total").textContent =
      Number(
        metrics.total ?? 0
      ).toLocaleString();


    $("message").textContent =
      Number(
        metrics.messageCenter ?? 0
      ).toLocaleString();


    $("forwarded").textContent =
      Number(
        metrics.forwarded ?? 0
      ).toLocaleString();


    $("completed").textContent =
      Number(
        metrics.completed ?? 0
      ).toLocaleString();


    $("connectionStatus")
      .textContent =
      "Connected to RCD routing database";


    $("connectionStatus")
      .className =
      "connection ok";


  } catch (error) {

    $("total").textContent =
      "-";

    $("message").textContent =
      "-";

    $("forwarded").textContent =
      "-";

    $("completed").textContent =
      "-";


    $("connectionStatus")
      .textContent =
      "RCD API unavailable: " +
      error.message;


    $("connectionStatus")
      .className =
      "connection errorConn";


    console.error(
      "Dashboard API error:",
      error
    );

  }

}


/* =========================================================
   NAVIGATION EVENTS
========================================================= */

document
  .querySelectorAll(
    "nav button"
  )
  .forEach(button => {

    button.onclick =
      () =>
        page(
          button.dataset.page
        );

  });


$("menu").onclick = () => {

  document
    .querySelector("nav")
    .classList
    .toggle("open");

};


/* =========================================================
   HOME SEARCH
========================================================= */

$("homeTrack").onclick =
  () => {

    const id =
      $("homeId").value;

    const subject =
      $("homeSubject").value;


    page("track");


    $("trackId").value =
      id;

    $("trackSubject").value =
      subject;


    findDocument(
      id,
      subject,
      $("result"),
      true
    );

  };


/* =========================================================
   TRACK SEARCH
========================================================= */

$("trackBtn").onclick =
  () => {

    findDocument(
      $("trackId").value,
      $("trackSubject").value,
      $("result"),
      true
    );

  };


/* =========================================================
   ROUTE PAGE SEARCH
========================================================= */

$("routeLoad").onclick =
  () => {

    findDocument(
      $("routeId").value,
      "",
      $("routeResult"),
      true
    );

  };


/* =========================================================
   MOVEMENT BUTTON EVENTS
========================================================= */

document.addEventListener(
  "click",
  event => {

    if (
      event.target.id ===
      "forward"
    ) {

      move("FORWARD");

    }


    if (
      event.target.id ===
      "receive"
    ) {

      move("RECEIVE");

    }


    if (
      event.target.id ===
      "complete"
    ) {

      move("COMPLETE");

    }

  }
);


/* =========================================================
   INITIAL LOAD
========================================================= */

window.addEventListener(
  "load",
  () => {

    const params =
      new URLSearchParams(
        location.search
      );


    const id =
      params.get("id");


    if (id) {

      page("track");


      $("trackId").value =
        id;


      findDocument(
        id,
        "",
        $("result"),
        true
      );


    } else {

      dashboard();

    }

  }
);


/* =========================================================
   ENTER KEY
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !== "Enter"
    ) {
      return;
    }


    if (
      document.activeElement ===
        $("homeId") ||

      document.activeElement ===
        $("homeSubject")
    ) {

      $("homeTrack").click();

    }


    if (
      document.activeElement ===
        $("trackId") ||

      document.activeElement ===
        $("trackSubject")
    ) {

      $("trackBtn").click();

    }


    if (
      document.activeElement ===
      $("routeId")
    ) {

      $("routeLoad").click();

    }

  }
);
