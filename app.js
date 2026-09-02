let API_URL=(window.RCD_CONFIG||{}).API_URL||localStorage.getItem("RCD_API_URL")||"/api/rcd";
let current=null,scanner=null,jsonpCounter=0;
const selectedMemoIds=new Set();
const memoDataById=new Map();

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");

function api(params={}, timeoutMs=20000) {
  return new Promise(async (resolve, reject) => {
    if (!API_URL) return reject(new Error("RCD API URL is missing."));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const u = new URL(API_URL, window.location.origin);
      Object.entries(params).forEach(([k,v]) => {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      });

      const response = await fetch(u.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
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

      resolve(data);
    } catch (e) {
      if (e.name === "AbortError") {
        reject(new Error("RCD API timed out. Please try again."));
      } else {
        reject(e);
      }
    } finally {
      clearTimeout(timer);
    }
  });
}

async function apiAction(action, params={}) {
  return api(Object.assign({},params,{action}));
}

function page(id){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.page===id));
  document.querySelector("nav")?.classList.remove("open");
  if(id==="scan")startScan();
}

function toast(m){
  $("toast").textContent=m;
  $("toast").style.display="block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>$("toast").style.display="none",3500);
}

function showDoc(data,target,actions=false){
  if(!data||data.result==="error"){
    target.innerHTML=`<div class="error">${esc(data?.message||data?.error||"Document not found.")}</div>`;
    return;
  }
  let d=data.document||data;
  current=d;
  let hist=(d.history||[]).map(x=>`<div class="move"><b>${esc(x.action)}</b><br>${esc(x.fromSection||"Initial")} → ${esc(x.toSection||"")}<small>${esc(x.personnel||"")} · ${esc(x.dateTime||"")}</small>${x.remarks?`<small>${esc(x.remarks)}</small>`:""}`).join("")||'<p class="muted">No movement history.</p>';

  target.innerHTML=`<div class="doc">
    <div class="docHead"><div class="docId">${esc(d.controlRefId)}</div><span class="status">${esc(d.routingStatus||d.locationStatus||"Unassigned")}</span></div>
    <div class="fields">
      <div class="field"><label>Current Section</label><b>${esc(d.currentSection||"Not assigned")}</b></div>
      <div class="field"><label>Current Personnel</label><b>${esc(d.currentPersonnel||"Not assigned")}</b></div>
      <div class="field"><label>Originating Office</label><b>${esc(d.originatingOffice)}</b></div>
      <div class="field"><label>Received By</label><b>${esc(d.receivedBy)}</b></div>
      <div class="field wide"><label>Subject</label><b>${esc(d.subject)}</b></div>
      <div class="field"><label>Date Logged</label><b>${esc(d.dateLogged)}</b></div>
      <div class="field"><label>Action Required</label><b>${esc(d.actionRequired)}</b></div>
      <div class="field"><label>Date Received</label><b>${esc(d.dateReceived)}</b></div>
    </div>
    ${d.driveLink?`<div class="docLink"><a href="${esc(d.driveLink)}" target="_blank" rel="noopener">Open Google Drive File</a></div>`:""}
    <div class="history"><h2>Movement History</h2>${hist}</div>
    ${actions?`<div class="actions">
      <div class="two"><select id="sec"><option value="">Select Section</option></select><select id="person"><option value="">Select Personnel</option></select></div>
      <textarea id="remarks" rows="2" placeholder="Remarks (optional)"></textarea>
      <div class="two"><button class="actionBtn green" id="receive">Receive</button><button class="actionBtn" id="forward">Forward</button></div>
      <button class="actionBtn orange" id="complete">Mark Completed</button>
    </div>`:""}
  </div>`;
  if(actions)loadSections();
}

async function find(id,target,actions=false){
  id=(id||"").trim();
  if(!id)return toast("Enter the Control Ref ID.");
  target.innerHTML='<div class="box loading">Loading document...</div>';
  try{showDoc(await api({action:"getDocument",id}),target,actions)}
  catch(e){target.innerHTML=`<div class="error">${esc(e.message)}</div>`}
}

async function loadSections(){
  try{
    let d=await api({action:"getSections"});
    let s=$("sec");
    d.sections.forEach(x=>{
      let o=document.createElement("option");
      o.value=x;o.textContent=x;s.appendChild(o);
    });
    s.onchange=loadPeople;
  }catch(e){toast(e.message)}
}

async function loadPeople(){
  let s=$("sec"),p=$("person");
  p.innerHTML='<option value="">Select Personnel</option>';
  if(!s.value)return;
  try{
    let d=await api({action:"getPersonnel",section:s.value});
    d.personnel.forEach(x=>{
      let o=document.createElement("option");
      o.value=x;o.textContent=x;p.appendChild(o);
    });
  }catch(e){toast(e.message)}
}

async function move(type){
  let id=current?.controlRefId,s=$("sec")?.value||"",p=$("person")?.value||"",r=$("remarks")?.value||"";
  if(!id)return toast("Load a document first.");

  if(type!=="COMPLETE"&&(!s||!p))return toast("Select the section and personnel.");

  try{
    const d = await apiAction("routeDocument",{
      id:id,
      movement:type,
      section:s,
      personnel:p,
      remarks:r
    });

    if(d?.result==="error") throw new Error(d.error||d.message||"Movement was not recorded.");
    toast(d.message||"Document movement recorded.");
    find(id,$("routeResult"),true);
    dashboard();
  }catch(e){toast(e.message)}
}

