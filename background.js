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

async function raiseCaptureController(windowIdHint=null){
  let target=null;
  if(Number.isInteger(windowIdHint)){
    try{target=await chrome.windows.get(windowIdHint)}catch{}
  }
  if(!target) target=await findCaptureWindow();
  if(!target || !Number.isInteger(target.id)){
    return {ok:false,error:"Fenêtre du tableau de bord introuvable."};
  }

  let lastError="";
  for(let attempt=0;attempt<5;attempt++){
    try{
      await chrome.windows.update(target.id,{state:"normal"});
      await chrome.windows.update(target.id,{focused:true,drawAttention:true});
      await new Promise(resolve=>setTimeout(resolve,250+attempt*100));
      const check=await chrome.windows.get(target.id);
      if(check.state!=="minimized" && check.focused){
        await chrome.storage.local.set({captureWindowId:target.id});
        return {ok:true,windowId:target.id};
      }
      lastError="Arc/Windows n’a pas confirmé que la fenêtre était active.";
    }catch(e){
      lastError=e?.message||String(e);
    }
  }

  chrome.runtime.sendMessage({
    type:"DASHBOARD_FOCUS_FAILED",
    message:lastError||"Impossible de mettre le tableau de bord au premier plan."
  }).catch(()=>{});
  return {ok:false,error:lastError};
}

async function handleKeyword(payload){
  const event={...payload,ts:Date.now()};
  const targetWindowId=Number.isInteger(payload.dashboardWindowId)?payload.dashboardWindowId:null;
  await chrome.storage.local.set({
    lastEvent:event,
    alertDashboardWindowId:targetWindowId
  });

  const focusResult=await raiseCaptureController(targetWindowId);
  if(!focusResult.ok){
    // Keep the visible notification as a fallback when Arc/Windows blocks focusing.
    await chrome.runtime.sendMessage({
      type:"CAPTURE_STATUS",
      running:true,
      status:"Alerte détectée, mais le focus de la fenêtre a échoué : "+focusResult.error
    }).catch(()=>{});
  }

  const notificationId="keyword-alert-"+Date.now();
  try{
    await chrome.notifications.create(notificationId,{
      type:"basic",
      iconUrl:chrome.runtime.getURL("icons/icon128.png"),
      title:"Mot détecté : "+(payload.keyword||"mot-clé"),
      message:payload.question||"Mot-clé détecté.",
      priority:2,
      requireInteraction:true
    });
    await chrome.storage.local.set({alertNotificationId:notificationId});
  }catch{}

  chrome.runtime.sendMessage({type:"VISIO_ALERT",payload:event}).catch(()=>{});
  chrome.runtime.sendMessage({type:"CHAT_EVENT",payload:event}).catch(()=>{});
}

chrome.notifications.onClicked.addListener(async notificationId=>{
  const stored=await chrome.storage.local.get({
    alertNotificationId:null,
    alertDashboardWindowId:null,
    lastEvent:null
  });
  if(notificationId!==stored.alertNotificationId) return;
  await raiseCaptureController(stored.alertDashboardWindowId);
  if(stored.lastEvent){
    chrome.runtime.sendMessage({type:"VISIO_ALERT",payload:stored.lastEvent}).catch(()=>{});
  }
});
