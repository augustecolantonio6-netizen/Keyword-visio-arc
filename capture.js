let stream=null;
let videoTrack=null;
let audioContext=null;
let sourceNode=null;
let processorNode=null;
let gainNode=null;
let ws=null;
let wsReady=false;
let liveReconnectTimer=null;
let sessionRefreshTimer=null;
let running=false;
let keywordCooldownUntil=0;
let transcriptFinal=[];
let interimText="";
let currentSpeechForTrigger="";
let pcmBuffer=[];
let lastFrameDataUrl=null;
let mediaRecorder=null;
let recordingParts=[];

const SESSION_MS=9*60*1000;
const KEYWORD_COOLDOWN_MS=12000;
const OUT_RATE=16000;
const TARGET_PCS_SAMPLES=1600;

const $=id=>document.getElementById(id);

function normalize(s){
  return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}

function sendStatus(status,ok=running){
  chrome.runtime.sendMessage({
    type:"CAPTURE_STATUS",
    running:ok,
    status
  }).catch(()=>{});
}

async function settings(){
  return chrome.storage.local.get({
    keyword:"",
    subject:"Spécialité mathématiques",
    apiKey:"",
    model:"gemini-3.5-flash-lite",
    language:"",
    promptTemplate:"",
    recordScreen:false
  });
}

function showTranscript(){
  $("finalTranscript").textContent=transcriptFinal.slice(-12).join("\n");
  $("interimTranscript").textContent=interimText;
}

function b64FromInt16(int16){
  const bytes=new Uint8Array(int16.buffer,int16.byteOffset,int16.byteLength);
  let binary="";
  const step=0x8000;
  for(let i=0;i<bytes.length;i+=step){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
  }
  return btoa(binary);
}

function downsampleTo16k(float32,inputRate){
  if(inputRate===OUT_RATE){
    const out=new Int16Array(float32.length);
    for(let i=0;i<float32.length;i++){
      const x=Math.max(-1,Math.min(1,float32[i]));
      out[i]=x<0?x*32768:x*32767;
    }
    return out;
  }

  const ratio=inputRate/OUT_RATE;
  const length=Math.floor(float32.length/ratio);
  const out=new Int16Array(length);

  for(let i=0;i<length;i++){
    const pos=i*ratio;
    const left=Math.floor(pos);
    const right=Math.min(left+1,float32.length-1);
    const frac=pos-left;
    const sample=float32[left]*(1-frac)+float32[right]*frac;
    const x=Math.max(-1,Math.min(1,sample));
    out[i]=x<0?x*32768:x*32767;
  }
  return out;
}

function enqueuePCM(int16){
  for(let i=0;i<int16.length;i++) pcmBuffer.push(int16[i]);

  while(pcmBuffer.length>=TARGET_PCS_SAMPLES){
    if(wsReady && ws && ws.readyState===WebSocket.OPEN){
      const chunk=new Int16Array(pcmBuffer.splice(0,TARGET_PCS_SAMPLES));
      ws.send(JSON.stringify({
        realtimeInput:{
          audio:{
            data:b64FromInt16(chunk),
            mimeType:"audio/pcm;rate=16000"
          }
        }
      }));
    }else{
      pcmBuffer.splice(0,TARGET_PCS_SAMPLES);
    }
  }
}

function checkKeyword(text){
  const s=awaitSettingsCache;
  const word=normalize(s.keyword);
  if(!word || !text) return false;

  const hay=normalize(text).replace(/\s+/g," ");
  const target=word.replace(/\s+/g," ");

  return hay.includes(target);
}

let awaitSettingsCache={keyword:"",subject:"",apiKey:"",model:"",language:"",promptTemplate:"",recordScreen:false};

function scheduleSessionRefresh(){
  clearTimeout(sessionRefreshTimer);
  sessionRefreshTimer=setTimeout(()=>{
    if(running) reconnectLive();
  },SESSION_MS);
}