async function startScan(){
  if(scanner||!window.Html5Qrcode)return setTimeout(startScan,500);

  const reader=$("reader");
  const status=$("scanStatus");
  if(!reader)return;

  scanner=new Html5Qrcode("reader");

  try{
    /*
     * Samsung-style scanning behavior:
     * - rear camera
     * - continuous autofocus where supported
     * - high-resolution camera feed
     * - wider detection area instead of a small fixed QR box
     * - device optical/digital zoom when available
     * - no forced 2.5x zoom, which can crop a nearby QR code
     */
    const width=Math.max(280, Math.min(520, reader.clientWidth||420));
    const qrSize=Math.round(width*0.86);

    await scanner.start(
      {
        facingMode:{ideal:"environment"}
      },
      {
        fps:20,
        qrbox:{width:qrSize,height:qrSize},
        aspectRatio:1.7777778,
        disableFlip:false,
        videoConstraints:{
          facingMode:{ideal:"environment"},
          width:{ideal:1920,min:1280},
          height:{ideal:1080,min:720},
          frameRate:{ideal:30,max:60}
        }
      },
      async text=>{
        if(!text||!scanner)return;

        // Stop immediately after the first valid QR result.
        const active=scanner;
        scanner=null;
        try{await active.stop();}catch(_){}
        try{active.clear();}catch(_){}

        let id=text.trim();
        try{
          const url=new URL(id);
          id=url.searchParams.get("id")||id;
        }catch(_){}

        page("track");
        $("trackId").value=id;
        find(id,$("result"),true);
      },
      ()=>{}
    );

    /*
     * Configure the actual camera track after it starts.
     * Continuous focus and a moderate zoom make a small QR readable
     * while still behaving naturally when the QR is brought closer.
     */
    try{
      const video=reader.querySelector("video");
      const track=video?.srcObject?.getVideoTracks?.()[0];

      if(video){
        video.setAttribute("playsinline","");
        video.setAttribute("autoplay","");
        video.muted=true;
      }

      if(track){
        const caps=track.getCapabilities?.()||{};
        const advanced={};

        if(caps.focusMode){
          const modes=Array.isArray(caps.focusMode)?caps.focusMode:[];
          if(modes.includes("continuous")) advanced.focusMode="continuous";
          else if(modes.includes("single-shot")) advanced.focusMode="single-shot";
        }

        if(caps.zoom){
          const min=Number(caps.zoom.min??1);
          const max=Number(caps.zoom.max??min);
          // A moderate zoom, similar to using the phone's QR scanner.
          // Prefer 2x, but never exceed the camera's supported range.
          advanced.zoom=Math.min(max,Math.max(min,2));
        }

        if(Object.keys(advanced).length){
          await track.applyConstraints({advanced:[advanced]});
        }
      }
    }catch(_){}

    status.textContent="Point the camera at the QR code. Autofocus and camera zoom are enabled.";
  }catch(e){
    scanner=null;
    status.textContent="Camera access is unavailable. Enter the Control Ref ID manually.";
  }
}

function formatMemoDate(value){
  if(value===undefined||value===null||value==="") return "";
  const d=new Date(value);
  if(!Number.isNaN(d.getTime())) return d.toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
  return String(value);
}

function renderLatestMemos(data){
  injectLatestMemoStyles();
  const target=$("latestMemos");
  if(!target)return;

  if(!data||data.result==="error"){
    target.innerHTML=`<div class="error">${esc(data?.message||data?.error||"Unable to load latest memos.")}</div>`;
    return;
  }

  let rows=Array.isArray(data.documents)?data.documents:[];
  const total=Number(data.total ?? rows.length) || rows.length;
  rows=rows.map((d,index)=>({...d,__index:index}));

  rows.forEach(d=>{
    const id=String(d.controlRefId||"").trim();
    if(id)memoDataById.set(id,d);
  });

  const visibleIds=new Set(rows.map(d=>String(d.controlRefId||"").trim()).filter(Boolean));
  [...selectedMemoIds].forEach(id=>{if(!visibleIds.has(id))selectedMemoIds.delete(id)});

  const count=selectedMemoIds.size;
  const batchBar=count?`
    <div class="memoBatchBar">
      <div class="memoBatchInfo"><b>${count}</b> memo${count===1?"":"s"} selected</div>
      <div class="memoBatchActions">
        <button type="button" class="memoBatchBtn" id="batchForwardBtn">Forward Selected</button>
        <button type="button" class="memoBatchBtn" id="batchPrintBtn">Print Routing Slip</button>
        <button type="button" class="memoBatchClear" id="batchClearBtn">Clear</button>
      </div>
    </div>` : "";

  const allChecked=rows.length>0&&rows.every(d=>selectedMemoIds.has(String(d.controlRefId||"").trim()));

  const listHtml=rows.length ? rows.map(d=>{
    const id=String(d.controlRefId||"").trim();
    const selected=selectedMemoIds.has(id);
    return `<div class="memoItem ${selected?'memoItemSelected':''}">
      <div class="memoCheckWrap">
        <input type="checkbox" class="memoSelect" data-memo-id="${esc(id)}" ${selected?'checked':''} aria-label="Select ${esc(id)}">
      </div>
      <div class="memoMain">
        <div class="memoRef">${esc(id)}</div>
        <div class="memoSubject">${esc(d.subject||"Untitled Memo")}</div>
        <div class="memoMeta">${esc(d.originatingOffice||"")} ${d.dateLogged?`· ${esc(formatMemoDate(d.dateLogged))}`:""}</div>
      </div>
      <div class="memoActions">
        ${selected?"":`<button class="memoForward" type="button" data-memo-id="${esc(id)}" data-memo-action="view">View</button>`}
        <button class="memoForward" type="button" data-memo-id="${esc(id)}" data-memo-action="forward">Forward</button>
        <button class="memoForward" type="button" data-memo-id="${esc(id)}" data-memo-action="print">Print Routing Slip</button>
      </div>
    </div>`;
  }).join("") : '<p class="muted">No memos found.</p>';

  target.innerHTML=`${batchBar}
    <div class="memoSelectAllRow">
      <label><input type="checkbox" id="latestSelectAll" ${allChecked?'checked':''}> Select all visible</label>
      <span>${total.toLocaleString()} memo${total===1?'':'s'}</span>
    </div>
    <div class="memoScrollList">${listHtml}</div>`;

  target.querySelectorAll(".memoSelect").forEach(box=>{
    box.addEventListener("change",()=>{
      const id=box.dataset.memoId||"";
      if(box.checked)selectedMemoIds.add(id);else selectedMemoIds.delete(id);
      renderLatestMemos({...data,documents:rows});
    });
  });

  $("latestSelectAll")?.addEventListener("change",e=>{
    const checked=e.target.checked;
    rows.forEach(d=>{
      const id=String(d.controlRefId||"").trim();
      if(!id)return;
      if(checked)selectedMemoIds.add(id);else selectedMemoIds.delete(id);
    });
    renderLatestMemos({...data,documents:rows});
  });

  $("batchClearBtn")?.addEventListener("click",()=>{
    selectedMemoIds.clear();
    renderLatestMemos({...data,documents:rows});
  });

  $("batchForwardBtn")?.addEventListener("click",()=>openBatchForwardModal([...selectedMemoIds]));
  $("batchPrintBtn")?.addEventListener("click",()=>printSelectedRoutingSlips([...selectedMemoIds]));

  target.querySelectorAll(".memoForward").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.dataset.memoId||"";
      const mode=btn.dataset.memoAction||"view";
      if(mode==="print") printSelectedRoutingSlips(selectedMemoIds.size ? [...selectedMemoIds] : [id]);
      else openMemoModal(id,mode);
    });
  });
}

