export const getFromStorage = (key) => chrome.storage.local.get([key]);

export const setInStorage = (value) => chrome.storage.local.set(value);

export const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
};

export const openTab = (url) => chrome.tabs.create({ url });

export const injectContentScript = (tabId) => new Promise((resolve, reject) => {
  chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve();
  });
});

export const sendTabMessage = (tabId, message) => new Promise((resolve, reject) => {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve(response || {});
  });
});

export const getExtensionUrl = (path) => chrome.runtime.getURL(path);
