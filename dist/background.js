const SUPPORTED_PAGE = /^https:\/\/mcc\.admissions\.nic\.in\//;

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  updateActionForTab(tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  updateActionForTab(tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !isSupportedPage(tab.url)) {
    chrome.action.setBadgeText({ tabId: tab?.id, text: "!" });
    return;
  }

  await sendPanelToggle(tab.id);
});

async function sendPanelToggle(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "MCC_TOGGLE_HELPER_PANEL" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "MCC_TOGGLE_HELPER_PANEL" });
  }
}

function updateActionForTab(tab) {
  if (!tab?.id) return;

  if (isSupportedPage(tab.url)) {
    chrome.action.enable(tab.id);
    chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    chrome.action.setTitle({ tabId: tab.id, title: "Open MCC Choice Helper on this page" });
    return;
  }

  chrome.action.disable(tab.id);
  chrome.action.setTitle({ tabId: tab.id, title: "Open an MCC choice page to use Choice Helper" });
}

function isSupportedPage(url = "") {
  return SUPPORTED_PAGE.test(url);
}
