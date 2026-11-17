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
  siteMode: 'whitelist',
  allowedHosts: [
    'animelib.org',
    'shikimori.one',
    'shikimori.me',
    'jut.su',
    'animego.org',
    'anilibria.tv',
    'crunchyroll.com',
    'miruro.tv',
    'miruro.online',
    'yummyanime.tv'
  ],
  enableFilmGrain: true,
  grainStrength: 0.035,
  enableHighlightClamp: true,
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

// Broadcast config update to all tabs on install/update so disallowed sites immediately purge widgets
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && tab.url.startsWith('http')) {
        chrome.tabs.sendMessage(tab.id, { op: 'APPLY_CONFIG' }, () => {
          if (chrome.runtime.lastError) {}
        });
        updateBadge(tab.id, tab.url);
      }
    }
  } catch (e) {}
});

async function getSiteStatus(url) {
  if (!url) return false;
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return false; }
  if (!host) return false;

  const data = await chrome.storage.local.get(DEFAULTS);
  if (data.enabled === false) return false;

  const cleanHost = host.toLowerCase().replace(/^www\./, '');
  if (data.hosts) {
    if (data.hosts[host] && data.hosts[host].off) return false;
    if (data.hosts[cleanHost] && data.hosts[cleanHost].off) return false;
    if (data.hosts[host] && data.hosts[host].allowed) return true;
    if (data.hosts[cleanHost] && data.hosts[cleanHost].allowed) return true;
  }

  if (data.siteMode === 'whitelist') {
    const list = Array.isArray(data.allowedHosts) ? data.allowedHosts : DEFAULTS.allowedHosts;
    const isAllowed = list.some(item => {
      const it = item.toLowerCase().replace(/^www\./, '');
      return cleanHost === it || cleanHost.endsWith('.' + it);
    });
    if (!isAllowed) return false;
  }

  return true;
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
