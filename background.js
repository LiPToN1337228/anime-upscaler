// Anime UpScaler PRO — Service Worker (MV3)
// Reliable event-driven background coordinator

const DEFAULTS = {
  enabled: true,
  mode: '4',
  autoCeiling: 'hq',
  splitScreen: false,
  splitPosition: 0.5,
  showHud: true,
  hudPosition: 'bottom-left',
  strength: 0.7,
  enableCas: true,
  enableDeband: true,
  enableVibrance: true,
  vibranceStrength: 0.18,
  smartSync: true,
  maxResolution: 'native',
  autoHideUI: true,
  autoHideDelay: 2500,
  buttonStyle: 'pill',
  widgetCollapsed: false,
  enableChromaRecon: true,
  enableTemporalStability: true,
  enableLineEnhance: true,
  lineDarken: 0.35,
  lineThin: 0.20,
  enableBloom: false,
  bloomStrength: 0.15,
  batterySaver: true,
  genrePreset: 'auto',
  hosts: {}
};

// Handle message commands from popup / content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.op === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
});

async function getSiteStatus(url) {
  if (!url) return false;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return false; }
  if (!host) return false;

  const data = await chrome.storage.local.get(DEFAULTS);
  if (data.enabled === false) return false;
  const h = data.hosts && data.hosts[host];
  return !(h && h.off);
}

async function updateBadge(tabId, url) {
  if (!tabId || !url) return;
  try {
    const active = await getSiteStatus(url);
    await chrome.action.setBadgeText({
      tabId,
      text: active ? 'ON' : ''
    });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: '#10b981' // Emerald green
    });
  } catch (e) {
    // Suppress errors for internal chrome pages
  }
}

// Commands from shortcuts (Alt+Shift+Q, Alt+Shift+F, Alt+Shift+S, Alt+Shift+1, Alt+Shift+2)
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith('http')) return;

    let op = '';
    if (command === 'toggle-active') op = 'TOGGLE_ACTIVE';
    else if (command === 'toggle-fps') op = 'TOGGLE_HUD';
    else if (command === 'toggle-split') op = 'TOGGLE_SPLIT';
    else if (command === 'mode-next') op = 'MODE_NEXT';
    else if (command === 'mode-prev') op = 'MODE_PREV';

    if (op) {
      chrome.tabs.sendMessage(tab.id, { op }, () => {
        if (chrome.runtime.lastError) {
          // Content script not ready yet on this tab
        }
        updateBadge(tab.id, tab.url);
      });
    }
  } catch (err) {
    console.warn('[AnimeUpScaler PRO] Command dispatch failed:', err);
  }
});

// Tab navigation & activation updates
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url) updateBadge(tabId, tab.url);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    if (tab && tab.url) updateBadge(tabId, tab.url);
  }
});

// Sync badge on storage change
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.id && tab.url) {
      updateBadge(tab.id, tab.url);
    }
  } catch (e) {}
});
