let API_URL=(window.RCD_CONFIG||{}).API_URL||localStorage.getItem("RCD_API_URL")||"/api/rcd";
let current=null,scanner=null,jsonpCounter=0;

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
  scanner=new Html5Qrcode("reader");
  try{
    await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:240}},async text=>{
      try{await scanner.stop();}catch(_){}
      try{scanner.clear();}catch(_){}
      scanner=null;
      let id=text;
      try{id=new URL(text).searchParams.get("id")||text}catch{}
      page("track");$("trackId").value=id;find(id,$("result"));
    },()=>{});
    $("scanStatus").textContent="Point the camera at the QR code.";
  }catch(e){
    $("scanStatus").textContent="Camera access is unavailable. Enter the Control Ref ID manually.";
  }
}

function formatMemoDate(value){
  if(value===undefined||value===null||value==="") return "";
  const d=new Date(value);
  if(!Number.isNaN(d.getTime())) return d.toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"});
  return String(value);
}

function renderLatestMemos(data){
  const target=$("latestMemos");
  if(!target)return;

  if(!data||data.result==="error"){
    target.innerHTML=`<div class="error">${esc(data?.message||data?.error||"Unable to load latest memos.")}</div>`;
    return;
  }

  let rows=Array.isArray(data.documents)?data.documents:[];
  if(!rows.length){
    target.innerHTML='<p class="muted">No memos found.</p>';
    return;
  }

  // Keep newest records first even if the API response order changes.
  rows=rows.map((d,index)=>({...d,__index:index})).sort((a,b)=>{
    const ad=new Date(a.dateLogged||a.dateReceived||a.createdAt||0).getTime();
    const bd=new Date(b.dateLogged||b.dateReceived||b.createdAt||0).getTime();
    if(Number.isFinite(ad)&&Number.isFinite(bd)&&ad!==bd)return bd-ad;
    return a.__index-b.__index;
  }).slice(0,20);

  target.innerHTML=rows.map(d=>`
    <div class="memoItem">
      <div class="memoMain">
        <div class="memoRef">${esc(d.controlRefId||"")}</div>
        <div class="memoSubject">${esc(d.subject||"Untitled Memo")}</div>
        <div class="memoMeta">
          ${esc(d.originatingOffice||"")} ${d.dateLogged?`· ${esc(formatMemoDate(d.dateLogged))}`:""}
        </div>
      </div>
      <div class="memoActions">
        <button class="memoForward" type="button" data-memo-id="${esc(d.controlRefId||"")}" data-memo-action="view">View</button>
        <button class="memoForward" type="button" data-memo-id="${esc(d.controlRefId||"")}" data-memo-action="forward">Forward</button>
        <button class="memoForward" type="button" data-memo-id="${esc(d.controlRefId||"")}" data-memo-action="print">Print Routing Slip</button>
      </div>
    </div>
  `).join("");

  target.querySelectorAll(".memoForward").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.dataset.memoId||"";
      const mode=btn.dataset.memoAction||"view";
      if(mode==="print") printRoutingSlip(id);
      else openMemoModal(id,mode);
    });
  });
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

