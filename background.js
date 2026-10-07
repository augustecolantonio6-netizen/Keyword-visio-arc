const ALERT_URL = chrome.runtime.getURL("alert.html");
const CHAT_URL = chrome.runtime.getURL("chat.html");

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "KEYWORD_DETECTED") showAlert(message);
  if (message?.type === "OPEN_CHAT") openChat(message.payload || {});
});

async function openChat(payload = {}) {
  const windows = await chrome.windows.getAll({populate: true});
  let found = null;

  for (const win of windows) {
    if (win.tabs?.some(t => t.url?.startsWith(CHAT_URL))) {
      found = win;
      break;
    }
  }

  if (!found) {
    found = await chrome.windows.create({
      url: CHAT_URL,
      type: "popup",
      width: 500,
      height: 780,
      focused: false
    });
  }

  if (Object.keys(payload).length) {
    const event = {...payload, ts: Date.now()};
    await chrome.storage.local.set({pendingChatEvent: event});

    // Push the event immediately when the chat already exists.
    try {
      await chrome.runtime.sendMessage({
        type: "CHAT_EVENT",
        payload: event
      });
    } catch {}
  }
}

async function showAlert(message) {
  await chrome.storage.local.set({
    pendingChatEvent: {
      keyword: message.keyword || "",
      subject: message.subject || "",
      question: message.question || "Question non extraite.",
      answer: message.answer || "",
      screenshot: message.screenshot || null,
      ts: Date.now()
    }
  });

  try {
    await chrome.notifications.create(`alert-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: `MOT DÉTECTÉ : ${message.keyword || "mot-clé"}`,
      message: message.question || "Question détectée.",
      priority: 2,
      requireInteraction: true
    });
  } catch {}

  try {
    await chrome.windows.create({
      url: `${ALERT_URL}?keyword=${encodeURIComponent(message.keyword || "")}&question=${encodeURIComponent(message.question || "")}`,
      type: "popup",
      width: 600,
      height: 320,
      focused: true
    });
  } catch {}

  await openChat();
}