function injectLatestMemoStyles(){
  if($("latestMemoStyles"))return;
  const style=document.createElement("style");
  style.id="latestMemoStyles";
  style.textContent=`
    .memoBatchBar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 0 13px;margin-bottom:4px;border-bottom:1px solid #e2e8f0}
    .memoBatchInfo{color:#173b67;font-size:14px}
    .memoBatchActions{display:flex;gap:8px;flex-wrap:wrap}
    .memoBatchBtn,.memoBatchClear{appearance:none;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#173b67;font:600 13px Arial,sans-serif;padding:8px 12px;cursor:pointer}
    .memoBatchBtn{background:#173b67;color:#fff;border-color:#173b67}
    .memoBatchClear{color:#64748b}
    .memoSelectAllRow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0 9px;color:#64748b;font-size:12px}
    .memoSelectAllRow label{display:flex;align-items:center;gap:7px;cursor:pointer}
    .memoScrollList{max-height:560px;overflow-y:auto;overflow-x:hidden;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding-right:4px;scrollbar-gutter:stable}
    .memoScrollList::-webkit-scrollbar{width:10px}
    .memoScrollList::-webkit-scrollbar-track{background:#f1f5f9;border-radius:8px}
    .memoScrollList::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:8px;border:2px solid #f1f5f9}
    .memoScrollList{scrollbar-width:auto}
    .memoSelectAllRow input,.memoSelect{width:17px;height:17px;accent-color:#173b67;cursor:pointer}
    .memoItem{display:flex;align-items:center;gap:10px}
    .memoCheckWrap{flex:0 0 24px;display:flex;align-items:center;justify-content:center}
    .memoItemSelected{background:#f4f8fc}
    .memoItemSelected .memoSubject{color:#173b67}
    .memoPagination{display:flex;align-items:center;justify-content:center;gap:14px;padding:16px 0 2px;border-top:1px solid #e2e8f0;margin-top:4px}
    .memoPageBtn{appearance:none;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#173b67;font:600 13px Arial,sans-serif;padding:9px 20px;cursor:pointer;min-width:86px}
    .memoPageBtn:hover:not(:disabled){background:#f4f8fc}
    .memoPageBtn:disabled{color:#94a3b8;background:#f8fafc;cursor:not-allowed;opacity:.8}
    .memoPageInfo{font-size:12px;color:#64748b;text-align:center}
    @media(max-width:650px){
      .memoItem{align-items:flex-start;flex-wrap:wrap}
      .memoCheckWrap{padding-top:3px}
      .memoMain{flex:1 1 calc(100% - 40px)}
      .memoActions{width:100%;margin-left:34px;justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
}


function getReceivedRecord(d){
  const history=Array.isArray(d?.history)?d.history:[];
  const received=history.find(x=>String(x?.action||"").toUpperCase()==="RECEIVE")
    || history.find(x=>/receiv/i.test(String(x?.action||"")));
  return received||null;
}

function printRoutingSlipDate(value){
  if(value===undefined||value===null||value==="") return "";
  const d=new Date(value);
  if(!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"});
  return String(value);
}

function printRoutingSlipTime(value){
  if(value===undefined||value===null||value==="") return "";
  const d=new Date(value);
  if(!Number.isNaN(d.getTime())) return d.toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit"});
  return String(value);
}

function routingSlipRows(d){
  const names=[
    "Asst. C, RCD/C,ADMIN",
    "C,Mgmt.",
    "C, PBAS",
    "C, BFS",
    "Chief Clerk",
    "Action PNCO"
  ];
  const history=Array.isArray(d?.history)?d.history:[];
  const receive=getReceivedRecord(d);
  const relevant=history.filter(x=>String(x?.action||"").toUpperCase()!=="INITIAL").slice(-6).reverse();
  const rows=names.map((name,i)=>{
    const h=relevant[i];
    return {
      nr:6-i,
      name,
      initial:h?.personnel||h?.toPersonnel||h?.receivedBy||"",
      date:h?.dateTime||h?.date||"",
      action:h?.action||"",
      remarks:h?.remarks||""
    };
  });
  if(receive && !rows.some(r=>r.initial===receive.personnel)){
    rows[5]={
      nr:1,
      name:"Action PNCO",
      initial:receive.personnel||receive.receivedBy||d?.receivedBy||"",
      date:receive.dateTime||d?.dateReceived||d?.dateLogged||"",
      action:"RECEIVE",
      remarks:receive.remarks||""
    };
  }
  return rows;
}

function buildSingleRoutingSlipHtml(d){
  const received=getReceivedRecord(d);
  const receivedAt=received?.dateTime||d?.dateReceived||d?.dateLogged||"";
  const preparedBy=received?.personnel||received?.receivedBy||d?.receivedBy||d?.currentPersonnel||"";
  const rows=routingSlipRows(d);
  const rowHtml=rows.map(r=>`<tr>
    <td class="nr">${esc(r.nr)}</td>
    <td class="particulars">${esc(r.name)}</td>
    <td class="initial">${esc(r.initial||"")}</td>
    <td class="date">${esc(r.date?formatRoutingDate(r.date):"")}</td>
    <td class="action">${esc(r.action||"")}</td>
    <td class="remarks">${esc(r.remarks||"")}</td>
  </tr>`).join("");

  return `<div class="slip">
    <div class="title">RCD ROUTING SLIP</div>
    <div class="meta">
      <div class="metaLeft">
        <div class="metaCell subjectCell"><span class="metaLabel">Subject:</span><span class="metaValue">${esc(d?.subject||"")}</span></div>
        <div class="metaCell controlCell"><span class="metaLabel">Control No.:</span><span class="metaValue">${esc(d?.controlRefId||"")}</span></div>
      </div>
      <div class="metaRight">
        <div class="metaInfo">
          <div class="metaCell"><span class="metaLabel">Date:</span><span class="metaValue">${esc(printRoutingSlipDate(receivedAt))}</span></div>
          <div class="metaCell"><span class="metaLabel">Time In:</span><span class="metaValue">${esc(printRoutingSlipTime(receivedAt))}</span></div>
          <div class="metaCell"><span class="metaLabel">Prepared by:</span><span class="metaValue">${esc(preparedBy)}</span></div>
        </div>
        <div class="slipQr"><img src="${esc(`https://quickchart.io/qr?text=${encodeURIComponent(`${(window.RCD_CONFIG||{}).APP_URL||location.origin}?id=${encodeURIComponent(String(d?.controlRefId||''))}`)}&size=180`)}" alt="QR code for ${esc(d?.controlRefId||'document')}"></div>
      </div>
    </div>
    <div class="blankBand"></div>
    <table>
      <colgroup><col class="nrCol"><col class="particularsCol"><col class="initialCol"><col class="dateCol"><col class="actionCol"><col class="remarksCol"></colgroup>
      <thead><tr><th>NR</th><th>PARTICULARS</th><th>INITIAL</th><th>DATE</th><th>ACTION<br>REQUESTED</th><th>REMARKS / COMMENTS</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="bottom">
      <div class="legend">
        <div class="legendTitle">ACTION REQUESTED</div>
        <div class="legendGrid">
          <div>A. APPROVAL / SIGNATURE<br>B. APPROPRIATE STAFF ACTION<br>C. COMMENTS AND RECOMMENDATION<br>D. REPLY DIRECT TO WRITER<br>E. REPLY FOR SIG OF RD<br>F. ATTN TO HWI/HWN INSIDE<br>G. REWRITE/RETYPE</div>
          <div>H. STUDY REVIEW/INVESTIGATE<br>I. NOTABLE INFORMATION<br>J. REFERENCE FILE<br>K. DISPATCH<br>L. WIDEST DISSEMINATION<br>M. SEE REMARKS / INSTRUCTIONS<br>N. SEE ME</div>
        </div>
        <div class="legendFooter">(Indicate Letter Only)</div>
      </div>
      <div class="bottomBlank"><div></div><div></div><div></div><div></div></div>
    </div>
  </div>`;
}

function buildRoutingSlipHtml(documents){
  const docs=Array.isArray(documents)?documents:[documents];
  const slips=docs.filter(Boolean).map(d=>buildSingleRoutingSlipHtml(d)).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RCD Routing Slip${docs.length>1?"s":""}</title>
<style>
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#eef1f5;color:#000;font-family:Arial,Helvetica,sans-serif}
  body{min-height:100vh;padding:18px}
  .toolbar{width:min(900px,100%);margin:0 auto 12px;display:flex;justify-content:flex-end;gap:8px}
  .toolbar button{appearance:none;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#173b67;font:600 14px Arial,sans-serif;padding:9px 16px;cursor:pointer}
  .toolbar .printBtn{background:#173b67;color:#fff;border-color:#173b67}
  .sheet{width:202mm;margin:0 auto;background:#fff;padding:3mm;display:grid;grid-template-columns:96mm 96mm;grid-auto-rows:max-content;gap:4mm;align-items:start;box-shadow:0 3px 16px rgba(15,23,42,.18)}
  .slip{width:96mm;border:1px solid #000;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:5.9pt;line-height:1.03;overflow:hidden;break-inside:avoid}
  .title{height:5mm;background:#073d70 !important;color:#fff !important;border-bottom:1px solid #000;text-align:center;font-size:9.5pt;font-weight:700;letter-spacing:.15px;padding:.7mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .meta{display:grid;grid-template-columns:1fr 1.04fr;border-bottom:1px solid #000}
  .metaLeft{border-right:1px solid #000}.metaCell{min-height:5.8mm;border-bottom:1px solid #000;padding:.55mm .8mm;font-size:5.8pt;display:flex;align-items:flex-start;gap:.8mm}.metaCell:last-child{border-bottom:0}.subjectCell{min-height:6.8mm}.controlCell{min-height:5.8mm}.metaRight{display:grid;grid-template-columns:1fr 25mm;min-width:0}.metaInfo{min-width:0}.metaRight .metaCell{display:flex;align-items:flex-start}.metaRight .metaInfo .metaCell:last-child{border-bottom:0}.slipQr{display:flex;align-items:center;justify-content:center;border-left:1px solid #000;padding:1.5mm}.slipQr img{width:20mm;height:20mm;max-width:100%;object-fit:contain;display:block}.metaLabel{font-weight:400;white-space:nowrap}.metaValue{font-weight:600;flex:1;overflow-wrap:anywhere;word-break:break-word}
  .blankBand{height:3.2mm;border-bottom:1px solid #000}
  table{width:100%;border-collapse:collapse;table-layout:fixed} col.nrCol{width:5.5mm}.particularsCol{width:21mm}.initialCol{width:9mm}.dateCol{width:11mm}.actionCol{width:18mm}.remarksCol{width:31.5mm}
  th{height:8.8mm;background:#073d70 !important;color:#fff !important;font-size:6.3pt;font-weight:700;text-align:center;padding:.6mm .3mm;border-right:1px solid #fff;border-bottom:1px solid #000;vertical-align:middle;-webkit-print-color-adjust:exact;print-color-adjust:exact} th:last-child{border-right:0}
  td{height:4.4mm;border-right:1px solid #000;border-bottom:1px solid #000;padding:.35mm .55mm;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word} td:last-child{border-right:0}
  td.nr{text-align:center}td.particulars{font-size:5.8pt}td.initial{text-align:center;font-size:5.2pt}td.date{text-align:center;font-size:4.8pt}td.action{text-align:center;font-size:4.9pt}td.remarks{font-size:4.8pt}
  .bottom{display:grid;grid-template-columns:1fr 38mm;min-height:19.5mm}.legend{border-right:1px solid #000;padding:1mm 1.8mm .7mm;font-size:3.7pt;line-height:1.2}.legendGrid{display:grid;grid-template-columns:1fr 1fr;gap:0 1.5mm}.legendTitle{text-align:center;font-weight:700;font-size:4.1pt;margin-bottom:.6mm}.legendFooter{text-align:center;margin-top:.6mm;font-size:3.4pt}.bottomBlank{display:grid;grid-template-rows:repeat(4,1fr)}.bottomBlank div{border-bottom:1px solid #000}.bottomBlank div:last-child{border-bottom:0}
  @media print{
    html,body{background:#fff;width:210mm;min-height:297mm}
    body{padding:0}
    .toolbar{display:none!important}
    .sheet{width:202mm;margin:0;padding:3mm;grid-template-columns:96mm 96mm;gap:4mm;box-shadow:none}
    .slip{break-inside:avoid;page-break-inside:avoid}
    .slip:nth-child(8n+1){break-before:auto}
    .slip:nth-child(8n+9){break-before:page}
    .slip,.title,th{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="printBtn" onclick="window.print()">Print Routing Slip</button>
  </div>
  <div class="sheet">${slips}</div>
</body>
</html>`;
}

