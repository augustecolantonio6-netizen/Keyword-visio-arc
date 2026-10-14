const CAPTURE_URL=chrome.runtime.getURL("capture.html");
const ALERT_CHAT_URL=chrome.runtime.getURL("alertchat.html");

let openingCapture=null;
let openingAlertChat=null;

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==="OPEN_CAPTURE_CONTROLLER"){
    openCaptureController()
      .then(result=>sendResponse({ok:true,windowId:result?.id??null}))
      .catch(error=>sendResponse({ok:false,error:error.message}));
    return true;
  }

  if(message?.type==="OPEN_CHAT"){
    chrome.storage.local.get({lastEvent:null}).then(({lastEvent})=>
      openAlertChatWindow(lastEvent||null)
    ).then(async result=>{
      const focused=await focusWindowWithRetries(result.id);
      sendResponse({ok:true,windowId:result?.id??null,focused});
    }).catch(error=>sendResponse({ok:false,error:error.message}));
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
  }

  if(message?.type==="KEYWORD_DETECTED"){
    handleKeyword(message.payload||{})
      .then(result=>sendResponse({ok:true,...result}))
      .catch(error=>{
        const detail=error?.message||String(error);
        chrome.runtime.sendMessage({type:"ALERT_OPEN_FAILED",error:detail}).catch(()=>{});
        sendResponse({ok:false,error:detail});
      });
    return true;
  }
});

chrome.windows.onRemoved.addListener(async windowId=>{
  const stored=await chrome.storage.local.get({
    captureWindowId:null,
    alertChatWindowId:null
  });
  const updates={};
  if(stored.captureWindowId===windowId) updates.captureWindowId=null;
  if(stored.alertChatWindowId===windowId) updates.alertChatWindowId=null;
  if(Object.keys(updates).length) await chrome.storage.local.set(updates);
});

async function findWindowByUrl(url){
  const wins=await chrome.windows.getAll({populate:true});
  return wins.find(w=>w.tabs?.some(t=>typeof t.url==="string" && t.url.startsWith(url)))||null;
}

async function findCaptureWindow(){
  const stored=await chrome.storage.local.get({captureWindowId:null});
  if(Number.isInteger(stored.captureWindowId)){
    try{
      const remembered=await chrome.windows.get(stored.captureWindowId,{populate:true});
      if(remembered.tabs?.some(t=>typeof t.url==="string" && t.url.startsWith(CAPTURE_URL))){
        return remembered;
      }
    }catch{
      await chrome.storage.local.remove("captureWindowId");
    }
  }
  const found=await findWindowByUrl(CAPTURE_URL);
  if(found) await chrome.storage.local.set({captureWindowId:found.id});
  return found;
}

async function openCaptureController(){
  if(openingCapture) return openingCapture;
  openingCapture=(async()=>{
    const found=await findCaptureWindow();
    if(found){
      await chrome.windows.update(found.id,{
        state:"normal",
        focused:true,
        width:520,
        height:420
      });
      return found;
    }
    const created=await chrome.windows.create({
      url:CAPTURE_URL,
      type:"popup",
      width:520,
      height:420,
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

async function focusWindowWithRetries(windowId){
  if(!Number.isInteger(windowId)) return false;
  for(let attempt=0;attempt<5;attempt++){
    try{
      await chrome.windows.update(windowId,{state:"normal"});
      await chrome.windows.update(windowId,{focused:true,drawAttention:true});
      await new Promise(resolve=>setTimeout(resolve,180+attempt*100));
      const state=await chrome.windows.get(windowId);
      if(state.state!=="minimized" && state.focused) return true;
    }catch{}
  }
  return false;
}

async function openAlertChatWindow(event){
  if(openingAlertChat) return openingAlertChat;
  openingAlertChat=(async()=>{
    if(event){
      await chrome.storage.local.set({lastEvent:event});
    }

    const existing=await findWindowByUrl(ALERT_CHAT_URL);
    let created=existing;
    if(existing){
      await chrome.windows.update(existing.id,{
        state:"normal",
        focused:true,
        width:590,
        height:820
      });
    }else{
      created=await chrome.windows.create({
        url:ALERT_CHAT_URL,
        type:"popup",
        width:590,
        height:820,
        focused:true
      });
    }

    if(!Number.isInteger(created?.id)) throw new Error("La fenêtre d’alerte et de chat n’a pas pu être créée.");
    await chrome.storage.local.set({alertChatWindowId:created.id});

    // If the window was already open, update its banner and chat immediately.
    if(existing && event){
      chrome.runtime.sendMessage({type:"ALERT_EVENT",payload:event}).catch(()=>{});
      chrome.runtime.sendMessage({type:"CHAT_EVENT",payload:event}).catch(()=>{});
    }

    return {id:created.id,existing:!!existing};
  })();
  try{return await openingAlertChat;}
  finally{openingAlertChat=null;}
}

async function handleKeyword(payload){
  const event={...payload,ts:Date.now()};
  await chrome.storage.local.set({lastEvent:event});

  // Open/focus the alert-chat window, but leave transcription and its audio stream running.
  const alertWindow=await openAlertChatWindow(event);
  const focused=await focusWindowWithRetries(alertWindow.id);

  const notificationId="keyword-alert-"+Date.now();
  try{
    await chrome.notifications.create(notificationId,{
      type:"basic",
      iconUrl:chrome.runtime.getURL("icons/icon128.png"),
      title:"Mot détecté : "+(payload.keyword||"mot-clé"),
      message:focused
        ? "La fenêtre d’alerte et de chat est ouverte."
        : "Clique ici pour afficher la fenêtre d’alerte et de chat.",
      priority:2,
      requireInteraction:true
    });
    await chrome.storage.local.set({alertNotificationId:notificationId});
  }catch{}

  await chrome.storage.local.set({
    captureRunning:true,
    captureStatus:focused
      ? "Mot-clé détecté : alerte + chat ouverts. La transcription continue."
      : "Mot-clé détecté : la transcription continue. Clique sur la notification si la fenêtre d’alerte n’est pas au premier plan."
  });

  return {windowId:alertWindow.id,focused};
}

chrome.notifications.onClicked.addListener(async notificationId=>{
  const stored=await chrome.storage.local.get({
    alertNotificationId:null,
    alertChatWindowId:null,
    lastEvent:null
  });
  if(notificationId!==stored.alertNotificationId) return;

  let target=Number.isInteger(stored.alertChatWindowId)
    ? stored.alertChatWindowId
    : null;
  if(target===null){
    const found=await findWindowByUrl(ALERT_CHAT_URL);
    target=found?.id??null;
  }
  if(target!==null){
    const focused=await focusWindowWithRetries(target);
    if(!focused && stored.lastEvent) await openAlertChatWindow(stored.lastEvent);
  }else if(stored.lastEvent){
    await openAlertChatWindow(stored.lastEvent);
  }
});
