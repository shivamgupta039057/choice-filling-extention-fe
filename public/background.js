chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }

  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
