const DEFAULT_PROMPT="Je suis en terminale en cours de {{subject}}.\nVoici la dernière question ou le passage transcrit :\n{{question}}\n\nAide-moi à comprendre ce qui est demandé. Explique brièvement les notions essentielles et la démarche de réflexion, sans rédiger une réponse à réciter. Si la transcription est ambiguë, précise-le. Réponse concise. Pas de smileys.";

const LEGACY_PROMPTS=["Je suis en terminale en cours de {{subject}} en visio.\nVoici la dernière question détectée :\n{{question}}\n\nExplique brièvement la question et les notions utiles.\nRéponse compacte. Pas de smiley.","Je suis en terminale en cours de {{subject}} en visio.\nJe n'ai pas écouté correctement le passage et le professeur vient de me poser cette question :\n{{question}}\n\nRéponds de façon humaine et brève pour m'aider à comprendre quoi répondre.\nPas de tirets. Pas de virgules. Pas de smiley.\nFais un petit texte compact.","Je suis en terminale en cours de {{subject}}.\nVoici la dernière question ou le passage transcrit :\n{{question}}\n\nAide-moi à comprendre ce qui est demandé. Explique brièvement les notions essentielles, puis propose une formulation orale courte que je pourrai reformuler avec mes propres mots. Reste naturel, clair et adapté au niveau terminale. Si la transcription est ambiguë, précise-le. Pas de smileys."];

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

  const normalizePrompt=value=>(value||"").replace(/\s+/g," ").trim();
  const savedPrompt=normalizePrompt(s.promptTemplate);
  if(!savedPrompt||LEGACY_PROMPTS.some(old=>normalizePrompt(old)===savedPrompt)){
    s.promptTemplate=DEFAULT_PROMPT;
    await chrome.storage.local.set({promptTemplate:DEFAULT_PROMPT});
  }

  $("keyword").value=s.keyword;
  $("subject").value=s.subject;
  $("apiKey").value=s.apiKey;
  $("model").value=s.model;
  $("language").value=s.language;
  $("promptTemplate").value=s.promptTemplate;
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
  try{
    const result=await chrome.runtime.sendMessage({type:"OPEN_CHAT"});
    if(!result?.ok) throw new Error(result?.error||"Impossible d’ouvrir le tableau.");
    window.close();
  }catch(e){
    $("status").textContent="Ouverture impossible : "+e.message;
  }
};

$("start").onclick=async()=>{
  await save();
  const s=await chrome.storage.local.get(["keyword","apiKey"]);
  if(!s.keyword||!s.apiKey){
    $("status").textContent="Renseigne le mot/prénom et la clé API.";
    return;
  }

  $("status").textContent="Ouverture du tableau…";
  try{
    const result=await chrome.runtime.sendMessage({type:"OPEN_CAPTURE_CONTROLLER"});
    if(!result?.ok) throw new Error(result?.error||"Impossible d’ouvrir le tableau.");
    window.close();
  }catch(e){
    $("status").textContent="Ouverture impossible : "+e.message;
  }
};

$("stop").onclick=()=>{
  chrome.runtime.sendMessage({type:"STOP_CAPTURE"});
  $("status").textContent="Arrêt demandé.";
};

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==="CAPTURE_STATUS"){
    $("status").textContent=msg.running
      ? `● Surveillance active — ${msg.status||""}`
      : `○ ${msg.status||"Surveillance arrêtée"}`;
  }
});

load();
