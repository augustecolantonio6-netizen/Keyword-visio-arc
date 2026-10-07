const p = new URLSearchParams(location.search);
document.getElementById("keyword").textContent = p.get("keyword") || "Mot-clé";
document.getElementById("question").textContent = p.get("question") || "Question détectée.";

document.getElementById("chat").onclick = () => {
  chrome.runtime.sendMessage({type:"OPEN_CHAT"});
  window.close();
};
document.getElementById("close").onclick = () => window.close();
