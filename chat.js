let subject = "Spécialité mathématiques";
let promptTemplate = "";
let question = "";
let screenshot = null;
let keyword = "";
let history = [];
let lastEventTs = 0;

const DEFAULT_PROMPT="Je suis en terminale en cours de {{subject}}.\nVoici la dernière question ou le passage transcrit :\n{{question}}\n\nAide-moi à comprendre ce qui est demandé. Explique brièvement les notions essentielles, puis propose une formulation orale courte que je pourrai reformuler avec mes propres mots. Reste naturel, clair et adapté au niveau terminale. Si la transcription est ambiguë, précise-le. Pas de smileys.";

const LEGACY_PROMPTS=["Je suis en terminale en cours de {{subject}} en visio.\nVoici la dernière question détectée :\n{{question}}\n\nExplique brièvement la question et les notions utiles.\nRéponse compacte. Pas de smiley.","Je suis en terminale en cours de {{subject}} en visio.\nJe n'ai pas écouté correctement le passage et le professeur vient de me poser cette question :\n{{question}}\n\nRéponds de façon humaine et brève pour m'aider à comprendre quoi répondre.\nPas de tirets. Pas de virgules. Pas de smiley.\nFais un petit texte compact."];

const $ = id => document.getElementById(id);

async function settings() {
  const s=await chrome.storage.local.get({
    subject:"Spécialité mathématiques",
    apiKey:"",
    model:"gemini-3.5-flash-lite",
    promptTemplate:DEFAULT_PROMPT
  });
  const normalizePrompt=value=>(value||"").replace(/\s+/g," ").trim();
  const savedPrompt=normalizePrompt(s.promptTemplate);
  if(!savedPrompt||LEGACY_PROMPTS.some(old=>normalizePrompt(old)===savedPrompt)){
    s.promptTemplate=DEFAULT_PROMPT;
    await chrome.storage.local.set({promptTemplate:DEFAULT_PROMPT});
  }
  return s;
}

function renderPrompt() {
  $("promptPreview").textContent =
    (promptTemplate || DEFAULT_PROMPT)
      .replaceAll("{{subject}}",subject)
      .replaceAll("{{question}}",question || "[question à venir]");
}

function add(role,text,image=null) {
  const d = document.createElement("div");
  d.className = `msg ${role}`;
  d.textContent = text;

  if (image) {
    const img = document.createElement("img");
    img.className = "shot";
    img.src = image;
    img.alt = "Capture de la visio";
    d.appendChild(img);
  }

  $("messages").appendChild(d);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function callGemini(s,instruction,contents) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent?key=${encodeURIComponent(s.apiKey)}`;

  const res = await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      system_instruction:{parts:[{text:instruction}]},
      contents
    })
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0,500)}`);

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim() || "";
}

async function newEvent(p) {
  if (!p) return;
  if (p.ts && p.ts <= lastEventTs) return;
  if (p.ts) lastEventTs = p.ts;
  if (p.subject) subject = p.subject;
  if (p.keyword) keyword = p.keyword;
  if (p.question) question = p.question;
  if (p.screenshot) screenshot = p.screenshot;

  $("meta").textContent = `${keyword ? "Mot : " + keyword + " · " : ""}${subject}`;
  renderPrompt();

  if (p.question) add("system",`Dernière question détectée : ${p.question}`);
  if (p.screenshot) add("system","Capture de la fenêtre de visio jointe au contexte.",p.screenshot);
  if (p.answer) {
    add("ai",p.answer);
    history.push({role:"model",parts:[{text:p.answer}]});
  }
}

async function send(text) {
  const value = text.trim();
  if (!value) return;

  const s = await settings();
  subject = s.subject;
  promptTemplate = s.promptTemplate || DEFAULT_PROMPT;

  add("user",value);
  $("input").value = "";

  const instruction =
    (promptTemplate || DEFAULT_PROMPT)
      .replaceAll("{{subject}}",subject)
      .replaceAll("{{question}}",question || value);

  const contents = [];

  if (question) {
    contents.push({
      role:"user",
      parts:[{text:`Question détectée : ${question}`}, ...(screenshot ? [{
        inline_data:{mime_type:"image/jpeg",data:screenshot.split(",")[1]}
      }] : [])]
    });
  }

  contents.push(...history);
  contents.push({role:"user",parts:[{text:value}]});

  try {
    const answer = await callGemini(s,instruction,contents);
    add("ai",answer || "Réponse vide.");
    history.push({role:"user",parts:[{text:value}]});
    history.push({role:"model",parts:[{text:answer || ""}]});
  } catch(e) {
    add("ai",`Erreur : ${e.message}`);
  }
}

async function init() {
  const s = await settings();
  subject = s.subject;
  promptTemplate = s.promptTemplate || DEFAULT_PROMPT;
  renderPrompt();

  const stored = await chrome.storage.local.get({
    pendingChatEvent:null,
    chatBootstrap:null,
    lastEvent:null
  });

  const candidates=[stored.pendingChatEvent,stored.chatBootstrap,stored.lastEvent]
    .filter(Boolean)
    .sort((a,b)=>(b.ts||0)-(a.ts||0));

  if(candidates[0]){
    await newEvent(candidates[0]);
    await chrome.storage.local.remove(["pendingChatEvent","chatBootstrap"]);
  }
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === "CHAT_EVENT") newEvent(msg.payload || {});

  if (msg?.type === "LIVE_TRANSCRIPT") {
    const finalEl=document.getElementById("liveFinal");
    const interimEl=document.getElementById("liveInterim");
    if(finalEl) finalEl.textContent=msg.transcript||"";
    if(interimEl) interimEl.textContent=msg.interim||"";
  }
});

$("form").onsubmit = e => {
  e.preventDefault();
  send($("input").value);
};

$("clear").onclick = () => {
  history = [];
  question = "";
  screenshot = null;
  $("messages").innerHTML = "";
  renderPrompt();
};

$("voice").onclick = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    add("ai","La reconnaissance vocale n'est pas disponible dans cette version d'Arc.");
    return;
  }

  const r = new Recognition();
  r.lang = "fr-FR";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = e => {
    $("input").value = e.results[0][0].transcript;
    $("input").focus();
  };
  r.onerror = e => add("ai",`Voix : ${e.error}`);
  r.start();
};

init();
