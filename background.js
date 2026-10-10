const CAPTURE_URL=chrome.runtime.getURL("capture.html");

let openingCapture=null;

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==="OPEN_CAPTURE_CONTROLLER"){
    openCaptureController()
      .then(result=>sendResponse({ok:true,windowId:result?.id??null}))
      .catch(error=>sendResponse({ok:false,error:error.message}));
    return true;
  }

  if(message?.type==="OPEN_CHAT"){
    openCaptureController()
      .then(()=>chrome.runtime.sendMessage({type:"FOCUS_CHAT"}).catch(()=>{}))
      .then(()=>sendResponse({ok:true}))
      .catch(error=>sendResponse({ok:false,error:error.message}));
    return true;
  }

  if(message?.type==="CAPTURE_CONTROLLER_READY" && Number.isInteger(message.windowId)){
    chrome.storage.local.set({captureWindowId:message.windowId}).catch(()=>{});
  }

  if(message?.type==="STOP_CAPTURE"){
    chrome.runtime.sendMessage({type:"CAPTURE_STOP"}).catch(()=>{});
  }

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

chrome.windows.onRemoved.addListener(async windowId=>{
  const stored=await chrome.storage.local.get({captureWindowId:null});
  if(stored.captureWindowId===windowId){
    await chrome.storage.local.remove("captureWindowId");
  }
});

async function findCaptureWindow(){
  const stored=await chrome.storage.local.get({captureWindowId:null});
  if(Number.isInteger(stored.captureWindowId)){
    try{
      const remembered=await chrome.windows.get(stored.captureWindowId,{populate:true});
      const tabs=remembered.tabs||[];
      const urlKnown=tabs.some(t=>typeof t.url==="string");
      if(!urlKnown||tabs.some(t=>t.url.startsWith(CAPTURE_URL))){
        return remembered;
      }
    }catch{
      await chrome.storage.local.remove("captureWindowId");
    }
  }

  const wins=await chrome.windows.getAll({populate:true});
  const found=wins.find(w=>w.tabs?.some(t=>t.url?.startsWith(CAPTURE_URL)))||null;
  if(found) await chrome.storage.local.set({captureWindowId:found.id});
  return found;
}

async function openCaptureController(){
  if(openingCapture) return openingCapture;

  openingCapture=(async()=>{
    const found=await findCaptureWindow();
    if(found){
      return chrome.windows.update(found.id,{
        focused:true,
        state:"normal",
        width:820,
        height:900
      });
    }

    const created=await chrome.windows.create({
      url:CAPTURE_URL,
      type:"popup",
      width:820,
      height:900,
      focused:true
    });
    if(Number.isInteger(created.id)){
      await chrome.storage.local.set({captureWindowId:created.id});
    }
    return created;
  })();

  try{return await openingCapture;}
  finally{openingCapture=null;}
}

async function raiseCaptureController(){
  try{
    const found=await findCaptureWindow();
    if(found){
      await chrome.windows.update(found.id,{state:"normal",focused:true,drawAttention:true});
      return true;
    }
  }catch{}
  return false;
}

async function handleKeyword(payload){
  const event={...payload,ts:Date.now()};
  await chrome.storage.local.set({lastEvent:event});

  await raiseCaptureController();

  try{
    await chrome.notifications.create("keyword-"+Date.now(),{
      type:"basic",
      iconUrl:chrome.runtime.getURL("icons/icon128.png"),
      title:"Mot détecté : "+(payload.keyword||"mot-clé"),
      message:payload.question||"Mot-clé détecté.",
      priority:2,
      requireInteraction:true
    });
  }catch{}

  chrome.runtime.sendMessage({type:"VISIO_ALERT",payload:event}).catch(()=>{});
  chrome.runtime.sendMessage({type:"CHAT_EVENT",payload:event}).catch(()=>{});
}
