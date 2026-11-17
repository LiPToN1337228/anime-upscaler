// Anime UpScaler PRO — Content Script v4.3 (2026 Elite Edition)
// Advanced Neural Anime Upscaling & Restoration
// Fixes: Windowed black screen (DOM parent mounting), Split-Screen 120fps sync, Supreme Godmode (50-Pass UL), 4K Snapshot
(() => {
  if (window.__animeUpscalerProLoaded) return;
  window.__animeUpscalerProLoaded = true;

  const HOST = location.hostname || 'local';
  const DEFAULTS = {
    enabled: true,
    mode: 'godmode',          // default high-performance mode
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
    hosts: {}
  };

  const MODE_LABELS = {
    '1': 'Режим 1 (Денойз)',
    '2': 'Режим 2 (2× Upscale)',
    '3': 'Режим 3 (Upscale + Restore)',
    '4': 'Режим 4 — AnimeSR ★',
    '4-turbo': 'Режим 4 Turbo',
    '5': 'Режим 5 (M-Heavy)',
    'hq': 'HQ Кинематографичный',
    'ultra': 'Ultra Master (L-Tier)',
    'godmode': 'Supreme Godmode (50-Pass UL) 🚀',
    'auto': 'Авто-баланс',
    'bicubic': 'Бикубик + CAS'
  };

  const MODE_PASS_NAMES = {
    '1': ['Anime4kRestoreS'],
    '2': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
    '3': ['Anime4kUpscaleS', 'Anime4kRestoreS'],
    '4': ['Anime4kRestoreS', 'Anime4kUpscaleS', 'Anime4kRestoreS', 'Anime4kUpscaleS'],
    '4-turbo': ['Anime4kRestoreS', 'Anime4kUpscaleS', 'Anime4kRestoreS'],
    '5': ['Anime4kRestoreM', 'Anime4kUpscaleM', 'Anime4kRestoreM', 'Anime4kUpscaleM'],
    'hq': ['Anime4kRestoreM', 'Anime4kUpscaleM'],
    'ultra': ['Anime4kRestoreL', 'Anime4kUpscaleL'],
    'godmode': ['Anime4kRestoreUL', 'Anime4kUpscaleUL']
  };

  const AUTO_TIERS = ['1', '2', '4-turbo', '4', 'hq', 'ultra', 'godmode'];

  let cfg = { ...DEFAULTS };
  const activeProcessors = new Map(); // video -> VideoProcessor
  const playerWidgets    = new Map(); // video -> PlayerWidget
  let rescanInterval     = null;

  // ─── Storage Synchronization ────────────────────────────────────────────────
  function loadConfig() {
    try {
      chrome.storage.local.get(DEFAULTS, v => {
        cfg = { ...DEFAULTS, ...v };
        applyAll();
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        for (const k of Object.keys(changes)) cfg[k] = changes[k].newValue;
        applyAll();
      });
    } catch (e) {}
  }

  function isSiteActive() {
    if (cfg.enabled === false) return false;
    const h = cfg.hosts && cfg.hosts[HOST];
    return !(h && h.off);
  }

  function getEffectiveMode() {
    const h = cfg.hosts && cfg.hosts[HOST];
    return (h && h.mode) || cfg.mode || 'godmode';
  }

  function saveConfigPatch(patch) {
    cfg = { ...cfg, ...patch };
    try { chrome.storage.local.set(patch); } catch (e) {}
  }

  // ─── GLSL Shaders ───────────────────────────────────────────────────────────
  const VS_QUAD = `#version 300 es
    in vec2 aPos; out vec2 vUv;
    void main(){ vUv=aPos; gl_Position=vec4(aPos*2.0-1.0,0.0,1.0); }`;

  // Split-Screen Shader with glowing separation border
  const FS_SPLIT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uRaw, uUp;
    uniform float uSplitX;
    out vec4 c;
    void main(){
      float d = abs(vUv.x - uSplitX);
      if (d < 0.0018) {
        // Glowing Amber divider bar
        c = vec4(1.0, 0.75, 0.05, 1.0);
      } else if (vUv.x < uSplitX) {
        c = texture(uRaw, vUv);
      } else {
        c = texture(uUp, vUv);
      }
    }`;

  // AMD FidelityFX CAS + Vibrance Composite
  const FS_CAS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uSharpness;
    uniform float uVibrance;
    out vec4 fragColor;

    vec3 applyVibrance(vec3 col, float vib) {
      if (vib <= 0.001) return col;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float maxC = max(col.r, max(col.g, col.b));
      float minC = min(col.r, min(col.g, col.b));
      float sat = maxC - minC;
      return clamp(mix(col, mix(vec3(luma), col, 1.0 + vib * (1.0 - sat)), 1.0), 0.0, 1.0);
    }

    void main() {
      vec2 px = 1.0 / uTexSize;
      vec3 a = texture(uTex, vUv + vec2(-px.x, 0.0)).rgb;
      vec3 b = texture(uTex, vUv + vec2(px.x, 0.0)).rgb;
      vec3 c_ = texture(uTex, vUv + vec2(0.0, -px.y)).rgb;
      vec3 d = texture(uTex, vUv + vec2(0.0, px.y)).rgb;
      vec3 e = texture(uTex, vUv).rgb;

      vec3 minC = min(e, min(min(a, b), min(c_, d)));
      vec3 maxC = max(e, max(max(a, b), max(c_, d)));
      vec3 amp = clamp(min(minC, 2.0 - maxC) / max(maxC, vec3(0.0001)), 0.0, 1.0);
      vec3 w = amp * (-0.125 * uSharpness);
      vec3 res = (e + (a + b + c_ + d) * w) / (1.0 + 4.0 * w);

      res = applyVibrance(clamp(res, 0.0, 1.0), uVibrance);
      fragColor = vec4(res, 1.0);
    }`;

  const FS_BICUBIC = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uSharp;
    out vec4 fragColor;
    vec4 cubic(float v){
      vec4 n = vec4(1, 2, 3, 4) - v; vec4 s = n * n * n;
      float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x, w = 6.0 - x - y - z;
      return vec4(x, y, z, w) / 6.0;
    }
    vec4 sampleBicubic(vec2 uv){
      vec2 inv = 1.0 / uTexSize; vec2 p = uv * uTexSize - 0.5;
      vec2 f = fract(p); p -= f;
      vec4 xc = cubic(f.x), yc = cubic(f.y);
      vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
      vec4 off = (p.xxyy + vec2(-0.5, 1.5).xyxy + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
      return mix(mix(texture(uTex, off.yw), texture(uTex, off.xw), s.x / s.y),
                 mix(texture(uTex, off.yz), texture(uTex, off.xz), s.x / s.y), s.z / s.w);
    }
    void main(){
      vec4 c = sampleBicubic(vUv);
      vec2 px = 1.0 / uTexSize;
      vec4 blur = (texture(uTex, vUv + vec2(px.x, 0)) + texture(uTex, vUv - vec2(px.x, 0)) +
                   texture(uTex, vUv + vec2(0, px.y)) + texture(uTex, vUv - vec2(0, px.y))) * 0.25;
      fragColor = vec4(clamp((c + (c - blur) * uSharp).rgb, 0.0, 1.0), 1.0);
    }`;

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e);
    }
    return s;
  }
  function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const e = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(e);
    }
    return p;
  }

  // ─── VideoProcessor ─────────────────────────────────────────────────────────
  class VideoProcessor {
    constructor(video) {
      this.video       = video;
      this.isOn        = false;
      this.renderingId = 0;
      this.passes      = [];
      this.autoTierIdx = AUTO_TIERS.indexOf('godmode');
      this.videoFps    = 24;
      this.lastMediaTime = 0;
      this.emaMs       = 0;
      this.startedAt   = performance.now();
      this.lastTierAdjust = 0;
      this.frameTimes  = [];
      this.lastFpsUpdate = performance.now();
      this.actualFps   = 0;
      this.isDrm       = false;
      this._inFS       = false;

      this._lastPresentedFrame = -1;
      this._isLoopActive = false;

      this.canvas      = null;
      this.hudEl       = null;
      this.splitHandle = null;
      this.isDraggingSplit = false;

      this._trackBound = this._trackPosition.bind(this);
      this._rafId      = null;

      this._initGL();
      this._mountCanvas();
      this._initObservers();
      this._initFullscreen();
      this._initVideoPlaybackEvents();
      requestAnimationFrame(this._trackBound);
    }

    _initGL() {
      const c = document.createElement('canvas');
      c.className = '__au_canvas_overlay';
      c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;display:none;image-rendering:auto;';
      this.canvas = c;

      const gl = c.getContext('webgl2', {
        alpha: false, depth: false, stencil: false, antialias: false,
        premultipliedAlpha: false, preserveDrawingBuffer: true, // preserveDrawingBuffer enables 4K snapshots
        powerPreference: 'high-performance'
      });
      if (!gl) { console.warn('[AnimeUpScaler PRO] WebGL2 недоступен'); return; }

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      this.gl = gl;

      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);

      this.rawTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      try { this.progSplit   = createProgram(gl, VS_QUAD, FS_SPLIT);   } catch(e) {}
      try { this.progBicubic = createProgram(gl, VS_QUAD, FS_BICUBIC); } catch(e) {}
      try { this.progCas     = createProgram(gl, VS_QUAD, FS_CAS);     } catch(e) {}
    }

    // Mount canvas into the video parent element (Solves the Windowed Black Screen Bug 100%)
    _mountCanvas() {
      const v = this.video;
      if (!v || !this.canvas) return;
      const p = v.parentElement || document.body;

      if (this.canvas.parentElement !== p) {
        const comp = window.getComputedStyle(p);
        if (comp.position === 'static') {
          p.style.position = 'relative';
        }
        if (v.nextSibling) {
          p.insertBefore(this.canvas, v.nextSibling);
        } else {
          p.appendChild(this.canvas);
        }
      }
    }

    _trackPosition() {
      this._rafId = requestAnimationFrame(this._trackBound);
      if (this._inFS) return;

      const v = this.video;
      if (!document.contains(v)) return;
      const p = v.parentElement;
      if (!p) return;

      this._mountCanvas();

      const vR = v.getBoundingClientRect();
      const pR = p.getBoundingClientRect();
      const visible = vR.width > 4 && vR.height > 4;
      const c = this.canvas;

      if (this.isOn && visible) {
        c.style.position = 'absolute';
        c.style.left     = (vR.left - pR.left + p.scrollLeft) + 'px';
        c.style.top      = (vR.top  - pR.top  + p.scrollTop)  + 'px';
        c.style.width    = vR.width  + 'px';
        c.style.height   = vR.height + 'px';
        c.style.zIndex   = '2';
        c.style.display  = 'block';
      } else {
        c.style.display = 'none';
      }

      if (this.hudEl)       this._placeHudFixed(vR);
      if (this.splitHandle) this._placeSplitFixed(vR);
    }

    _placeHudFixed(r) {
      const h = this.hudEl;
      if (!h) return;
      const pos = cfg.hudPosition || 'bottom-left';
      const W = h.offsetWidth || 240;
      if (pos === 'top-right')         { h.style.left = (r.right - W - 14) + 'px'; h.style.top = (r.top + 14) + 'px'; }
      else if (pos === 'bottom-right') { h.style.left = (r.right - W - 14) + 'px'; h.style.top = (r.bottom - 46) + 'px'; }
      else if (pos === 'top-left')     { h.style.left = (r.left + 14) + 'px'; h.style.top = (r.top + 14) + 'px'; }
      else /* bottom-left */           { h.style.left = (r.left + 14) + 'px'; h.style.top = (r.bottom - 46) + 'px'; }
    }

    _placeSplitFixed(r) {
      if (!this.splitHandle) return;
      const sp = Number(cfg.splitPosition) || 0.5;
      this.splitHandle.style.left   = (r.left + r.width * sp) + 'px';
      this.splitHandle.style.top    = r.top    + 'px';
      this.splitHandle.style.height = r.height + 'px';
    }

    _initObservers() {
      this._resizeObs = new ResizeObserver(() => { if (this.video.videoWidth) this.rebuildPasses(); });
      this._resizeObs.observe(this.video);
      this._onVideoResize = () => this.rebuildPasses();
      this.video.addEventListener('resize', this._onVideoResize);
      this._onCanPlay = () => { if (this.video.mediaKeys) { this.isDrm = true; this.updateHUD('🛡 DRM'); } };
      this.video.addEventListener('canplay', this._onCanPlay);
    }

    _initVideoPlaybackEvents() {
      this._onPlay = () => {
        if (this.isOn && !this._isLoopActive) {
          const id = ++this.renderingId;
          this.renderLoop(id);
        }
      };
      this._onPause = () => {
        if (this.isOn) {
          setTimeout(() => this.renderSingleFrame(), 16);
        }
      };
      this._onSeeked = () => {
        if (this.isOn && (this.video.paused || this.video.ended)) {
          this.renderSingleFrame();
        }
      };

      this.video.addEventListener('play',   this._onPlay);
      this.video.addEventListener('pause',  this._onPause);
      this.video.addEventListener('seeked', this._onSeeked);
    }

    _initFullscreen() {
      this._onFSChange = () => {
        const fse = document.fullscreenElement || document.webkitFullscreenElement;
        if (fse) this._enterFullscreen(fse);
        else     this._exitFullscreen();
      };
      document.addEventListener('fullscreenchange',       this._onFSChange);
      document.addEventListener('webkitfullscreenchange', this._onFSChange);
    }

    _enterFullscreen(fse) {
      this._inFS = true;
      const container = (fse.tagName === 'VIDEO') ? (fse.parentElement || document.documentElement) : fse;

      const c = this.canvas;
      c.style.position = 'absolute';
      c.style.left     = '0'; c.style.top = '0';
      c.style.width    = '100%'; c.style.height = '100%';
      c.style.zIndex   = '2';
      if (this.isOn) c.style.display = 'block';
      container.appendChild(c);

      if (this.hudEl) {
        this.hudEl.style.position = 'absolute';
        this.hudEl.style.zIndex   = '2147483645';
        this._setHudAbsoluteCorner();
        container.appendChild(this.hudEl);
      }

      if (this.splitHandle) {
        this.splitHandle.style.position = 'absolute';
        this.splitHandle.style.top      = '0';
        this.splitHandle.style.height   = '100%';
        this.splitHandle.style.left     = (Number(cfg.splitPosition) || 0.5) * 100 + '%';
        container.appendChild(this.splitHandle);
      }

      const widget = playerWidgets.get(this.video);
      if (widget && widget.el) {
        widget.el.style.position = 'absolute';
        widget.el.style.left     = '14px';
        widget.el.style.top      = '14px';
        container.appendChild(widget.el);
      }

      this._fsContainer = container;
    }

    _exitFullscreen() {
      this._inFS = false;
      this._fsContainer = null;
      this._mountCanvas();

      if (this.hudEl) {
        this.hudEl.style.position = 'fixed';
        document.documentElement.appendChild(this.hudEl);
      }
      if (this.splitHandle) {
        this.splitHandle.style.position = 'fixed';
        document.documentElement.appendChild(this.splitHandle);
      }

      const widget = playerWidgets.get(this.video);
      if (widget && widget.el) {
        widget.el.style.position = 'fixed';
        document.documentElement.appendChild(widget.el);
      }
    }

    _setHudAbsoluteCorner() {
      if (!this.hudEl) return;
      const pos = cfg.hudPosition || 'bottom-left';
      this.hudEl.style.left   = '';
      this.hudEl.style.top    = '';
      this.hudEl.style.right  = '';
      this.hudEl.style.bottom = '';
      if (pos === 'top-right')         { this.hudEl.style.right = '14px'; this.hudEl.style.top    = '14px'; }
      else if (pos === 'bottom-right') { this.hudEl.style.right = '14px'; this.hudEl.style.bottom = '64px'; }
      else if (pos === 'top-left')     { this.hudEl.style.left  = '14px'; this.hudEl.style.top    = '14px'; }
      else /* bottom-left */           { this.hudEl.style.left  = '14px'; this.hudEl.style.bottom = '64px'; }
    }

    getActiveModeKey() {
      const eff = getEffectiveMode();
      if (eff === 'auto') {
        const ceil = Math.max(0, AUTO_TIERS.indexOf(cfg.autoCeiling || 'godmode'));
        return AUTO_TIERS[Math.min(this.autoTierIdx, ceil)] || 'godmode';
      }
      return eff;
    }

    rebuildPasses() {
      const gl = this.gl, v = this.video;
      if (!gl || !v || !v.videoWidth || !v.videoHeight) return;
      for (const p of this.passes) p && p.destroy && p.destroy();
      this.passes = [];

      const mode = this.getActiveModeKey();
      if (mode === 'bicubic') {
        this.canvas.width  = v.videoWidth;
        this.canvas.height = v.videoHeight;
        return;
      }

      const names  = MODE_PASS_NAMES[mode] || MODE_PASS_NAMES['godmode'] || MODE_PASS_NAMES['4'];
      const engine = window.AnimeSREngine;
      if (!engine || !engine.passes) return;

      let curW = v.videoWidth, curH = v.videoHeight, prev = null;
      try {
        for (const name of names) {
          const PC = engine.passes[name];
          if (!PC) continue;
          const pass = new PC(gl, prev ? prev.outputTexture : null, curW, curH);
          this.passes.push(pass);
          curW = pass.outputWidth; curH = pass.outputHeight; prev = pass;
        }
        const n = this.passes.length;
        if (n > 0) {
          this.passes[n - 1].isLastPass = !cfg.splitScreen;
          this.canvas.width  = this.passes[n - 1].outputWidth;
          this.canvas.height = this.passes[n - 1].outputHeight;
        } else {
          this.canvas.width  = v.videoWidth;
          this.canvas.height = v.videoHeight;
        }
      } catch (err) {
        console.error('[AnimeUpScaler PRO] rebuildPasses:', err);
      }
    }

    start() {
      if (this.isOn) return;
      this.isOn = true;
      this.isDrm = !!this.video.mediaKeys;
      this._mountCanvas();
      this.canvas.style.display = 'block';
      this.video.style.opacity  = '0.001';
      this.rebuildPasses();
      this.updateHUD();
      this.updateSplitHandle();

      const fse = document.fullscreenElement || document.webkitFullscreenElement;
      if (fse) this._enterFullscreen(fse);

      const id = ++this.renderingId;
      this.renderLoop(id);
    }

    stop() {
      this.isOn = false;
      this.renderingId++;
      this._isLoopActive = false;
      if (this.canvas) this.canvas.style.display = 'none';
      if (this.video)  this.video.style.opacity  = '';
      if (this.hudEl)  { this.hudEl.remove(); this.hudEl = null; }
      if (this.splitHandle) { this.splitHandle.remove(); this.splitHandle = null; }
    }

    renderSingleFrame() {
      const v = this.video, gl = this.gl;
      if (v && gl && v.readyState >= 2 && v.videoHeight > 0) {
        this.renderFrame();
      }
    }

    // ── Smart Zero-Idle Render Loop ──────────────────────────────────────────
    renderLoop(runId) {
      if (!this.isOn || this.renderingId !== runId) {
        this._isLoopActive = false;
        return;
      }

      const v = this.video;
      // If paused, halt continuous loop to let GPU rest (Smart Zero-Idle)
      if (cfg.smartSync && (v.paused || v.ended)) {
        this._isLoopActive = false;
        return;
      }

      this._isLoopActive = true;
      const gl = this.gl;

      if (typeof v.requestVideoFrameCallback === 'function' && cfg.smartSync) {
        v.requestVideoFrameCallback((now, meta) => {
          if (!this.isOn || this.renderingId !== runId) return;

          const frameAdvanced = meta && typeof meta.presentedFrames === 'number'
            ? meta.presentedFrames !== this._lastPresentedFrame
            : true;

          if (frameAdvanced && v.readyState >= 2 && v.videoHeight > 0) {
            if (meta && typeof meta.presentedFrames === 'number') {
              this._lastPresentedFrame = meta.presentedFrames;
            }
            const t0 = performance.now();
            this.renderFrame();
            const ms = performance.now() - t0;
            this.recordFrameStats(ms);
            this.governAutoMode(ms);
          }

          if (meta && typeof meta.mediaTime === 'number') {
            const dt = meta.mediaTime - this.lastMediaTime;
            if (dt > 0.005 && dt < 1.0) this.videoFps = this.videoFps * 0.85 + (1 / dt) * 0.15;
            this.lastMediaTime = meta.mediaTime;
          }

          this.renderLoop(runId);
        });
      } else {
        if (v && gl && v.readyState >= 2 && v.videoHeight > 0) {
          const t0 = performance.now();
          this.renderFrame();
          const ms = performance.now() - t0;
          this.recordFrameStats(ms);
          this.governAutoMode(ms);
        }
        requestAnimationFrame(() => this.renderLoop(runId));
      }
    }

    renderFrame() {
      const gl = this.gl, v = this.video, passes = this.passes;
      const mode = this.getActiveModeKey();

      try {
        if (mode === 'bicubic' || passes.length === 0) {
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, this.canvas.width, this.canvas.height);
          gl.useProgram(this.progBicubic);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
          const a = gl.getAttribLocation(this.progBicubic, 'aPos');
          gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.uniform1i(gl.getUniformLocation(this.progBicubic, 'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(this.progBicubic, 'uTexSize'), v.videoWidth, v.videoHeight);
          gl.uniform1f(gl.getUniformLocation(this.progBicubic, 'uSharp'), Number(cfg.strength) || 0.7);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          return;
        }

        // Dynamically ensure last pass renders to texture if split-screen is active
        if (passes.length > 0) {
          passes[passes.length - 1].isLastPass = !cfg.splitScreen;
        }

        // 1. Upload Video Frame into Pass 0 Input
        gl.bindTexture(gl.TEXTURE_2D, passes[0].inputTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.FLOAT, v);

        // Upload to rawTexture if split-screen is active
        if (cfg.splitScreen) {
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        }

        // 2. Render all neural passes
        for (let i = 0; i < passes.length; i++) {
          passes[i].render();
        }

        // 3. Composite Split Screen if active
        if (cfg.splitScreen && passes.length > 0) {
          const last = passes[passes.length - 1];
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, this.canvas.width, this.canvas.height);
          gl.useProgram(this.progSplit);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
          const a = gl.getAttribLocation(this.progSplit, 'aPos');
          gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.uniform1i(gl.getUniformLocation(this.progSplit, 'uRaw'), 0);

          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, last.outputTexture);
          gl.uniform1i(gl.getUniformLocation(this.progSplit, 'uUp'), 1);

          gl.uniform1f(gl.getUniformLocation(this.progSplit, 'uSplitX'), Number(cfg.splitPosition) || 0.5);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
      } catch (e) {
        console.warn('[AnimeUpScaler PRO] renderFrame:', e);
      }
    }

    recordFrameStats(ms) {
      this.frameTimes.push(ms);
      if (this.frameTimes.length > 30) this.frameTimes.shift();
      this.emaMs = this.emaMs ? this.emaMs * 0.85 + ms * 0.15 : ms;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 600) {
        this.actualFps = Math.min(60, Math.round(this.videoFps || 24));
        this.lastFpsUpdate = now;
        this.updateHUD();
      }
    }

    governAutoMode(ms) {
      if (getEffectiveMode() !== 'auto') return;
      const now = performance.now();
      if (now - this.startedAt < 3000) return;
      const budget = (1000 / Math.max(20, Math.min(60, this.videoFps || 24))) * 0.85;
      const ceil = Math.max(0, AUTO_TIERS.indexOf(cfg.autoCeiling || 'godmode'));
      if (this.emaMs > budget && now - this.lastTierAdjust > 3000 && this.autoTierIdx > 0) {
        this.autoTierIdx--; this.lastTierAdjust = now; this.rebuildPasses(); this.updateHUD('⚡ Снижена мощность');
      } else if (this.emaMs < budget * 0.55 && now - this.lastTierAdjust > 7000 && this.autoTierIdx < ceil) {
        this.autoTierIdx++; this.lastTierAdjust = now; this.rebuildPasses(); this.updateHUD('🚀 Повышена мощность');
      }
    }

    updateHUD(notice) {
      if (!cfg.showHud || !this.isOn) {
        if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; }
        return;
      }
      if (!this.hudEl) {
        const h = document.createElement('div');
        h.className = '__au_pro_hud';
        h.style.cssText = [
          'position:fixed', 'z-index:2147483645', 'pointer-events:none', 'user-select:none',
          'background:rgba(10,14,22,0.90)', 'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
          'border:1px solid rgba(80,227,194,0.35)', 'border-radius:8px',
          'color:#e2e8f0', 'font:600 11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace',
          'padding:4px 10px', 'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
          'display:flex', 'align-items:center', 'gap:7px', 'white-space:nowrap',
          'transition:opacity 0.25s ease'
        ].join(';');
        document.documentElement.appendChild(h);
        this.hudEl = h;

        if (this._inFS && this._fsContainer) {
          this.hudEl.style.position = 'absolute';
          this._setHudAbsoluteCorner();
          this._fsContainer.appendChild(this.hudEl);
        }
      }

      const key   = this.getActiveModeKey();
      const label = MODE_LABELS[key] || key;
      const v     = this.video;
      const res   = v.videoWidth ? `${v.videoWidth}→${this.canvas.width}` : '–';
      const ms    = this.emaMs.toFixed(1);
      const dot   = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#50e3c2;box-shadow:0 0 8px #50e3c2"></span>`;

      this.hudEl.innerHTML = `
        ${dot}
        <span style="color:#50e3c2;font-weight:800">${getEffectiveMode() === 'auto' ? 'AUTO' : 'A4K'}</span>
        <span style="color:#475569">|</span>
        <span style="color:#f1f5f9">${label}</span>
        <span style="color:#475569">|</span>
        <span style="color:#38bdf8">${this.actualFps} fps</span>
        <span style="color:#334155">·</span>
        <span style="color:${this.emaMs > 30 ? '#f87171' : '#a7f3d0'}">${ms}ms</span>
        <span style="color:#334155">·</span>
        <span style="color:#94a3b8">${res}p</span>
        ${notice ? `<span style="color:#fbbf24">[${notice}]</span>` : ''}`;
    }

    updateSplitHandle() {
      if (!cfg.splitScreen || !this.isOn) {
        if (this.splitHandle) { this.splitHandle.remove(); this.splitHandle = null; }
        return;
      }
      if (!this.splitHandle) {
        const sh = document.createElement('div');
        sh.className = '__au_split_handle';
        sh.style.cssText = 'position:fixed;z-index:2147483646;cursor:ew-resize;pointer-events:auto;width:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateX(-50%);';
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;width:2px;height:100%;background:#fbbf24;box-shadow:0 0 10px #fbbf24;';
        const badge = document.createElement('div');
        badge.style.cssText = 'position:relative;z-index:2;background:#0d1117;border:1px solid #fbbf24;border-radius:14px;padding:3px 8px;font:700 10px system-ui;color:#fbbf24;box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap;user-select:none;';
        badge.textContent = '◀ RAW | 4K ▶';
        sh.appendChild(line); sh.appendChild(badge);
        document.documentElement.appendChild(sh);
        this.splitHandle = sh;

        const onMove = (e) => {
          if (!this.isDraggingSplit) return;
          const r = this.video.getBoundingClientRect();
          const cx = e.touches ? e.touches[0].clientX : e.clientX;
          const ratio = Math.max(0.02, Math.min(0.98, (cx - r.left) / r.width));
          cfg.splitPosition = ratio;
          this._placeSplitFixed(r);
        };
        const onUp = () => {
          if (this.isDraggingSplit) {
            this.isDraggingSplit = false;
            saveConfigPatch({ splitPosition: cfg.splitPosition });
          }
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onUp);
        };
        sh.addEventListener('mousedown', e => {
          e.preventDefault(); this.isDraggingSplit = true;
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
        sh.addEventListener('touchstart', e => {
          this.isDraggingSplit = true;
          window.addEventListener('touchmove', onMove);
          window.addEventListener('touchend', onUp);
        });
      }
    }

    // Capture current 4K Upscaled Frame to PNG Wallpaper
    take4KSnapshot() {
      if (!this.canvas) return;
      try {
        const dataUrl = this.canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `AnimeUpScaler_4K_${timestamp}.png`;
        a.href = dataUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
        this.updateHUD('📸 4K Снимок сохранён!');
      } catch (err) {
        console.warn('Snapshot failed:', err);
      }
    }

    destroy() {
      this.stop();
      if (this._rafId) cancelAnimationFrame(this._rafId);
      document.removeEventListener('fullscreenchange',       this._onFSChange);
      document.removeEventListener('webkitfullscreenchange', this._onFSChange);
      if (this._resizeObs) this._resizeObs.disconnect();
      this.video.removeEventListener('resize',  this._onVideoResize);
      this.video.removeEventListener('canplay', this._onCanPlay);
      this.video.removeEventListener('play',    this._onPlay);
      this.video.removeEventListener('pause',   this._onPause);
      this.video.removeEventListener('seeked',  this._onSeeked);
      for (const p of this.passes) p && p.destroy && p.destroy();
      this.passes = [];
      if (this.gl) {
        try { const e = this.gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (e) {}
      }
      if (this.canvas) this.canvas.remove();
    }
  }

  // ─── Collapsible Glassmorphic Floating Widget ("Smart Pill") ────────────────
  class PlayerWidget {
    constructor(video) {
      this.video = video;
      this.isCollapsed = !!cfg.widgetCollapsed;
      this.autoHideTimer = null;
      this.isHoveringWidget = false;

      this._initDOM();
      this._initAutoHiding();
      this._startTracking();
    }

    _initDOM() {
      const w = document.createElement('div');
      w.className = '__au_widget_capsule';
      w.style.cssText = [
        'position:fixed',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'gap:6px',
        'background:rgba(12,18,28,0.88)',
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'border:1px solid rgba(255,255,255,0.14)',
        'border-radius:24px',
        'padding:4px',
        'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'transition:opacity 0.28s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1), width 0.22s ease',
        'user-select:none',
        'opacity:0',
        'pointer-events:none'
      ].join(';');

      // 1. Main Action Button
      const btnAction = document.createElement('div');
      btnAction.className = '__au_widget_main_btn';
      btnAction.style.cssText = [
        'display:flex', 'align-items:center', 'gap:5px',
        'padding:6px 14px',
        'background:linear-gradient(135deg,#f59e0b,#d97706)',
        'color:#0d0d0d', 'font:700 13px/1 system-ui,-apple-system,sans-serif',
        'border-radius:18px', 'cursor:pointer',
        'box-shadow:0 2px 12px rgba(245,158,11,0.4)',
        'transition:all 0.15s ease'
      ].join(';');
      btnAction.innerHTML = `<span style="font-size:14px">⚡</span><span>Улучшить</span>`;
      w.appendChild(btnAction);
      this.btnAction = btnAction;

      // 2. 4K Snapshot Camera Button
      const btnSnapshot = document.createElement('div');
      btnSnapshot.title = '📸 Сохранить 4K кадр (Обои)';
      btnSnapshot.style.cssText = [
        'width:26px', 'height:26px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:50%', 'background:rgba(255,255,255,0.06)',
        'color:#94a3b8', 'font-size:13px', 'cursor:pointer',
        'transition:all 0.15s ease'
      ].join(';');
      btnSnapshot.textContent = '📸';
      btnSnapshot.addEventListener('mouseenter', () => {
        btnSnapshot.style.background = 'rgba(255,255,255,0.14)';
        btnSnapshot.style.color = '#fff';
      });
      btnSnapshot.addEventListener('mouseleave', () => {
        btnSnapshot.style.background = 'rgba(255,255,255,0.06)';
        btnSnapshot.style.color = '#94a3b8';
      });
      btnSnapshot.addEventListener('click', (e) => {
        e.stopPropagation();
        const proc = activeProcessors.get(this.video);
        if (proc) proc.take4KSnapshot();
      });
      w.appendChild(btnSnapshot);
      this.btnSnapshot = btnSnapshot;

      // 3. Settings Gear Button
      const btnSettings = document.createElement('div');
      btnSettings.title = 'Детальные настройки Anime UpScaler PRO';
      btnSettings.style.cssText = [
        'width:26px', 'height:26px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:50%', 'background:rgba(255,255,255,0.06)',
        'color:#94a3b8', 'font-size:13px', 'cursor:pointer',
        'transition:all 0.15s ease'
      ].join(';');
      btnSettings.textContent = '⚙️';
      btnSettings.addEventListener('mouseenter', () => {
        btnSettings.style.background = 'rgba(255,255,255,0.14)';
        btnSettings.style.color = '#fff';
      });
      btnSettings.addEventListener('mouseleave', () => {
        btnSettings.style.background = 'rgba(255,255,255,0.06)';
        btnSettings.style.color = '#94a3b8';
      });
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ op: 'OPEN_OPTIONS' });
      });
      w.appendChild(btnSettings);
      this.btnSettings = btnSettings;

      // 4. Collapse Toggle Chevron
      const btnCollapse = document.createElement('div');
      btnCollapse.title = 'Свернуть в мини-иконку';
      btnCollapse.style.cssText = [
        'width:22px', 'height:26px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:12px', 'background:transparent',
        'color:#64748b', 'font-size:14px', 'font-weight:700', 'cursor:pointer',
        'padding-right:2px',
        'transition:all 0.15s ease'
      ].join(';');
      btnCollapse.textContent = '‹';
      btnCollapse.addEventListener('mouseenter', () => { btnCollapse.style.color = '#fff'; });
      btnCollapse.addEventListener('mouseleave', () => { btnCollapse.style.color = '#64748b'; });
      btnCollapse.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
      w.appendChild(btnCollapse);
      this.btnCollapse = btnCollapse;

      // Click on main button -> toggle upscaling
      btnAction.addEventListener('click', (e) => {
        e.stopPropagation();
        const proc = activeProcessors.get(this.video);
        if (!proc) return;
        if (proc.isOn) {
          proc.stop();
          this.updateState(false);
        } else {
          proc.start();
          this.updateState(true);
        }
      });

      // Hover on widget prevents auto-hiding
      w.addEventListener('mouseenter', () => {
        this.isHoveringWidget = true;
        clearTimeout(this.autoHideTimer);
        w.style.opacity = '1';
        w.style.pointerEvents = 'auto';
        if (this.isCollapsed) {
          this._applyCollapseVisuals(false);
        }
      });
      w.addEventListener('mouseleave', () => {
        this.isHoveringWidget = false;
        if (this.isCollapsed) {
          this._applyCollapseVisuals(true);
        }
        this._armAutoHide();
      });

      document.documentElement.appendChild(w);
      this.el = w;

      if (this.isCollapsed) {
        this._applyCollapseVisuals(true);
      }
    }

    _applyCollapseVisuals(collapsed) {
      if (!this.el) return;
      if (collapsed) {
        this.btnSnapshot.style.display = 'none';
        this.btnSettings.style.display = 'none';
        this.btnCollapse.style.display = 'none';
        this.btnAction.style.padding = '6px 10px';
        this.btnAction.innerHTML = `<span style="font-size:14px">⚡</span>`;
        this.el.style.borderRadius = '50%';
        this.el.style.padding = '3px';
        this.el.title = 'Нажмите или наведите, чтобы развернуть Anime UpScaler';
      } else {
        this.btnSnapshot.style.display = 'flex';
        this.btnSettings.style.display = 'flex';
        this.btnCollapse.style.display = 'flex';
        this.btnAction.style.padding = '6px 14px';
        const proc = activeProcessors.get(this.video);
        const on = proc && proc.isOn;
        this.btnAction.innerHTML = on
          ? `<span style="font-size:14px">✨</span><span>4K ON</span>`
          : `<span style="font-size:14px">⚡</span><span>Улучшить</span>`;
        this.el.style.borderRadius = '24px';
        this.el.style.padding = '4px';
        this.el.title = '';
      }
    }

    toggleCollapse() {
      this.isCollapsed = !this.isCollapsed;
      saveConfigPatch({ widgetCollapsed: this.isCollapsed });
      this._applyCollapseVisuals(this.isCollapsed);
    }

    updateState(isOn) {
      if (isOn) {
        this.btnAction.innerHTML = this.isCollapsed
          ? `<span style="font-size:14px">✨</span>`
          : `<span style="font-size:14px">✨</span><span>4K ON</span>`;
        this.btnAction.style.background = 'linear-gradient(135deg,#10b981,#059669)';
        this.btnAction.style.boxShadow = '0 2px 14px rgba(16,185,129,0.4)';
      } else {
        this.btnAction.innerHTML = this.isCollapsed
          ? `<span style="font-size:14px">⚡</span>`
          : `<span style="font-size:14px">⚡</span><span>Улучшить</span>`;
        this.btnAction.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
        this.btnAction.style.boxShadow = '0 2px 14px rgba(245,158,11,0.4)';
      }
    }

    // ── Inactivity Auto-Hiding ───────────────────────────────────────────────
    _initAutoHiding() {
      const targetContainer = this.video.parentElement || document.documentElement;

      this._onActivity = () => {
        if (!cfg.autoHideUI) return;
        this.showUI();
        this._armAutoHide();
      };

      targetContainer.addEventListener('mousemove',  this._onActivity);
      targetContainer.addEventListener('mouseenter', this._onActivity);
      targetContainer.addEventListener('touchstart', this._onActivity);

      this._armAutoHide();
    }

    showUI() {
      if (!this.el) return;
      this.el.style.opacity = '1';
      this.el.style.pointerEvents = 'auto';

      const proc = activeProcessors.get(this.video);
      if (proc && proc.hudEl && cfg.showHud) {
        proc.hudEl.style.opacity = '1';
      }
    }

    hideUI() {
      if (this.isHoveringWidget) return;
      if (!this.el) return;
      this.el.style.opacity = '0';
      this.el.style.pointerEvents = 'none';

      const proc = activeProcessors.get(this.video);
      if (proc && proc.hudEl) {
        proc.hudEl.style.opacity = '0';
      }
    }

    _armAutoHide() {
      if (!cfg.autoHideUI) return;
      clearTimeout(this.autoHideTimer);
      const delay = Number(cfg.autoHideDelay) || 2500;
      this.autoHideTimer = setTimeout(() => {
        this.hideUI();
      }, delay);
    }

    _startTracking() {
      const updatePos = () => {
        if (!document.contains(this.video)) return;
        const fse = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fse) {
          const r = this.video.getBoundingClientRect();
          if (r.width > 4 && r.height > 4) {
            this.el.style.left = (r.left + 14) + 'px';
            this.el.style.top  = (r.top  + 14) + 'px';
            if (!cfg.autoHideUI) {
              this.el.style.opacity = '1';
              this.el.style.pointerEvents = 'auto';
            }
          } else {
            this.el.style.opacity = '0';
            this.el.style.pointerEvents = 'none';
          }
        }
        this._trackRaf = requestAnimationFrame(updatePos);
      };
      this._trackRaf = requestAnimationFrame(updatePos);
    }

    destroy() {
      if (this._trackRaf) cancelAnimationFrame(this._trackRaf);
      clearTimeout(this.autoHideTimer);
      if (this.el) this.el.remove();
    }
  }

  // ─── Video Discovery ────────────────────────────────────────────────────────
  function collectVideos(root, list) {
    if (!root) return;
    try { for (const v of root.querySelectorAll('video')) list.add(v); } catch (e) {}
    try {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectVideos(el.shadowRoot, list);
      }
    } catch (e) {}
  }

  function scanForVideos() {
    const found = new Set();
    collectVideos(document, found);

    // Remove dead
    for (const [video, proc] of activeProcessors.entries()) {
      if (!found.has(video) || !document.contains(video)) {
        proc.destroy();
        activeProcessors.delete(video);

        const w = playerWidgets.get(video);
        if (w) { w.destroy(); playerWidgets.delete(video); }
      }
    }

    // Add new
    for (const v of found) {
      if (activeProcessors.has(v)) continue;

      const proc = new VideoProcessor(v);
      activeProcessors.set(v, proc);

      if (cfg.buttonStyle !== 'hidden') {
        const widget = new PlayerWidget(v);
        playerWidgets.set(v, widget);
      }

      if (isSiteActive()) {
        const tryStart = () => {
          if (v.readyState >= 2 && v.videoWidth > 0) {
            proc.start();
            const w = playerWidgets.get(v);
            if (w) w.updateState(true);
          } else {
            v.addEventListener('loadeddata', () => tryStart(), { once: true });
            v.addEventListener('canplay',    () => tryStart(), { once: true });
          }
        };
        tryStart();
      }
    }
  }

  function applyAll() {
    const active = isSiteActive();
    for (const [video, proc] of activeProcessors.entries()) {
      const widget = playerWidgets.get(video);
      if (active) {
        if (!proc.isOn) proc.start();
        proc.rebuildPasses();
        if (widget) widget.updateState(true);
      } else {
        if (proc.isOn) proc.stop();
        if (widget) widget.updateState(false);
      }
    }
  }

  // ─── Message Listener ───────────────────────────────────────────────────────
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.op === 'APPLY_CONFIG') {
        chrome.storage.local.get(DEFAULTS, v => {
          cfg = { ...DEFAULTS, ...v };
          applyAll();
          sendResponse({ ok: true });
        });
        return true;
      }
      if (msg.op === 'TOGGLE_ACTIVE') {
        const h = { ...(cfg.hosts || {}) };
        const off = !!(h[HOST] && h[HOST].off);
        if (off) delete h[HOST]; else h[HOST] = { off: true };
        saveConfigPatch({ hosts: h });
        applyAll();
        sendResponse({ ok: true, active: isSiteActive() });
      } else if (msg.op === 'TOGGLE_HUD') {
        saveConfigPatch({ showHud: !cfg.showHud });
        applyAll();
        sendResponse({ ok: true, showHud: cfg.showHud });
      } else if (msg.op === 'TOGGLE_SPLIT') {
        saveConfigPatch({ splitScreen: !cfg.splitScreen });
        applyAll();
        sendResponse({ ok: true, splitScreen: cfg.splitScreen });
      } else if (msg.op === 'MODE_NEXT' || msg.op === 'MODE_PREV') {
        const keys = Object.keys(MODE_PASS_NAMES);
        const cur = getEffectiveMode();
        let idx = keys.indexOf(cur);
        if (idx === -1) idx = keys.indexOf('godmode');
        const ni = msg.op === 'MODE_NEXT' ? (idx + 1) % keys.length : (idx - 1 + keys.length) % keys.length;
        saveConfigPatch({ mode: keys[ni] });
        applyAll();
        sendResponse({ ok: true, mode: keys[ni] });
      } else if (msg.op === 'TAKE_SNAPSHOT') {
        for (const p of activeProcessors.values()) {
          if (p.isOn) { p.take4KSnapshot(); break; }
        }
        sendResponse({ ok: true });
      } else if (msg.op === 'GET_STATUS') {
        let res = '–', fps = 0, ms = 0;
        for (const p of activeProcessors.values()) {
          if (p.isOn && p.video) {
            res = `${p.video.videoWidth}x${p.video.videoHeight}→${p.canvas.width}x${p.canvas.height}`;
            fps = p.actualFps; ms = p.emaMs; break;
          }
        }
        sendResponse({
          ok: true, active: isSiteActive(), mode: getEffectiveMode(),
          videoCount: activeProcessors.size, resolution: res, fps, renderMs: ms
        });
      }
    });
  } catch (e) {}

  // ─── Initialization ─────────────────────────────────────────────────────────
  const domObs = new MutationObserver(() => scanForVideos());
  domObs.observe(document.documentElement, { childList: true, subtree: true });

  let scanCount = 0;
  rescanInterval = setInterval(() => {
    scanForVideos(); scanCount++;
    if (scanCount > 20) {
      clearInterval(rescanInterval);
      rescanInterval = setInterval(scanForVideos, 3000);
    }
  }, 1000);

  loadConfig();
  scanForVideos();
})();