async function fetchDocumentsByIds(ids){
  const clean=[...new Set((ids||[]).map(x=>String(x||"").trim()).filter(Boolean))];
  const docs=[];
  for(const id of clean){
    const cached=memoDataById.get(id);
    try{
      const data=await api({action:"getDocument",id});
      if(data&&!data.result){
        const d=data.document||data;
        memoDataById.set(id,d);
        docs.push(d);
      }else if(cached){
        docs.push(cached);
      }
    }catch(e){
      if(cached)docs.push(cached);
      else throw e;
    }
  }
  return docs;
}

async function printRoutingSlip(id){
  id=(id||"").trim();
  if(!id)return toast("Control Ref ID is missing.");
  return printSelectedRoutingSlips([id]);
}

async function printSelectedRoutingSlips(ids){
  const clean=[...new Set((ids||[]).map(x=>String(x||"").trim()).filter(Boolean))];
  if(!clean.length)return toast("Select at least one memo to print.");

  const win=window.open("about:blank","_blank","width=900,height=900");
  if(!win){
    toast("Please allow pop-ups to open the routing slip.");
    return;
  }

  try{
    win.document.open();
    win.document.write(`<!doctype html><html><head><title>RCD Routing Slip</title></head><body style="margin:0;background:#eef1f5;font-family:Arial,sans-serif"><div style="padding:30px;text-align:center;color:#173b67;font-weight:600">Loading ${clean.length} routing slip${clean.length===1?"":"s"}...</div></body></html>`);
    win.document.close();
    win.focus();

    const docs=await fetchDocumentsByIds(clean);
    if(!docs.length)throw new Error("No selected memo could be loaded.");

    win.document.open();
    win.document.write(buildRoutingSlipHtml(docs));
    win.document.close();
    win.focus();
  }catch(e){
    try{
      win.document.open();
      win.document.write(`<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px"><h3 style="color:#b91c1c">Unable to load routing slip</h3><p>${esc(e.message)}</p><button onclick="window.close()">Close</button></body></html>`);
      win.document.close();
    }catch(_){ }
    toast("Unable to load routing slip: "+e.message);
  }
}

