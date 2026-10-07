let stream = null;
let audioRecorder = null;
let screenRecorder = null;
let running = false;
let transcript = [];
let latestFrame = null;
let lastTrigger = 0;
let recordParts = [];
let frameTimer = null;

const COOLDOWN = 15000;
const MAX_TRANSCRIPT = 16;
const CHUNK_MS = 5000;

const $ = id => document.getElementById(id);

function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function blobToBase64(blob) {
  return new Promise((resolve,reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function getSettings() {
  return chrome.storage.local.get({
    keyword:"",
    subject:"Spécialité mathématiques",
    apiKey:"",
    model:"gemini-3.5-flash-lite",
    promptTemplate:"",
    recordScreen:true
  });
}

async function callGemini(apiKey, model, instruction, parts) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      system_instruction:{parts:[{text:instruction}]},
      contents:[{role:"user",parts}]
    })
  });

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0,500)}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("").trim() || "";
}

function captureFrame() {
  const video = $("preview");
  if (!video.videoWidth || !video.videoHeight) return null;

  const width = Math.min(1440, video.videoWidth);
  const height = Math.round(width * video.videoHeight / video.videoWidth);

  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  c.getContext("2d").drawImage(video,0,0,width,height);
  latestFrame = c.toDataURL("image/jpeg",0.84);
  return latestFrame;
}

async function transcribe(blob, settings) {
  const audio = await blobToBase64(blob);
  return callGemini(
    settings.apiKey,
    settings.model,
    "Tu es un moteur de sous-titrage. Transcris uniquement ce qui est prononcé dans l'audio. Ne résume pas. Garde les noms propres et les questions. La langue peut être française ou anglaise.",
    [
      {text:"Transcris précisément cet extrait audio. Retourne uniquement le texte."},
      {inline_data:{mime_type:blob.type || "audio/webm",data:audio}}
    ]
  );
}

async function findQuestion(settings) {
  const recent = transcript.slice(-MAX_TRANSCRIPT).join("\n");
  const frame = latestFrame || captureFrame();

  const instruction =
    `Tu es un assistant pour un élève de terminale en cours de ${settings.subject}. ` +
    `Le mot-clé ou prénom "${settings.keyword}" vient d'être détecté dans la transcription. ` +
    `Analyse la transcription récente et la capture de la fenêtre de visio. ` +
    `Identifie la dernière question probablement posée par le professeur. ` +
    `Retourne exactement deux lignes : QUESTION: <question> puis REPONSE: <réponse brève>. ` +
    `Pas d'emoji. Pas de blabla.`;

  const parts = [{text:`Transcription récente :\n${recent}`}];

  if (frame) {
    parts.push({
      inline_data:{
        mime_type:"image/jpeg",
        data:frame.split(",")[1]
      }
    });
  }

  const result = await callGemini(settings.apiKey,settings.model,instruction,parts);
  const q = result.match(/^QUESTION\s*:\s*(.+)$/im);
  const a = result.match(/^REPONSE\s*:\s*([\s\S]+)$/im);

  return {
    question:q ? q[1].trim() : "Question non extraite.",
    answer:a ? a[1].trim() : result,
    screenshot:frame
  };
}

async function trigger(settings) {
  if (Date.now() - lastTrigger < COOLDOWN) return;
  lastTrigger = Date.now();

  $("state").textContent = `« ${settings.keyword} » détecté. Recherche de la question…`;
  $("badge").textContent = "ALERTE";
  $("badge").style.background = "#e22";
  $("badge").style.color = "#fff";
  captureFrame();

  let result = {question:"Question non extraite.",answer:"",screenshot:latestFrame};

  try {
    result = await findQuestion(settings);
  } catch(e) {
    result.answer = `Erreur Gemini : ${e.message}`;
  }

  chrome.runtime.sendMessage({
    type:"KEYWORD_DETECTED",
    keyword:settings.keyword,
    subject:settings.subject,
    question:result.question,
    answer:result.answer,
    screenshot:result.screenshot
  });

  $("state").textContent = `Alerte envoyée pour « ${settings.keyword} ».`;
}

