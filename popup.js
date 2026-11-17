// Anime UpScaler PRO — Popup Controller
(() => {
  const DEFAULTS = {
    enabled: true,
    mode: '4',
    autoCeiling: 'hq',
    splitScreen: false,
    splitPosition: 0.5,
    showHud: true,
    hudPosition: 'bottom-left',
    strength: 0.7,
    hosts: {}
  };

  const $siteHost = document.getElementById('siteHost');
  const $btnSiteToggle = document.getElementById('btnSiteToggle');
  const $btnMaster = document.getElementById('btnMaster');
  const $btnMasterText = document.getElementById('btnMasterText');
  const $modeCards = Array.from(document.querySelectorAll('.mode-card'));
  const $checkSplit = document.getElementById('checkSplit');
  const $checkHud = document.getElementById('checkHud');

  const $telRes = document.getElementById('telRes');
  const $telFps = document.getElementById('telFps');
  const $telMs = document.getElementById('telMs');
  const $telGpu = document.getElementById('telGpu');
  const $gpuBadgeText = document.getElementById('gpuBadgeText');

  // Dynamically detect GPU name from WebGL
  function detectGpuBadge() {
    if (!$gpuBadgeText) return;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const ren = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
        // Clean up common GPU strings: e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX...)"
        const m = ren.match(/(RTX\s*\d+|GTX\s*\d+|Radeon\s*[A-Z0-9]+|Apple\s*M\d+|Intel\s*Arc\s*[A-Z0-9]+|GeForce\s*[A-Z0-9\s]+)/i);
        if (m) {
          $gpuBadgeText.textContent = m[0].trim();
        } else if (ren.includes('NVIDIA')) {
          $gpuBadgeText.textContent = 'NVIDIA GPU';
        } else if (ren.includes('AMD') || ren.includes('Radeon')) {
          $gpuBadgeText.textContent = 'AMD GPU';
        } else if (ren.includes('Intel')) {
          $gpuBadgeText.textContent = 'Intel GPU';
        } else {
          $gpuBadgeText.textContent = 'WebGL2 GPU';
        }
      }
    } catch (e) {}
  }
  detectGpuBadge();

  let currentHost = '';
  let activeTabId = null;
  let cfg = { ...DEFAULTS };

  const isGlobalOn = () => cfg.enabled !== false;
  const isSiteOff = () => !!(cfg.hosts && cfg.hosts[currentHost] && cfg.hosts[currentHost].off);
  const isActiveHere = () => isGlobalOn() && !isSiteOff();

  function saveConfig(patch) {
    cfg = { ...cfg, ...patch };
    chrome.storage.local.set(patch, () => {
      notifyActiveTab();
      render();
    });
  }

  function notifyActiveTab() {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { op: 'APPLY_CONFIG' }, () => {
      if (chrome.runtime.lastError) {}
    });
  }

  function queryTabStatus() {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { op: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        $telRes.textContent = 'Ожидание видео…';
        $telFps.textContent = '–';
        $telMs.textContent = '–';
        $telGpu.textContent = 'Ожидание';
        $telGpu.style.color = '#94a3b8';
        return;
      }
      $telRes.textContent = res.resolution || '–';
      $telFps.textContent = res.fps ? `${res.fps} FPS` : '–';
      $telMs.textContent = res.renderMs ? `${res.renderMs.toFixed(1)} ms` : '–';
      $telGpu.textContent = res.active ? 'Активен (RTX)' : 'Пауза';
      $telGpu.style.color = res.active ? '#34d399' : '#fbbf24';
    });
  }

  function render() {
    // 1. Site info
    if (currentHost) {
      $siteHost.textContent = currentHost;
      const off = isSiteOff();
      $btnSiteToggle.textContent = off ? 'Включить здесь' : 'Выключить здесь';
      $btnSiteToggle.classList.toggle('off', off);
      $btnSiteToggle.disabled = !isGlobalOn();
    } else {
      $siteHost.textContent = 'Служебная вкладка';
      $btnSiteToggle.disabled = true;
    }

    // 2. Master Switch
    const active = isActiveHere();
    $btnMaster.classList.toggle('off', !active);
    $btnMasterText.textContent = active ? 'АПСКЕЙЛЕР АКТИВЕН' : 'АПСКЕЙЛЕР ВЫКЛЮЧЕН';

    // 3. Active Mode
    const effectiveMode = (cfg.hosts && cfg.hosts[currentHost] && cfg.hosts[currentHost].mode) || cfg.mode || '4';
    $modeCards.forEach((card) => {
      card.classList.toggle('active', card.dataset.mode === effectiveMode);
    });

    // 4. Checkboxes
    $checkSplit.checked = !!cfg.splitScreen;
    $checkHud.checked = !!cfg.showHud;

    queryTabStatus();
  }

  // Event Listeners
  $btnMaster.addEventListener('click', () => {
    saveConfig({ enabled: !isGlobalOn() });
  });

  $btnSiteToggle.addEventListener('click', () => {
    if (!currentHost) return;
    const hosts = { ...(cfg.hosts || {}) };
    if (isSiteOff()) {
      delete hosts[currentHost];
    } else {
      hosts[currentHost] = { ...(hosts[currentHost] || {}), off: true };
    }
    saveConfig({ hosts });
  });

  $modeCards.forEach((card) => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      saveConfig({ mode });
    });
  });

  $checkSplit.addEventListener('change', () => {
    saveConfig({ splitScreen: $checkSplit.checked });
  });

  $checkHud.addEventListener('change', () => {
    saveConfig({ showHud: $checkHud.checked });
  });

  const $btnOpenOptions = document.getElementById('btnOpenOptions');
  if ($btnOpenOptions) {
    $btnOpenOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  const $btnTakeSnapshot = document.getElementById('btnTakeSnapshot');
  if ($btnTakeSnapshot) {
    $btnTakeSnapshot.addEventListener('click', () => {
      if (!activeTabId) return;
      chrome.tabs.sendMessage(activeTabId, { op: 'TAKE_SNAPSHOT' });
    });
  }

  // Init
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.url) {
      activeTabId = tab.id;
      try {
        currentHost = new URL(tab.url).hostname;
      } catch (e) {
        currentHost = '';
      }
    }

    chrome.storage.local.get(DEFAULTS, (v) => {
      cfg = { ...DEFAULTS, ...v };
      render();
      setInterval(queryTabStatus, 1000);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k of Object.keys(changes)) {
      cfg[k] = changes[k].newValue;
    }
    render();
  });
})();
