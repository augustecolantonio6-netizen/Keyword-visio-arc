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

async function findCaptureWindow(){
  const wins=await chrome.windows.getAll({populate:true});
  return wins.find(w=>w.tabs?.some(t=>t.url?.startsWith(CAPTURE_URL)))||null;
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

    return chrome.windows.create({
      url:CAPTURE_URL,
      type:"popup",
      width:820,
      height:900,
      focused:true
    });
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

  // All surfaces are now inside the single capture/dashboard window.
  chrome.runtime.sendMessage({type:"VISIO_ALERT",payload:event}).catch(()=>{});
  chrome.runtime.sendMessage({type:"CHAT_EVENT",payload:event}).catch(()=>{});
}
