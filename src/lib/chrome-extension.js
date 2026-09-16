const chromeApi = globalThis.chrome;

const hasChromeStorage = () => Boolean(chromeApi?.storage?.local);
const hasChromeTabs = () => Boolean(chromeApi?.tabs);
const hasChromeRuntime = () => Boolean(chromeApi?.runtime);

export const getFromStorage = async (key) => {
  if (hasChromeStorage()) return chromeApi.storage.local.get([key]);

  try {
    return { [key]: JSON.parse(localStorage.getItem(key) || "null") };
  } catch {
    return { [key]: null };
  }
};

export const setInStorage = async (value) => {
  if (hasChromeStorage()) return chromeApi.storage.local.set(value);

  Object.entries(value || {}).forEach(([key, item]) => {
    localStorage.setItem(key, JSON.stringify(item));
  });
};

export const getActiveTab = async () => {
  if (!hasChromeTabs()) throw new Error("Chrome tab APIs are available only inside the extension.");
  const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  return tab || null;
};

export const openTab = (url) => {
  if (hasChromeTabs()) return chromeApi.tabs.create({ url });
  window.open(url, "_blank", "noopener,noreferrer");
};

export const injectContentScript = (tabId) => new Promise((resolve, reject) => {
  if (!chromeApi?.scripting) {
    reject(new Error("Chrome scripting API is available only inside the extension."));
    return;
  }

  chromeApi.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
    const error = chromeApi.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve();
  });
});

export const sendTabMessage = (tabId, message) => new Promise((resolve, reject) => {
  if (!hasChromeTabs()) {
    reject(new Error("Chrome tab APIs are available only inside the extension."));
    return;
  }

  chromeApi.tabs.sendMessage(tabId, message, (response) => {
    const error = chromeApi.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve(response || {});
  });
});

export const getExtensionUrl = (path) => {
  if (hasChromeRuntime()) return chromeApi.runtime.getURL(path);
  return new URL(path, window.location.href).toString();
};
