// Anime UpScaler PRO — Options Dashboard Controller v3.1.0
(() => {
  const DEFAULTS = {
    enabled: true,
    mode: 'godmode',
    autoCeiling: 'godmode',
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

  let cfg = { ...DEFAULTS };

  // Elements
  const $tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const $panels = Array.from(document.querySelectorAll('.panel'));
  const $modeCards = Array.from(document.querySelectorAll('.mode-card'));
  const $genreCards = Array.from(document.querySelectorAll('.genre-card'));

  // Whitelist Elements
  const $selectSiteMode = document.getElementById('selectSiteMode');
  const $inputNewHost = document.getElementById('inputNewHost');
  const $btnAddHost = document.getElementById('btnAddHost');
  const $hostsContainer = document.getElementById('hostsContainer');
  const $hostsCount = document.getElementById('hostsCount');
  const $btnResetHosts = document.getElementById('btnResetHosts');

  // Performance & Settings Elements
  const $checkSmartSync = document.getElementById('checkSmartSync');
  const $selectMaxRes = document.getElementById('selectMaxRes');
  const $checkEnableCas = document.getElementById('checkEnableCas');
  const $rangeStrength = document.getElementById('rangeStrength');
  const $valStrength = document.getElementById('valStrength');
  const $checkEnableDeband = document.getElementById('checkEnableDeband');
  const $checkEnableVibrance = document.getElementById('checkEnableVibrance');
  const $checkEnableChromaRecon = document.getElementById('checkEnableChromaRecon');
  const $checkEnableTemporalStability = document.getElementById('checkEnableTemporalStability');
  const $checkAutoHideUI = document.getElementById('checkAutoHideUI');
  const $checkEnableLineEnhance = document.getElementById('checkEnableLineEnhance');
  const $rangeLineDarken = document.getElementById('rangeLineDarken');
  const $valLineDarken = document.getElementById('valLineDarken');
  const $rangeLineThin = document.getElementById('rangeLineThin');
  const $valLineThin = document.getElementById('valLineThin');
  const $checkEnableBloom = document.getElementById('checkEnableBloom');
  const $rangeBloomStrength = document.getElementById('rangeBloomStrength');
  const $valBloomStrength = document.getElementById('valBloomStrength');

  // Film Grain & Highlight Clamp Elements
  const $checkEnableFilmGrain = document.getElementById('checkEnableFilmGrain');
  const $rangeGrainStrength = document.getElementById('rangeGrainStrength');
  const $valGrainStrength = document.getElementById('valGrainStrength');
  const $checkEnableHighlightClamp = document.getElementById('checkEnableHighlightClamp');

  const $checkBatterySaver = document.getElementById('checkBatterySaver');
  const $selectButtonStyle = document.getElementById('selectButtonStyle');
  const $checkWidgetCollapsed = document.getElementById('checkWidgetCollapsed');
  const $checkShowHud = document.getElementById('checkShowHud');
  const $selectHudPosition = document.getElementById('selectHudPosition');
  const $checkSplitScreen = document.getElementById('checkSplitScreen');

  const $toast = document.getElementById('toast');
  const $toastMsg = document.getElementById('toastMsg');
  let toastTimer = null;

  function showToast(msg) {
    if ($toastMsg) $toastMsg.textContent = msg || 'Настройки сохранены!';
    if ($toast) {
      $toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
    }
  }

  // Tab switching
  $tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      $tabs.forEach(t => t.classList.remove('active'));
      $panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      let panel = document.getElementById(targetId);
      if (!panel && (targetId === 'tab-sites' || targetId === 'tab-modes')) {
        panel = document.getElementById('tab-modes') || document.getElementById('tab-sites');
      }
      if (panel) panel.classList.add('active');
    });
  });

  function save(patch) {
    cfg = { ...cfg, ...patch };
    chrome.storage.local.set(patch, () => {
      showToast('Настройки обновлены и синхронизированы');
    });
  }

  // Whitelist Management
  function renderHostsList() {
    if (!$hostsContainer) return;
    $hostsContainer.innerHTML = '';
    const hosts = Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts : DEFAULTS.allowedHosts;
    if ($hostsCount) $hostsCount.textContent = String(hosts.length);

    if (hosts.length === 0) {
      $hostsContainer.innerHTML = '<span style="color: #64748b; font-size: 12px; font-style: italic;">Список пуст. Добавьте сайт выше или включите через всплывающее окно.</span>';
      return;
    }

    hosts.forEach(host => {
      const pill = document.createElement('div');
      pill.className = 'host-pill';

      const name = document.createElement('span');
      name.textContent = host;
      pill.appendChild(name);

      const btnRemove = document.createElement('button');
      btnRemove.className = 'host-remove';
      btnRemove.title = `Удалить ${host} из белого списка`;
      btnRemove.innerHTML = '&times;';
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeHost(host);
      });
      pill.appendChild(btnRemove);

      $hostsContainer.appendChild(pill);
    });
  }

  function addHost(hostInput) {
    if (!hostInput) return;
    let clean = hostInput.trim().toLowerCase();
    try {
      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        clean = new URL(clean).hostname;
      }
    } catch (e) {}
    clean = clean.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
    if (!clean) return;

    let list = Array.isArray(cfg.allowedHosts) ? [...cfg.allowedHosts] : [...DEFAULTS.allowedHosts];
    if (list.includes(clean)) {
      showToast(`Домен ${clean} уже есть в белом списке`);
      return;
    }
    list.push(clean);
    const hosts = { ...(cfg.hosts || {}) };
    if (hosts[clean]) delete hosts[clean].off;
    if (hosts['www.' + clean]) delete hosts['www.' + clean].off;
    save({ allowedHosts: list, hosts });
    renderHostsList();
    if ($inputNewHost) $inputNewHost.value = '';
    showToast(`Домен ${clean} добавлен в белый список`);
  }

  function removeHost(hostToRemove) {
    const clean = hostToRemove.toLowerCase().replace(/^www\./, '').trim();
    let list = Array.isArray(cfg.allowedHosts) ? [...cfg.allowedHosts] : [...DEFAULTS.allowedHosts];
    list = list.filter(h => h.toLowerCase().replace(/^www\./, '').trim() !== clean);
    const hosts = { ...(cfg.hosts || {}) };
    delete hosts[clean];
    delete hosts['www.' + clean];
    delete hosts[hostToRemove];
    save({ allowedHosts: list, hosts });
    renderHostsList();
    showToast(`Домен ${hostToRemove} удален из белого списка`);
  }

  function render() {
    // Mode cards
    $modeCards.forEach(c => {
      c.classList.toggle('selected', c.dataset.mode === (cfg.mode || '4'));
    });

    // Genre cards
    $genreCards.forEach(c => {
      c.classList.toggle('selected', c.dataset.genre === (cfg.genrePreset || 'auto'));
    });

    // Checkboxes & inputs
    if ($checkSmartSync) $checkSmartSync.checked = cfg.smartSync !== false;
    if ($selectMaxRes) $selectMaxRes.value = cfg.maxResolution || 'native';
    if ($checkEnableCas) $checkEnableCas.checked = cfg.enableCas !== false;
    if ($rangeStrength) {
      $rangeStrength.value = cfg.strength || 0.7;
      if ($valStrength) $valStrength.textContent = Number(cfg.strength || 0.7).toFixed(2);
    }
    if ($checkEnableDeband) $checkEnableDeband.checked = cfg.enableDeband !== false;
    if ($checkEnableVibrance) $checkEnableVibrance.checked = cfg.enableVibrance !== false;
    if ($checkEnableChromaRecon) $checkEnableChromaRecon.checked = cfg.enableChromaRecon !== false;
    if ($checkEnableTemporalStability) $checkEnableTemporalStability.checked = cfg.enableTemporalStability !== false;
    if ($checkEnableLineEnhance) $checkEnableLineEnhance.checked = cfg.enableLineEnhance !== false;
    if ($rangeLineDarken) {
      $rangeLineDarken.value = cfg.lineDarken ?? 0.35;
      if ($valLineDarken) $valLineDarken.textContent = Number(cfg.lineDarken ?? 0.35).toFixed(2);
    }
    if ($rangeLineThin) {
      $rangeLineThin.value = cfg.lineThin ?? 0.20;
      if ($valLineThin) $valLineThin.textContent = Number(cfg.lineThin ?? 0.20).toFixed(2);
    }
    if ($checkEnableBloom) $checkEnableBloom.checked = !!cfg.enableBloom;
    if ($rangeBloomStrength) {
      $rangeBloomStrength.value = cfg.bloomStrength ?? 0.15;
      if ($valBloomStrength) $valBloomStrength.textContent = Number(cfg.bloomStrength ?? 0.15).toFixed(2);
    }
    if ($checkBatterySaver) $checkBatterySaver.checked = cfg.batterySaver !== false;
    if ($checkAutoHideUI) $checkAutoHideUI.checked = cfg.autoHideUI !== false;
    if ($selectButtonStyle) $selectButtonStyle.value = cfg.buttonStyle || 'pill';
    if ($checkWidgetCollapsed) $checkWidgetCollapsed.checked = !!cfg.widgetCollapsed;
    if ($checkShowHud) $checkShowHud.checked = cfg.showHud !== false;
    if ($selectHudPosition) $selectHudPosition.value = cfg.hudPosition || 'bottom-left';
    if ($checkSplitScreen) $checkSplitScreen.checked = !!cfg.splitScreen;

    // Whitelist & Site Mode
    if ($selectSiteMode) $selectSiteMode.value = cfg.siteMode || 'whitelist';
    renderHostsList();

    // Film Grain & Cel Texture
    if ($checkEnableFilmGrain) $checkEnableFilmGrain.checked = cfg.enableFilmGrain !== false;
    if ($rangeGrainStrength) {
      const gs = typeof cfg.grainStrength === 'number' ? cfg.grainStrength : 0.035;
      $rangeGrainStrength.value = gs;
      if ($valGrainStrength) $valGrainStrength.textContent = gs.toFixed(3);
    }

    // Highlight Clamping
    if ($checkEnableHighlightClamp) $checkEnableHighlightClamp.checked = cfg.enableHighlightClamp !== false;
  }

  // Mode selection
  const $modeGrid = document.getElementById('modeGrid');
  if ($modeGrid) {
    $modeCards.forEach(c => {
      c.addEventListener('click', () => {
        const mode = c.dataset.mode;
        save({ mode });
        render();
      });
    });
  }

  // Genre selection
  const $genreGrid = document.getElementById('genreGrid');
  if ($genreGrid) {
    $genreCards.forEach(c => {
      c.addEventListener('click', () => {
        const genrePreset = c.dataset.genre;
        save({ genrePreset });
        render();
      });
    });
  }

  // Change events
  if ($checkSmartSync) {
    $checkSmartSync.addEventListener('change', () => save({ smartSync: $checkSmartSync.checked }));
  }
  if ($selectMaxRes) {
    $selectMaxRes.addEventListener('change', () => save({ maxResolution: $selectMaxRes.value }));
  }
  if ($checkEnableCas) {
    $checkEnableCas.addEventListener('change', () => save({ enableCas: $checkEnableCas.checked }));
  }
  if ($rangeStrength) {
    $rangeStrength.addEventListener('input', () => {
      const v = Number($rangeStrength.value);
      if ($valStrength) $valStrength.textContent = v.toFixed(2);
    });
    $rangeStrength.addEventListener('change', () => {
      save({ strength: Number($rangeStrength.value) });
    });
  }
  if ($checkEnableDeband) {
    $checkEnableDeband.addEventListener('change', () => save({ enableDeband: $checkEnableDeband.checked }));
  }
  if ($checkEnableVibrance) {
    $checkEnableVibrance.addEventListener('change', () => save({ enableVibrance: $checkEnableVibrance.checked }));
  }
  if ($checkEnableChromaRecon) {
    $checkEnableChromaRecon.addEventListener('change', () => save({ enableChromaRecon: $checkEnableChromaRecon.checked }));
  }
  if ($checkEnableTemporalStability) {
    $checkEnableTemporalStability.addEventListener('change', () => save({ enableTemporalStability: $checkEnableTemporalStability.checked }));
  }
  if ($checkEnableLineEnhance) {
    $checkEnableLineEnhance.addEventListener('change', () => save({ enableLineEnhance: $checkEnableLineEnhance.checked }));
  }
  if ($rangeLineDarken) {
    $rangeLineDarken.addEventListener('input', () => {
      const v = Number($rangeLineDarken.value);
      if ($valLineDarken) $valLineDarken.textContent = v.toFixed(2);
    });
    $rangeLineDarken.addEventListener('change', () => {
      save({ lineDarken: Number($rangeLineDarken.value) });
    });
  }
  if ($rangeLineThin) {
    $rangeLineThin.addEventListener('input', () => {
      const v = Number($rangeLineThin.value);
      if ($valLineThin) $valLineThin.textContent = v.toFixed(2);
    });
    $rangeLineThin.addEventListener('change', () => {
      save({ lineThin: Number($rangeLineThin.value) });
    });
  }
  if ($checkEnableBloom) {
    $checkEnableBloom.addEventListener('change', () => save({ enableBloom: $checkEnableBloom.checked }));
  }
  if ($rangeBloomStrength) {
    $rangeBloomStrength.addEventListener('input', () => {
      const v = Number($rangeBloomStrength.value);
      if ($valBloomStrength) $valBloomStrength.textContent = v.toFixed(2);
    });
    $rangeBloomStrength.addEventListener('change', () => {
      save({ bloomStrength: Number($rangeBloomStrength.value) });
    });
  }
  if ($checkBatterySaver) {
    $checkBatterySaver.addEventListener('change', () => save({ batterySaver: $checkBatterySaver.checked }));
  }
  if ($checkAutoHideUI) {
    $checkAutoHideUI.addEventListener('change', () => save({ autoHideUI: $checkAutoHideUI.checked }));
  }
  if ($selectButtonStyle) {
    $selectButtonStyle.addEventListener('change', () => save({ buttonStyle: $selectButtonStyle.value }));
  }
  if ($checkWidgetCollapsed) {
    $checkWidgetCollapsed.addEventListener('change', () => save({ widgetCollapsed: $checkWidgetCollapsed.checked }));
  }
  if ($checkShowHud) {
    $checkShowHud.addEventListener('change', () => save({ showHud: $checkShowHud.checked }));
  }
  if ($selectHudPosition) {
    $selectHudPosition.addEventListener('change', () => save({ hudPosition: $selectHudPosition.value }));
  }
  if ($checkSplitScreen) {
    $checkSplitScreen.addEventListener('change', () => save({ splitScreen: $checkSplitScreen.checked }));
  }

  // Whitelist Event Listeners
  if ($selectSiteMode) {
    $selectSiteMode.addEventListener('change', () => save({ siteMode: $selectSiteMode.value }));
  }
  if ($btnAddHost) {
    $btnAddHost.addEventListener('click', () => {
      if ($inputNewHost) addHost($inputNewHost.value);
    });
  }
  if ($inputNewHost) {
    $inputNewHost.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addHost($inputNewHost.value);
      }
    });
  }
  if ($btnResetHosts) {
    $btnResetHosts.addEventListener('click', () => {
      save({ allowedHosts: [...DEFAULTS.allowedHosts] });
      renderHostsList();
      showToast('Список сайтов сброшен к настройкам по умолчанию');
    });
  }

  // Film Grain & Highlight Clamp Events
  if ($checkEnableFilmGrain) {
    $checkEnableFilmGrain.addEventListener('change', () => {
      save({ enableFilmGrain: $checkEnableFilmGrain.checked });
    });
  }
  if ($rangeGrainStrength) {
    $rangeGrainStrength.addEventListener('input', () => {
      const v = Number($rangeGrainStrength.value);
      if ($valGrainStrength) $valGrainStrength.textContent = v.toFixed(3);
    });
    $rangeGrainStrength.addEventListener('change', () => {
      save({ grainStrength: Number($rangeGrainStrength.value) });
    });
  }
  if ($checkEnableHighlightClamp) {
    $checkEnableHighlightClamp.addEventListener('change', () => {
      save({ enableHighlightClamp: $checkEnableHighlightClamp.checked });
    });
  }

  // Buttons
  const $btnOpenShortcuts = document.getElementById('btnOpenShortcuts');
  if ($btnOpenShortcuts) {
    $btnOpenShortcuts.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  const $btnTestSelftest = document.getElementById('btnTestSelftest');
  if ($btnTestSelftest) {
    $btnTestSelftest.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('selftest.html') });
    });
  }

  // Diagnostics
  function runDiagnostics() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) {
        document.getElementById('diagGlVer').textContent = 'Недоступен';
        return;
      }
      document.getElementById('diagGlVer').textContent = 'WebGL 2.0 (OK)';

      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const ren = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        const $el = document.getElementById('diagRenderer');
        if ($el) {
          $el.textContent = ren;
          if (ren.toLowerCase().includes('nvidia') || ren.toLowerCase().includes('rtx')) {
            $el.style.color = '#34d399';
            const $g = document.getElementById('gpuStatus');
            if ($g) $g.textContent = 'NVIDIA RTX Акселерация';
          }
        }
      }

      const fp16 = !!gl.getExtension('EXT_color_buffer_float');
      const $f = document.getElementById('diagFp16');
      if ($f) $f.textContent = fp16 ? 'Поддерживается (FP16/FP32)' : 'Нет';

      const flt = !!gl.getExtension('OES_texture_float_linear');
      const $fl = document.getElementById('diagFloatFilter');
      if ($fl) $fl.textContent = flt ? 'Поддерживается (Линейная)' : 'Нет';

      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const $m = document.getElementById('diagMaxTex');
      if ($m) $m.textContent = `${maxTex} × ${maxTex} px`;

      const rvfc = typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
      const $r = document.getElementById('diagRvfc');
      if ($r) $r.textContent = rvfc ? 'Поддерживается (Zero-Idle)' : 'requestAnimationFrame (Базовый)';
    } catch (e) {
      console.warn('Diagnostics error:', e);
    }
  }

  // Init
  chrome.storage.local.get(DEFAULTS, data => {
    cfg = { ...DEFAULTS, ...data };
    render();
    runDiagnostics();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const k of Object.keys(changes)) cfg[k] = changes[k].newValue;
    render();
  });
})();