function buildRoutingSlipHtml(d){
  const received=getReceivedRecord(d);
  const receivedAt=received?.dateTime||d?.dateReceived||d?.dateLogged||"";
  const preparedBy=received?.personnel||received?.receivedBy||d?.receivedBy||d?.currentPersonnel||"";
  const rows=routingSlipRows(d);
  const rowHtml=rows.map(r=>`<tr>
    <td class="nr">${esc(r.nr)}</td>
    <td class="name">${esc(r.name)}</td>
    <td class="initial">${esc(r.initial)}</td>
    <td class="date">${esc(r.date?formatMemoDate(r.date):"")}</td>
    <td class="action">${esc(r.action)}</td>
    <td class="remarks">${esc(r.remarks)}</td>
  </tr>`).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>RCD Routing Slip - ${esc(d?.controlRefId||"")}</title>
<style>
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
  body{width:210mm;min-height:297mm;padding:5mm}
  .sheet{width:134.6mm;height:auto}
  .slip{width:134.6mm;border:1px solid #173b67;font-family:Arial,Helvetica,sans-serif;font-size:8.4pt;line-height:1.08}
  .title{height:6.8mm;background:#073d70;color:#fff;border-bottom:1px solid #000;text-align:center;font-size:13pt;font-weight:700;letter-spacing:.2px;padding:1.0mm 1mm}
  .meta{display:grid;grid-template-columns:1fr 1.03fr}
  .metaLeft,.metaRight{min-height:7mm}
  .metaLeft{border-right:1px solid #000}
  .metaCell{min-height:7mm;border-bottom:1px solid #000;padding:.8mm 1.1mm;font-size:8.5pt}
  .metaCell:last-child{border-bottom:0}
  .metaRight .metaCell{display:flex;align-items:flex-start;gap:1.5mm}
  .metaLabel{font-weight:400;white-space:nowrap}
  .metaValue{font-weight:600;flex:1;overflow-wrap:anywhere}
  .subjectCell{min-height:14mm}
  .blankBand{height:5mm;border-bottom:1px solid #000}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th{background:#073d70;color:#fff;font-size:9.5pt;font-weight:700;text-align:center;padding:1.5mm 1mm;border-right:1px solid #fff;border-bottom:1px solid #000}
  th:last-child{border-right:0}
  td{height:5.5mm;border-right:1px solid #000;border-bottom:1px solid #000;padding:.7mm 1.2mm;vertical-align:middle;overflow-wrap:anywhere}
  td:last-child{border-right:0}
  .nr{width:8mm;text-align:center}
  .name{width:42mm;font-size:8.8pt}
  .initial{width:15mm;text-align:center;font-size:7.5pt}
  .date{width:16mm;text-align:center;font-size:6.8pt}
  .action{width:26mm;text-align:center;font-size:7.2pt}
  .remarks{width:27.6mm;font-size:7pt}
  .bottom{display:grid;grid-template-columns:1fr 48mm;min-height:19mm}
  .legend{border-right:1px solid #000;padding:1.8mm 3mm 1.2mm;font-size:5.5pt;line-height:1.35}
  .legendGrid{display:grid;grid-template-columns:1fr 1fr;gap:0 3mm}
  .legendTitle{text-align:center;font-weight:700;font-size:6pt;margin-bottom:1mm}
  .legendFooter{text-align:center;margin-top:1mm;font-size:5pt}
  .bottomBlank{display:grid;grid-template-rows:repeat(4,1fr)}
  .bottomBlank div{border-bottom:1px solid #000}
  .bottomBlank div:last-child{border-bottom:0}
  .printNote{display:none}
  @media print{body{padding:5mm}.slip{break-inside:avoid}}
</style></head><body>
<div class="sheet"><div class="slip">
  <div class="title">RCD ROUTING SLIP</div>
  <div class="meta">
    <div class="metaLeft">
      <div class="metaCell subjectCell"><span class="metaLabel">Subject:</span> <span class="metaValue">${esc(d?.subject||"")}</span></div>
      <div class="metaCell"><span class="metaLabel">Control No.:</span> <span class="metaValue">${esc(d?.controlRefId||"")}</span></div>
    </div>
    <div class="metaRight">
      <div class="metaCell"><span class="metaLabel">Date:</span> <span class="metaValue">${esc(printRoutingSlipDate(receivedAt))}</span></div>
      <div class="metaCell"><span class="metaLabel">Time In:</span> <span class="metaValue">${esc(printRoutingSlipTime(receivedAt))}</span></div>
      <div class="metaCell"><span class="metaLabel">Prepared by:</span> <span class="metaValue">${esc(preparedBy)}</span></div>
    </div>
  </div>
  <div class="blankBand"></div>
  <table><thead><tr>
    <th class="nr">NR</th><th class="name">INITIAL</th><th class="date">DATE</th><th class="action">ACTION REQUESTED</th><th class="remarks">REMARKS / COMMENTS</th>
  </tr></thead><tbody>${rowHtml}</tbody></table>
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
</div></div>
<script>
  window.addEventListener('load',()=>setTimeout(()=>window.print(),250));
  window.addEventListener('afterprint',()=>window.close());
</script>
</body></html>`;
}

async function printRoutingSlip(id){
  id=(id||"").trim();
  if(!id)return toast("Control Ref ID is missing.");
  const win=window.open("","_blank","width=900,height=900,noopener,noreferrer");
  if(!win){
    toast("Please allow pop-ups to print the routing slip.");
    return;
  }
  win.document.write('<!doctype html><html><body style="font-family:Arial;padding:20px">Loading routing slip...</body></html>');
  win.document.close();
  try{
    const data=await api({action:"getDocument",id});
    if(!data||data.result==="error")throw new Error(data?.message||data?.error||"Document not found.");
    const d=data.document||data;
    win.document.open();
    win.document.write(buildRoutingSlipHtml(d));
    win.document.close();
  }catch(e){
    win.document.body.innerHTML=`<div style="font-family:Arial;color:#b91c1c;padding:20px">Unable to print routing slip: ${esc(e.message)}</div>`;
  }
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

async function latestMemos(){
  const target=$("latestMemos");
  if(!target)return;
  target.innerHTML='<div class="box loading">Loading latest memos...</div>';
  try{
    const d=await apiAction("getDocuments",{limit:20});
    renderLatestMemos(d);
  }catch(e){
    target.innerHTML=`<div class="error">Unable to load latest memos: ${esc(e.message)}</div>`;
  }
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
