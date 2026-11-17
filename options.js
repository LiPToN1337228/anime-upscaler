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
    genrePreset: 'auto',
    hosts: {}
  };

  let cfg = { ...DEFAULTS };

  // Elements
  const $tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const $panels = Array.from(document.querySelectorAll('.panel'));
  const $modeCards = Array.from(document.querySelectorAll('.mode-card'));
  const $genreCards = Array.from(document.querySelectorAll('.genre-card'));
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
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });

  function save(patch) {
    cfg = { ...cfg, ...patch };
    chrome.storage.local.set(patch, () => {
      showToast('Настройки обновлены и синхронизированы');
    });
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
    if ($checkAutoHideUI) $checkAutoHideUI.checked = cfg.autoHideUI !== false;
    if ($selectButtonStyle) $selectButtonStyle.value = cfg.buttonStyle || 'pill';
    if ($checkWidgetCollapsed) $checkWidgetCollapsed.checked = !!cfg.widgetCollapsed;
    if ($checkShowHud) $checkShowHud.checked = cfg.showHud !== false;
    if ($selectHudPosition) $selectHudPosition.value = cfg.hudPosition || 'bottom-left';
    if ($checkSplitScreen) $checkSplitScreen.checked = !!cfg.splitScreen;
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