function startScreenRecording() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  const mime = types.find(MediaRecorder.isTypeSupported) || "";

  try {
    screenRecorder = new MediaRecorder(stream,mime ? {mimeType:mime}:undefined);
    recordParts = [];

    screenRecorder.ondataavailable = e => {
      if (e.data?.size) recordParts.push(e.data);
    };

    screenRecorder.onstop = () => {
      if (!recordParts.length) return;
      const blob = new Blob(recordParts,{type:screenRecorder.mimeType || "video/webm"});
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `visio-${Date.now()}.webm`;
      a.textContent = "Enregistrement prêt — cliquer pour sauvegarder";
      a.style.color = "#fff";
      $("recordStatus").replaceChildren(a);
      recordParts = [];
    };

    screenRecorder.start(1000);
    $("recordStatus").textContent = "Enregistrement en cours.";
  } catch(e) {
    $("recordStatus").textContent = `Enregistrement indisponible : ${e.message}`;
  }
}

function stopScreenRecording() {
  if (screenRecorder && screenRecorder.state !== "inactive") screenRecorder.stop();
  screenRecorder = null;
}

async function start() {
  const settings = await getSettings();

  if (!settings.keyword || !settings.apiKey) {
    $("state").textContent = "Configuration incomplète.";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:8,max:12}},
      audio:true
    });

    $("preview").srcObject = stream;
    running = true;

    $("start").disabled = true;
    $("stop").disabled = false;
    $("badge").textContent = "ON";
    $("badge").style.background = "#175";
    $("badge").style.color = "#fff";
    $("state").textContent = `Surveillance active : ${settings.keyword}`;

    frameTimer = setInterval(() => {
      if (running) captureFrame();
    },2500);

    if (settings.recordScreen) startScreenRecording();
    else $("recordStatus").textContent = "Désactivé dans les réglages.";

    const audioTracks = stream.getAudioTracks();

    if (!audioTracks.length) {
      $("state").textContent += " Aucun audio système n'a été partagé.";
    } else {
      const audioStream = new MediaStream(audioTracks);
      audioRecorder = new MediaRecorder(audioStream,{mimeType:"audio/webm;codecs=opus"});

      audioRecorder.ondataavailable = async e => {
        if (!running || !e.data || e.data.size < 1000) return;

        try {
          const text = await transcribe(e.data,settings);
          if (!text) return;

          transcript.push(text);
          if (transcript.length > MAX_TRANSCRIPT) transcript.shift();

          $("transcript").textContent = transcript.slice(-6).join("\n");

          if (normalize(text).includes(normalize(settings.keyword))) {
            await trigger(settings);
          }
        } catch(err) {
          $("state").textContent = `Sous-titrage : ${err.message}`;
        }
      };

      audioRecorder.start(CHUNK_MS);
    }

    stream.getVideoTracks()[0]?.addEventListener("ended",stop);
  } catch(e) {
    $("state").textContent = `Capture refusée/annulée : ${e.message}`;
  }
}

function stop() {
  running = false;
  if (frameTimer) clearInterval(frameTimer);
  frameTimer = null;

  if (audioRecorder && audioRecorder.state !== "inactive") audioRecorder.stop();
  audioRecorder = null;

  stopScreenRecording();

  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;

  $("preview").srcObject = null;
  $("start").disabled = false;
  $("stop").disabled = true;
  $("badge").textContent = "OFF";
  $("badge").style.background = "#272727";
  $("badge").style.color = "#999";
  $("state").textContent = "Surveillance arrêtée.";
}

$("start").onclick = start;
$("stop").onclick = stop;
$("chat").onclick = () => chrome.runtime.sendMessage({type:"OPEN_CHAT"});