function connectLive(){
  clearTimeout(liveReconnectTimer);
  if(!running) return;

  wsReady=false;
  ws=new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(awaitSettingsCache.apiKey)}`
  );

  ws.onopen=()=>{
    const languageCodes=awaitSettingsCache.language
      ? [awaitSettingsCache.language]
      : [];

    ws.send(JSON.stringify({
      setup:{
        model:"models/gemini-3.5-transcribe-live",
        generationConfig:{responseModalities:["TEXT"]},
        inputAudioTranscription:{
          languageCodes,
          mode:"VERBATIM",
          customVocabulary:[awaitSettingsCache.keyword].filter(Boolean)
        }
      }
    }));

    scheduleSessionRefresh();
    sendStatus("Connexion Live ouverte… attente de setupComplete.");
  };

  ws.onmessage=event=>{
    let data;
    try{data=JSON.parse(event.data)}catch{return}

    if(data.setupComplete){
      wsReady=true;
      sendStatus("Sous-titres Live actifs.");
      return;
    }

    const c=data.serverContent;
    if(!c) return;

    if(c.interimInputTranscription){
      interimText=c.interimInputTranscription.text||"";
      showTranscript();

      const combined=(currentSpeechForTrigger+" "+interimText).trim();
      if(checkKeyword(combined)){
        triggerKeyword(awaitSettingsCache).catch(e=>sendStatus("Détection : "+e.message));
      }
    }

    if(c.inputTranscription){
      const final=c.inputTranscription.text||"";
      if(final){
        transcriptFinal.push(final);
        if(transcriptFinal.length>30) transcriptFinal.shift();
        currentSpeechForTrigger=(currentSpeechForTrigger+" "+final).trim().slice(-1000);
        interimText="";
        showTranscript();

        if(checkKeyword(final)||checkKeyword(currentSpeechForTrigger)){
          triggerKeyword(awaitSettingsCache).catch(e=>sendStatus("Détection : "+e.message));
          currentSpeechForTrigger="";
        }
      }
    }
  };

  ws.onerror=()=>{
    wsReady=false;
    sendStatus("Erreur de connexion Live. Reconnexion…");
  };

  ws.onclose=()=>{
    wsReady=false;
    if(running){
      clearTimeout(liveReconnectTimer);
      liveReconnectTimer=setTimeout(connectLive,1200);
      sendStatus("Session Live fermée. Reconnexion…");
    }
  };
}

function reconnectLive(){
  if(ws){
    try{ws.close()}catch{}
  }
  ws=null;
  wsReady=false;
  connectLive();
}

async function captureFrame(){
  if(!videoTrack) return null;

  try{
    if("ImageCapture" in window){
      const ic=new ImageCapture(videoTrack);
      const bitmap=await ic.grabFrame();
      const canvas=document.createElement("canvas");
      canvas.width=Math.min(1440,bitmap.width);
      canvas.height=Math.round(canvas.width*bitmap.height/bitmap.width);
      canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close?.();
      lastFrameDataUrl=canvas.toDataURL("image/jpeg",.84);
      return lastFrameDataUrl;
    }
  }catch{}

  try{
    const v=$("preview");
    if(!v.videoWidth) return null;
    const c=document.createElement("canvas");
    c.width=Math.min(1440,v.videoWidth);
    c.height=Math.round(c.width*v.videoHeight/v.videoWidth);
    c.getContext("2d").drawImage(v,0,0,c.width,c.height);
    lastFrameDataUrl=c.toDataURL("image/jpeg",.84);
    return lastFrameDataUrl;
  }catch{
    return null;
  }
}

async function triggerKeyword(settings){
  if(Date.now()<keywordCooldownUntil) return;
  keywordCooldownUntil=Date.now()+KEYWORD_COOLDOWN_MS;

  await captureFrame();

  // Keep enough recent context to identify the question, including the live interim text.
  const recent=[...transcriptFinal.slice(-10)];
  if(interimText) recent.push(interimText);

  const questionContext=recent.join("\n");

  chrome.runtime.sendMessage({
    type:"KEYWORD_DETECTED",
    payload:{
      keyword:settings.keyword,
      subject:settings.subject,
      question:questionContext || "Question à identifier dans les sous-titres.",
      screenshot:lastFrameDataUrl,
      transcript:questionContext
    }
  }).catch(()=>{});
}

function startRecording(){
  if(!awaitSettingsCache.recordScreen) return;
  if(!stream || mediaRecorder) return;

  const mime=[
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ].find(MediaRecorder.isTypeSupported)||"";

  try{
    mediaRecorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    recordingParts=[];
    mediaRecorder.ondataavailable=e=>{
      if(e.data?.size) recordingParts.push(e.data);
    };
    mediaRecorder.onstop=()=>{
      if(!recordingParts.length){
        mediaRecorder=null;
        return;
      }

      const blob=new Blob(recordingParts,{type:mediaRecorder.mimeType||"video/webm"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=`visio-${new Date().toISOString().replace(/[:.]/g,"-")}.webm`;
      a.textContent="Enregistrement prêt — cliquer pour sauvegarder";
      a.style.cssText="color:#fff;display:block;margin-top:6px";
      $("status").appendChild(a);
      recordingParts=[];
      mediaRecorder=null;
    };
    mediaRecorder.start(1000);
  }catch(e){
    sendStatus("Enregistrement indisponible : "+e.message);
  }
}

function stopRecording(){
  if(mediaRecorder && mediaRecorder.state!=="inactive"){
    mediaRecorder.stop();
  }else{
    mediaRecorder=null;
  }
}

async function startCapture(){
  const s=await settings();
  awaitSettingsCache=s;

  if(!s.keyword){
    sendStatus("Configure d'abord un mot/prénom.",false);
    return;
  }
  if(!s.apiKey){
    sendStatus("Configure d'abord la clé Gemini.",false);
    return;
  }

  try{
    stream=await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:8,max:12}},
      audio:true
    });

    videoTrack=stream.getVideoTracks()[0]||null;
    $("preview").srcObject=stream;
    running=true;
    transcriptFinal=[];
    interimText="";
    currentSpeechForTrigger="";
    pcmBuffer=[];
    showTranscript();

    $("start").disabled=true;
    $("stop").disabled=false;
    $("minimize").disabled=false;
    $("badge").textContent="ON";
    $("badge").style.background="#175";
    $("badge").style.color="#fff";
    $("state").textContent=`Surveillance de « ${s.keyword} » active.`;

    const audioTracks=stream.getAudioTracks();
    if(!audioTracks.length){
      sendStatus("Vidéo capturée mais aucun audio système n'a été partagé. Relance la sélection en activant « partager l'audio ».");
    }else{
      audioContext=new AudioContext();
      await audioContext.resume();

      sourceNode=audioContext.createMediaStreamSource(new MediaStream(audioTracks));
      processorNode=audioContext.createScriptProcessor(2048,1,1);

      gainNode=audioContext.createGain();
      gainNode.gain.value=0;

      processorNode.onaudioprocess=e=>{
        if(!running) return;
        const input=e.inputBuffer.getChannelData(0);
        enqueuePCM(downsampleTo16k(input,audioContext.sampleRate));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      connectLive();
      startRecording();
    }

    // Minimize the controller after the user has selected the source.
    setTimeout(async()=>{
      try{
        const w=await chrome.windows.getCurrent();
        if(w.id!=null) await chrome.windows.update(w.id,{state:"minimized"});
      }catch{}
    },250);

    stream.getTracks().forEach(track=>{
      track.addEventListener("ended",()=>stopCapture("La capture a été arrêtée par Windows ou par l'utilisateur."));
    });

  }catch(e){
    sendStatus("Capture annulée/refusée : "+e.message,false);
  }
}

function stopCapture(reason="Surveillance arrêtée."){
  running=false;
  clearTimeout(liveReconnectTimer);
  clearTimeout(sessionRefreshTimer);
  liveReconnectTimer=null;
  sessionRefreshTimer=null;

  if(ws){
    try{
      if(ws.readyState===WebSocket.OPEN){
        ws.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}));
      }
      ws.close();
    }catch{}
  }
  ws=null;
  wsReady=false;

  if(processorNode) processorNode.onaudioprocess=null;
  try{sourceNode?.disconnect()}catch{}
  try{processorNode?.disconnect()}catch{}
  try{gainNode?.disconnect()}catch{}
  sourceNode=null;
  processorNode=null;
  gainNode=null;

  if(audioContext){
    audioContext.close().catch(()=>{});
    audioContext=null;
  }

  stopRecording();

  if(stream) stream.getTracks().forEach(t=>t.stop());
  stream=null;
  videoTrack=null;
  $("preview").srcObject=null;

  $("start").disabled=false;
  $("stop").disabled=true;
  $("minimize").disabled=true;
  $("badge").textContent="OFF";
  $("badge").style.background="#272727";
  $("badge").style.color="#999";
  $("state").textContent=reason;
  sendStatus(reason,false);
}

$("start").onclick=startCapture;
$("stop").onclick=()=>stopCapture();
$("minimize").onclick=async()=>{
  try{
    const w=await chrome.windows.getCurrent();
    if(w.id!=null) await chrome.windows.update(w.id,{state:"minimized"});
  }catch{}
};

chrome.runtime.onMessage.addListener(msg=>{
  if(msg?.type==="CAPTURE_STOP") stopCapture();
});

window.addEventListener("beforeunload",()=>{
  if(running) stopCapture("Le contrôleur a été fermé.");
});
