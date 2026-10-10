function renderAlertEvent(payload){
  if(!payload) return;
  const keyword=document.getElementById("alertKeyword");
  const question=document.getElementById("alertQuestion");
  if(keyword) keyword.textContent=payload.keyword||"Mot détecté";
  if(question) question.textContent=payload.question||payload.transcript||"Le mot-clé a été détecté.";
  document.title="Alerte : "+(payload.keyword||"mot détecté");
}

chrome.storage.local.get({lastEvent:null}).then(({lastEvent})=>{
  renderAlertEvent(lastEvent);
});

chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==="ALERT_EVENT") renderAlertEvent(message.payload);
});

document.getElementById("closeAlertWindow").addEventListener("click",()=>{
  window.close();
});