async function openBatchForwardModal(ids){
  const clean=[...new Set((ids||[]).map(x=>String(x||"").trim()).filter(Boolean))];
  if(!clean.length)return toast("Select at least one memo to forward.");

  const modal=ensureMemoModal();
  injectMemoModalStyles();
  const body=$("memoModalBody");
  $("memoModalTitle").textContent="Forward Selected Memos";
  $("memoModalRef").textContent=`${clean.length} memo${clean.length===1?"":"s"} selected`;
  modal.classList.add("open");
  document.body.classList.add("modalOpen");
  body.innerHTML=`
    <div class="memoBatchForwardNotice"><b>${clean.length}</b> selected memo${clean.length===1?"":"s"} will be forwarded to the same section and personnel.</div>
    <div class="memoPopupActions">
      <div class="memoPopupTwo">
        <div><label for="batchForwardSec">Forward To Section</label><select id="batchForwardSec"><option value="">Select Section</option></select></div>
        <div><label for="batchForwardPerson">Personnel</label><select id="batchForwardPerson"><option value="">Select Personnel</option></select></div>
      </div>
      <label for="batchForwardRemarks">Remarks</label>
      <textarea id="batchForwardRemarks" rows="3" placeholder="Remarks (optional)"></textarea>
      <div class="memoPopupButtons">
        <button type="button" class="memoPopupSecondary" id="batchForwardCancel">Cancel</button>
        <button type="button" class="memoPopupPrimary" id="batchForwardSubmit">Forward ${clean.length} Memo${clean.length===1?"":"s"}</button>
      </div>
    </div>`;

  $("batchForwardCancel").onclick=closeMemoModal;
  const sec=$("batchForwardSec"),person=$("batchForwardPerson");

  try{
    const sections=await api({action:"getSections"});
    (sections.sections||[]).forEach(x=>{
      const o=document.createElement("option");o.value=x;o.textContent=x;sec.appendChild(o);
    });
  }catch(e){toast(e.message);return;}

  sec.onchange=async()=>{
    person.innerHTML='<option value="">Select Personnel</option>';
    if(!sec.value)return;
    try{
      const people=await api({action:"getPersonnel",section:sec.value});
      (people.personnel||[]).forEach(x=>{
        const o=document.createElement("option");o.value=x;o.textContent=x;person.appendChild(o);
      });
    }catch(e){toast(e.message);}
  };

  $("batchForwardSubmit").onclick=async()=>{
    if(!sec.value||!person.value)return toast("Select the section and personnel.");
    const btn=$("batchForwardSubmit");
    btn.disabled=true;
    btn.textContent="Forwarding...";
    try{
      let done=0;
      const remarks=$("batchForwardRemarks").value||"";
      for(const id of clean){
        const result=await apiAction("routeDocument",{id,movement:"FORWARD",section:sec.value,personnel:person.value,remarks});
        if(result?.result==="error")throw new Error(result.error||result.message||`Failed to forward ${id}.`);
        done++;
      }
      selectedMemoIds.clear();
      closeMemoModal();
      toast(`${done} memo${done===1?"":"s"} forwarded successfully.`);
      await dashboard();
      await latestMemos();
    }catch(e){
      toast(e.message);
      btn.disabled=false;
      btn.textContent=`Forward ${clean.length} Memo${clean.length===1?"":"s"}`;
    }
  };
}


