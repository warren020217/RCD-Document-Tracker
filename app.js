let API_URL=(window.RCD_CONFIG||{}).API_URL||localStorage.getItem("RCD_API_URL")||"";
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
  let hist=(d.history||[]).map(x=>`<div class="move"><b>${esc(x.action)}</b><br>${esc(x.fromSection||"Initial")} → ${esc(x.toSection||"")}<small>${esc(x.personnel||"")} · ${esc(x.dateTime||"")}</small>${x.remarks?`<small>${esc(x.remarks)}</small>`:""}</div>`).join("")||'<p class="muted">No movement history.</p>';

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
    // Confirmed Apps Script deployment exposes routeDocument.
    // Keep all movement operations on this stable API contract.
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
  }
});

document.addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;
  if(document.activeElement===$("homeId")) $("homeTrack").click();
  if(document.activeElement===$("trackId")) $("trackBtn").click();
  if(document.activeElement===$("routeId")) $("routeLoad").click();
});
