const DEFAULT_PROMPT=\`Je suis en terminale en cours de {{subject}} en visio.
Voici la dernière question détectée :
{{question}}

Explique brièvement la question et les notions utiles.
Réponse compacte. Pas de smiley.\`;

const $=id=>document.getElementById(id);

async function load(){
  const s=await chrome.storage.local.get({
    keyword:"",
    subject:"Spécialité mathématiques",
    apiKey:"",
    model:"gemini-3.5-flash-lite",
    language:"",
    promptTemplate:DEFAULT_PROMPT,
    recordScreen:false
  });

  for(const id of ["keyword","subject","apiKey","model","language","promptTemplate"]){
    $(id).value=s[id];
  }
  $("recordScreen").checked=!!s.recordScreen;

  const state=await chrome.storage.local.get({captureRunning:false,captureStatus:""});
  $("status").textContent=state.captureRunning
    ? `● Surveillance active — ${state.captureStatus}`
    : "○ Surveillance arrêtée";
}

async function save(){
  await chrome.storage.local.set({
    keyword:$("keyword").value.trim(),
    subject:$("subject").value,
    apiKey:$("apiKey").value.trim(),
    model:$("model").value.trim()||"gemini-3.5-flash-lite",
    language:$("language").value,
    promptTemplate:$("promptTemplate").value.trim()||DEFAULT_PROMPT,
    recordScreen:$("recordScreen").checked
  });
  $("status").textContent="Réglages enregistrés.";
}

$("save").onclick=save;

$("chat").onclick=async()=>{
  await save();
  chrome.runtime.sendMessage({type:"OPEN_CHAT"});
  window.close();
};

$("start").onclick=async()=>{
  await save();
  const s=await chrome.storage.local.get(["keyword","apiKey"]);
  if(!s.keyword||!s.apiKey){
    $("status").textContent="Renseigne le mot/prénom et la clé API.";
    return;
  }
  $("status").textContent="Ouverture du contrôleur…";
  chrome.runtime.sendMessage({type:"OPEN_CAPTURE_CONTROLLER"});
  window.close();
};

$("stop").onclick=()=>{
  chrome.runtime.sendMessage({type:"STOP_CAPTURE"});
};

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==="CAPTURE_STATUS"){
    $("status").textContent=msg.running
      ? `● Surveillance active — ${msg.status||""}`
      : `○ ${msg.status||"Surveillance arrêtée"}`;
  }
});

load();