function ensureMemoModal(){
  let modal=$("memoModal");
  if(modal)return modal;

  modal=document.createElement("div");
  modal.id="memoModal";
  modal.className="memoModal";
  modal.innerHTML=`
    <div class="memoModalBackdrop" data-modal-close="1"></div>
    <div class="memoModalPanel" role="dialog" aria-modal="true" aria-labelledby="memoModalTitle">
      <div class="memoModalHead">
        <div>
          <div id="memoModalTitle">Document</div>
          <div id="memoModalRef" class="memoModalRef"></div>
        </div>
        <button type="button" class="memoModalClose" data-modal-close="1" aria-label="Close">×</button>
      </div>
      <div id="memoModalBody" class="memoModalBody"></div>
    </div>`;

  document.body.appendChild(modal);

  modal.addEventListener("click",e=>{
    if(e.target.dataset.modalClose==="1")closeMemoModal();
  });

  return modal;
}

function closeMemoModal(){
  const modal=$("memoModal");
  if(!modal)return;
  modal.classList.remove("open");
  document.body.classList.remove("modalOpen");
}

function injectMemoModalStyles(){
  if($("memoModalStyles"))return;

  const style=document.createElement("style");
  style.id="memoModalStyles";
  style.textContent=`
    .memoActions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .memoForward{
      appearance:none;
      border:1px solid #cbd5e1;
      border-radius:10px;
      background:#fff;
      color:#173b67;
      font:inherit;
      font-weight:600;
      padding:9px 16px;
      min-width:86px;
      cursor:pointer;
      transition:background .15s,border-color .15s,transform .05s;
    }
    .memoForward:hover{background:#f4f7fa;border-color:#b8c5d4}
    .memoForward:active{transform:translateY(1px)}
    .memoBatchForwardNotice{padding:12px 14px;border:1px solid #dbe5ef;border-radius:10px;background:#f8fafc;color:#334155;margin-bottom:14px}
    .memoModal{position:fixed;inset:0;z-index:9999;display:none}
    .memoModal.open{display:block}
    .memoModalBackdrop{position:absolute;inset:0;background:rgba(15,23,42,.48)}
    .memoModalPanel{
      position:relative;
      width:min(720px,calc(100% - 28px));
      max-height:calc(100vh - 32px);
      overflow:auto;
      margin:16px auto;
      background:#fff;
      border:1px solid #d9e0e7;
      border-radius:16px;
      box-shadow:0 20px 60px rgba(15,23,42,.28);
    }
    .memoModalHead{
      position:sticky;top:0;z-index:2;
      display:flex;justify-content:space-between;align-items:center;
      gap:16px;padding:18px 20px;
      background:#fff;border-bottom:1px solid #e5e7eb;
    }
    #memoModalTitle{font-size:20px;font-weight:700;color:#173b67}
    .memoModalRef{margin-top:3px;font-size:13px;color:#64748b}
    .memoModalClose{
      width:40px;height:40px;border:1px solid #d1d5db;border-radius:10px;
      background:#fff;color:#334155;font-size:26px;line-height:1;cursor:pointer
    }
    .memoModalBody{padding:20px}
    .memoPopupFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .memoPopupField{border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc}
    .memoPopupField.wide{grid-column:1/-1}
    .memoPopupField label{display:block;font-size:12px;color:#64748b;margin-bottom:4px}
    .memoPopupField b{display:block;color:#0f172a;line-height:1.35}
    .memoPopupHistory{margin-top:18px}
    .memoPopupHistory h3{margin:0 0 10px;color:#173b67}
    .memoPopupMove{padding:11px 0;border-top:1px solid #e5e7eb}
    .memoPopupMove small{display:block;color:#64748b;margin-top:3px}
    .memoPopupActions{margin-top:18px}
    .memoPopupActions label{display:block;font-size:13px;font-weight:600;margin:0 0 6px;color:#334155}
    .memoPopupActions select,.memoPopupActions textarea{
      width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;
      padding:11px 12px;background:#fff;font:inherit
    }
    .memoPopupTwo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .memoPopupButtons{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
    .memoPopupPrimary,.memoPopupSecondary{
      border:1px solid #cbd5e1;border-radius:10px;padding:10px 16px;
      font:inherit;font-weight:600;cursor:pointer
    }
    .memoPopupPrimary{background:#173b67;color:#fff;border-color:#173b67}
    .memoPopupSecondary{background:#fff;color:#173b67}
    @media(max-width:600px){
      .memoModalPanel{width:calc(100% - 18px);margin:9px auto;max-height:calc(100vh - 18px)}
      .memoPopupFields,.memoPopupTwo{grid-template-columns:1fr}
      .memoPopupField.wide{grid-column:auto}
      .memoModalBody{padding:14px}
    }
  `;
  document.head.appendChild(style);
}

