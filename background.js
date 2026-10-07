const ALERT_URL=chrome.runtime.getURL("alert.html");
const CHAT_URL=chrome.runtime.getURL("chat.html");
const CAPTURE_URL=chrome.runtime.getURL("capture.html");

let openingChat=null;
let openingCapture=null;

chrome.runtime.onMessage.addListener((message)=>{
  if(message?.type==="OPEN_CHAT") openChat(message.payload||{});
  if(message?.type==="OPEN_CAPTURE_CONTROLLER") openCaptureController();
  if(message?.type==="STOP_CAPTURE") chrome.runtime.sendMessage({type:"CAPTURE_STOP"}).catch(()=>{});

  if(message?.type==="CAPTURE_STATUS"){
    chrome.storage.local.set({
      captureRunning:!!message.running,
      captureStatus:message.status||""
    });
    chrome.runtime.sendMessage(message).catch(()=>{});
  }

  if(message?.type==="LIVE_TRANSCRIPT"){
    chrome.storage.local.set({
      liveTranscript:message.transcript||"",
      liveInterim:message.interim||"",
      liveTs:Date.now()
    });
    chrome.runtime.sendMessage(message).catch(()=>{});
  }

  if(message?.type==="KEYWORD_DETECTED"){
    handleKeyword(message.payload||{});
  }
});

async function openCaptureController(){
  if(openingCapture) return openingCapture;

  openingCapture=(async()=>{
    const wins=await chrome.windows.getAll({populate:true});
    const found=wins.find(w=>w.tabs?.some(t=>t.url?.startsWith(CAPTURE_URL)));

    if(found){
      await chrome.windows.update(found.id,{focused:true,state:"normal"});
      return;
    }

    await chrome.windows.create({
      url:CAPTURE_URL,
      type:"popup",
      width:470,
      height:360,
      focused:true
    });
  })();

  try{return await openingCapture;}
  finally{openingCapture=null;}
}

async function openChat(payload={}){
  const event={...payload,ts:Date.now()};
  await chrome.storage.local.set({chatBootstrap:event});

  if(openingChat) return openingChat;
  openingChat=(async()=>{
    const wins=await chrome.windows.getAll({populate:true});
    const found=wins.find(w=>w.tabs?.some(t=>t.url?.startsWith(CHAT_URL)));

    if(!found){
      await chrome.windows.create({
        url:CHAT_URL,
        type:"popup",
        width:500,
        height:780,
        focused:false
      });
    }
  })();

  try{return await openingChat;}
  finally{openingChat=null;}
}

async function handleKeyword(payload){
  const event={...payload,ts:Date.now()};
  await chrome.storage.local.set({lastEvent:event});

  try{
    await chrome.notifications.create(`keyword-${Date.now()}`,{
      type:"basic",
      iconUrl:chrome.runtime.getURL("icons/icon128.png"),
      title:`Mot détecté : ${payload.keyword||"mot-clé"}`,
      message:payload.question||"Mot-clé détecté.",
      priority:2,
      requireInteraction:true
    });
  }catch{}

  try{
    const url=ALERT_URL+
      `?keyword=${encodeURIComponent(payload.keyword||"")}`+
      `&question=${encodeURIComponent(payload.question||"")}`;

    await chrome.windows.create({
      url,
      type:"popup",
      width:610,
      height:330,
      focused:true
    });
  }catch{}

  await openChat(event);
  chrome.runtime.sendMessage({type:"CHAT_EVENT",payload:event}).catch(()=>{});
}
