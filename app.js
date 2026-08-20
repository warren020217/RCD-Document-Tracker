let API_URL=(window.RCD_CONFIG||{}).API_URL||localStorage.getItem("RCD_API_URL")||"";
let current=null,scanner=null,jsonpCounter=0;

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");

function api(params={}) {
  return new Promise((resolve,reject)=>{
    if(!API_URL) return reject(new Error("Google Apps Script API URL is missing."));
    const cb="rcdApiCallback_"+(++jsonpCounter)+"_"+Date.now();
    const script=document.createElement("script");
    const u=new URL(API_URL);
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    u.searchParams.set("callback",cb);
    let done=false;
    const cleanup=()=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error("Google Sheet connection timed out. Check the Apps Script Web App deployment and access setting."));
    },20000);
    window[cb]=(data)=>{
      cleanup();
      if(data?.result==="error") reject(new Error(data.error||data.message||"Google Apps Script error."));
      else resolve(data);
    };
    script.onerror=()=>{
      cleanup();
      reject(new Error("Cannot connect to the Google Apps Script Web App."));
    };
    script.src=u.toString();
    document.body.appendChild(script);
  });
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
  if(type!=="COMPLETE"&&(!s||!p))return toast("Select the section and personnel.");
  try{
    let d=await api({action:"routeDocument",id,movement:type,section:s,personnel:p,remarks:r});
    toast(d.message||"Saved");
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
    let d=await api({action:"dashboard"}),m=d.metrics||{};
    $("total").textContent=m.total??0;
    $("message").textContent=m.messageCenter??0;
    $("forwarded").textContent=m.forwarded??0;
    $("completed").textContent=m.completed??0;
    $("connectionStatus").textContent="Connected to RCD routing database";
    $("connectionStatus").className="connection ok";
  }catch(e){
    $("total").textContent="-";
    $("message").textContent="-";
    $("forwarded").textContent="-";
    $("completed").textContent="-";
    $("connectionStatus").textContent="Database connection unavailable";
    $("connectionStatus").className="connection errorConn";
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