function memoPopupFields(d){
  return `
    <div class="memoPopupFields">
      <div class="memoPopupField"><label>Current Section</label><b>${esc(d.currentSection||"Not assigned")}</b></div>
      <div class="memoPopupField"><label>Current Personnel</label><b>${esc(d.currentPersonnel||"Not assigned")}</b></div>
      <div class="memoPopupField"><label>Originating Office</label><b>${esc(d.originatingOffice||"")}</b></div>
      <div class="memoPopupField"><label>Received By</label><b>${esc(d.receivedBy||"")}</b></div>
      <div class="memoPopupField wide"><label>Subject / Title</label><b>${esc(d.subject||"Untitled Memo")}</b></div>
      <div class="memoPopupField"><label>Date Logged</label><b>${esc(d.dateLogged||"")}</b></div>
      <div class="memoPopupField"><label>Action Required</label><b>${esc(d.actionRequired||"")}</b></div>
      <div class="memoPopupField"><label>Date Received</label><b>${esc(d.dateReceived||"")}</b></div>
      <div class="memoPopupField"><label>Status</label><b>${esc(d.routingStatus||d.locationStatus||"Unassigned")}</b></div>
    </div>`;
}

function memoPopupHistory(d){
  const hist=(d.history||[]).map(x=>`
    <div class="memoPopupMove">
      <b>${esc(x.action||"Movement")}</b><br>
      ${esc(x.fromSection||"Initial")} → ${esc(x.toSection||"")}
      <small>${esc(x.personnel||"")} · ${esc(x.dateTime||"")}</small>
      ${x.remarks?`<small>${esc(x.remarks)}</small>`:""}
    </div>`).join("") || '<p class="muted">No movement history.</p>';

  return `<div class="memoPopupHistory"><h3>Movement History</h3>${hist}</div>`;
}

