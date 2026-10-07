const DEFAULT_PROMPT = `Je suis en terminale en cours de {{subject}} en visio.
Je n'ai pas écouté correctement le passage et le professeur vient de me poser cette question :
{{question}}

Réponds de façon humaine et brève pour m'aider à comprendre quoi répondre.
Pas de tirets. Pas de virgules. Pas de smiley.
Fais un petit texte compact.`;

const $ = id => document.getElementById(id);

async function load() {
  const s = await chrome.storage.local.get({
    keyword: "",
    subject: "Spécialité mathématiques",
    apiKey: "",
    model: "gemini-3.5-flash-lite",
    promptTemplate: DEFAULT_PROMPT,
    recordScreen: true
  });
  $("keyword").value = s.keyword;
  $("subject").value = s.subject;
  $("apiKey").value = s.apiKey;
  $("model").value = s.model;
  $("promptTemplate").value = s.promptTemplate;
  $("recordScreen").checked = !!s.recordScreen;
}

async function save() {
  await chrome.storage.local.set({
    keyword: $("keyword").value.trim(),
    subject: $("subject").value,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || "gemini-3.5-flash-lite",
    promptTemplate: $("promptTemplate").value.trim() || DEFAULT_PROMPT,
    recordScreen: $("recordScreen").checked
  });
  $("status").textContent = "Réglages enregistrés.";
}

$("save").onclick = save;

$("chat").onclick = async () => {
  await save();
  chrome.runtime.sendMessage({
    type: "OPEN_CHAT",
    payload: {
      subject: $("subject").value,
      keyword: $("keyword").value,
      promptTemplate: $("promptTemplate").value
    }
  });
  window.close();
};

$("start").onclick = async () => {
  await save();
  const s = await chrome.storage.local.get(["keyword", "apiKey"]);
  if (!s.keyword || !s.apiKey) {
    $("status").textContent = "Renseigne le mot/prénom et la clé API.";
    return;
  }

  chrome.runtime.sendMessage({
    type: "OPEN_CHAT",
    payload: {
      subject: $("subject").value,
      keyword: $("keyword").value,
      promptTemplate: $("promptTemplate").value
    }
  });

  chrome.windows.create({
    url: chrome.runtime.getURL("capture.html"),
    type: "popup",
    width: 500,
    height: 420,
    focused: true
  });
  window.close();
};

load();