async function openMemoModal(id,mode="view"){
  id=(id||"").trim();
  if(!id)return toast("Control Ref ID is missing.");

  const modal=ensureMemoModal();
  injectMemoModalStyles();
  const body=$("memoModalBody");
  $("memoModalTitle").textContent=mode==="forward"?"Forward Document":"Document Details";
  $("memoModalRef").textContent=id;
  body.innerHTML='<div class="box loading">Loading document...</div>';
  modal.classList.add("open");
  document.body.classList.add("modalOpen");

  try{
    const data=await api({action:"getDocument",id});
    if(!data||data.result==="error"){
      body.innerHTML=`<div class="error">${esc(data?.message||data?.error||"Document not found.")}</div>`;
      return;
    }

    const d=data.document||data;
    current=d;

    if(mode==="view"){
      body.innerHTML=`
        ${memoPopupFields(d)}
        ${d.driveLink?`<div class="docLink" style="margin-top:14px"><a href="${esc(d.driveLink)}" target="_blank" rel="noopener">Open Google Drive File</a></div>`:""}
        ${memoPopupHistory(d)}
      `;
      return;
    }

    body.innerHTML=`
      ${memoPopupFields(d)}
      <div class="memoPopupActions">
        <div class="memoPopupTwo">
          <div>
            <label for="memoPopupSec">Forward To Section</label>
            <select id="memoPopupSec"><option value="">Select Section</option></select>
          </div>
          <div>
            <label for="memoPopupPerson">Personnel</label>
            <select id="memoPopupPerson"><option value="">Select Personnel</option></select>
          </div>
        </div>
        <label for="memoPopupRemarks">Remarks</label>
        <textarea id="memoPopupRemarks" rows="3" placeholder="Remarks (optional)"></textarea>
        <div class="memoPopupButtons">
          <button type="button" class="memoPopupSecondary" id="memoPopupCancel">Cancel</button>
          <button type="button" class="memoPopupPrimary" id="memoPopupSubmit">Forward Document</button>
        </div>
      </div>
    `;

    $("memoPopupCancel").onclick=closeMemoModal;

    const sec=$("memoPopupSec");
    const person=$("memoPopupPerson");

    try{
      const sections=await api({action:"getSections"});
      (sections.sections||[]).forEach(x=>{
        const o=document.createElement("option");
        o.value=x;o.textContent=x;sec.appendChild(o);
      });
    }catch(e){
      toast(e.message);
    }

    sec.onchange=async()=>{
      person.innerHTML='<option value="">Select Personnel</option>';
      if(!sec.value)return;
      try{
        const people=await api({action:"getPersonnel",section:sec.value});
        (people.personnel||[]).forEach(x=>{
          const o=document.createElement("option");
          o.value=x;o.textContent=x;person.appendChild(o);
        });
      }catch(e){
        toast(e.message);
      }
    };

    $("memoPopupSubmit").onclick=async()=>{
      if(!sec.value||!person.value){
        return toast("Select the section and personnel.");
      }

      const btn=$("memoPopupSubmit");
      btn.disabled=true;
      btn.textContent="Forwarding...";

      try{
        const result=await apiAction("routeDocument",{
          id:d.controlRefId,
          movement:"FORWARD",
          section:sec.value,
          personnel:person.value,
          remarks:$("memoPopupRemarks").value||""
        });

        if(result?.result==="error"){
          throw new Error(result.error||result.message||"Movement was not recorded.");
        }

        closeMemoModal();
        toast(result.message||"Document forwarded successfully.");
        await dashboard();
        await latestMemos();
      }catch(e){
        toast(e.message);
        btn.disabled=false;
        btn.textContent="Forward Document";
      }
    };
  }catch(e){
    body.innerHTML=`<div class="error">${esc(e.message)}</div>`;
  }
}

async function loadAllMemos(options={}){
  const target=$("latestMemos");
  if(!target)return;
  target.innerHTML='<div class="box loading">Loading all memos...</div>';
  try{
    const d=await apiAction("getDocuments",{
      limit:5000,
      offset:0,
      sync:options.sync===true ? "true" : "false"
    });
    renderLatestMemos(d);
  }catch(e){
    target.innerHTML=`<div class="error">Unable to load memos: ${esc(e.message)}</div>`;
  }
}

async function latestMemos(){
  return loadAllMemos({sync:false});
}

async function dashboard(){
  try{
    const d=await apiAction("dashboard");
    const m=d.metrics||{};
    $("total").textContent=Number(m.total??0).toLocaleString();
    $("message").textContent=Number(m.messageCenter??0).toLocaleString();
    $("forwarded").textContent=Number(m.forwarded??0).toLocaleString();
    $("completed").textContent=Number(m.completed??0).toLocaleString();
    $("connectionStatus").textContent="Connected to RCD routing database";
    $("connectionStatus").className="connection ok";
  }catch(e){
    $("total").textContent="-";
    $("message").textContent="-";
    $("forwarded").textContent="-";
    $("completed").textContent="-";
    $("connectionStatus").textContent="RCD API unavailable: "+e.message;
    $("connectionStatus").className="connection errorConn";
    console.error("Dashboard API error:",e);
  }
}

document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
$("menu").onclick=()=>document.querySelector("nav").classList.toggle("open");
$("homeTrack").onclick=()=>{page("track");$("trackId").value=$("homeId").value;find($("homeId").value,$("result"))};
$("trackBtn").onclick=()=>find($("trackId").value,$("result"));
$("routeLoad").onclick=()=>find($("routeId").value,$("routeResult"),true);
document.addEventListener("click",e=>{
  if(e.target.id==="receive")move("RECEIVE");
  if(e.target.id==="forward")move("FORWARD");
  if(e.target.id==="complete")move("COMPLETE");
});

window.addEventListener("load",()=>{
  const id=new URLSearchParams(location.search).get("id");
  if(id){
    page("track");
    $("trackId").value=id;
    find(id,$("result"));
  } else {
    dashboard();
    latestMemos();
  }
  $("refreshMemos")?.addEventListener("click",latestMemos);
});

document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    closeMemoModal();
    return;
  }
  if(e.key!=="Enter")return;
  if(document.activeElement===$("homeId")) $("homeTrack").click();
  if(document.activeElement===$("trackId")) $("trackBtn").click();
  if(document.activeElement===$("routeId")) $("routeLoad").click();
});
