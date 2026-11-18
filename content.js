// Anime UpScaler PRO — Content Script v4.3 (2026 Elite Edition)
// Advanced Neural Anime Upscaling & Restoration
// Fixes: Windowed black screen (DOM parent mounting), Split-Screen 120fps sync, Supreme Godmode (50-Pass UL), 4K Snapshot
(() => {
  if (window.__animeUpscalerProLoaded) return;
  window.__animeUpscalerProLoaded = true;

  const HOST = location.hostname || 'local';
  function cleanDomain(d) {
    if (!d) return '';
    return String(d).toLowerCase().replace(/^www\./, '').split(':')[0].trim();
  }
  const CLEAN_HOST = cleanDomain(HOST);
  const DEFAULTS = {
    enabled: true,
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
    mode: 'godmode',          // default high-performance mode
    autoCeiling: 'godmode',
    splitScreen: false,
    splitPosition: 0.5,
    showHud: true,
    hudPosition: 'bottom-left',
    strength: 0.7,
    enableCas: true,
    enableHighlightClamp: true,
    enableFilmGrain: false,
    grainStrength: 0.035,
    enableDeband: true,
    enableVibrance: true,
    vibranceStrength: 0.18,
    enableChromaRecon: true,
    enableTemporalStability: true,
    enableLineEnhance: true,
    lineDarken: 0.35,
    lineThin: 0.20,
    enableBloom: false,
    bloomStrength: 0.15,
    batterySaver: true,
    genrePreset: 'auto',
    smartSync: true,
    maxResolution: 'native',
    autoHideUI: true,
    autoHideDelay: 2500,
    buttonStyle: 'pill',
    widgetCollapsed: false,
    hosts: {}
  };

  const MODE_LABELS = {
    '1': 'Режим 1 (Денойз) ▾',
    '2': 'Режим 2 (2× Upscale) ▾',
    '3': 'Режим 3 (Upscale + Restore) ▾',
    '4': '★ Режим 4 ▾',
    '4-turbo': '⚡ 4 Turbo ▾',
    '5': 'Режим 5 (M-Heavy) ▾',
    'hq': '🎬 HQ Кино ▾',
    'ultra': '💎 Ultra Master ▾',
    'godmode': '🚀 Supreme Godmode ▾',
    'modern': 'Современное аниме ▾',
    'retro': 'Ретро аниме ▾',
    'auto': '🤖 Авто-баланс ▾',
    'bicubic': 'Бикубик + CAS ▾'
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
    'godmode': ['Anime4kRestoreUL', 'Anime4kUpscaleUL'],
    'modern': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
    'retro': ['Anime4kRestoreUL', 'Anime4kUpscaleL']
  };

  const AUTO_TIERS = ['1', '2', '4-turbo', '4', 'modern', 'hq', 'ultra', 'godmode'];

  let cfg = { ...DEFAULTS };
  const activeProcessors = new Map(); // video -> VideoProcessor
  const playerWidgets    = new Map(); // video -> PlayerWidget
  let rescanInterval     = null;

  function purgeDOM() {
    try {
      const selectors = [
        '.__au_widget_capsule',
        '.__au_pro_hud',
        '.__au_canvas_overlay',
        '.__au_split_handle',
        '.__au_split_badge_left',
        '.__au_split_badge_right',
        '.__au_quick_menu'
      ];
      const elements = document.querySelectorAll(selectors.join(', '));
      elements.forEach(el => {
        try { el.remove(); } catch (e) {}
      });
    } catch (e) {}
  }

  // ─── Storage Synchronization ────────────────────────────────────────────────
  function loadConfig() {
    try {
      chrome.storage.local.get(DEFAULTS, v => {
        cfg = { ...DEFAULTS, ...v };
        if (!isSiteAllowed()) {
          purgeDOM();
        }
        applyAll();
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const keys = Object.keys(changes);
        for (const k of keys) cfg[k] = changes[k].newValue;

        // Zero-lag fast path: if only cosmetic UI flags changed, update widgets directly without touching WebGL
        const isOnlyUI = keys.every(k => k === 'widgetCollapsed' || k === 'autoHideUI' || k === 'autoHideDelay' || k === 'hudPosition' || k === 'buttonStyle');
        if (isOnlyUI) {
          if (changes.widgetCollapsed !== undefined) {
            for (const w of playerWidgets.values()) {
              w._applyCollapseVisuals(!!cfg.widgetCollapsed);
            }
          }
          return;
        }

        if (!isSiteAllowed()) {
          purgeDOM();
        }
        applyAll();
      });
    } catch (e) {}
  }

  function isSiteAllowed() {
    if (cfg.hosts) {
      if (cfg.hosts[HOST] && cfg.hosts[HOST].off === true) return false;
      if (cfg.hosts[CLEAN_HOST] && cfg.hosts[CLEAN_HOST].off === true) return false;
      if (cfg.hosts[HOST] && cfg.hosts[HOST].allowed === true) return true;
      if (cfg.hosts[CLEAN_HOST] && cfg.hosts[CLEAN_HOST].allowed === true) return true;
    }
    if (cfg.siteMode === 'all') return true;

    const list = Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts : DEFAULTS.allowedHosts;
    return list.some(item => {
      const it = cleanDomain(item);
      return CLEAN_HOST === it || CLEAN_HOST.endsWith('.' + it);
    });
  }

  function isSiteActive() {
    if (!isSiteAllowed()) return false;
    if (cfg.enabled === false) return false;
    const h = (cfg.hosts && (cfg.hosts[HOST] || cfg.hosts[CLEAN_HOST])) || null;
    return !(h && h.off);
  }

  function getEffectiveMode() {
    const h = cfg.hosts && cfg.hosts[HOST];
    if (h && h.mode) return h.mode;
    if (cfg.genrePreset && cfg.genrePreset !== 'auto') {
      return cfg.genrePreset;
    }
    return cfg.mode || 'godmode';
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
      } else if (d < 0.0055) {
        // Soft outer glow around divider
        vec4 base = (vUv.x < uSplitX) ? texture(uRaw, vUv) : texture(uUp, vUv);
        float glow = (1.0 - (d - 0.0018) / 0.0037) * 0.45;
        c = mix(base, vec4(1.0, 0.75, 0.05, 1.0), glow);
      } else if (vUv.x < uSplitX) {
        c = texture(uRaw, vUv);
      } else {
        c = texture(uUp, vUv);
      }
    }`;

  // Chroma Subsampling Reconstruction Shader
  // Solves YUV420p color bleeding where 540p chroma blurs across thin black lines.
  // Uses local luma edge direction to sample and sharpen chroma boundaries, locking colors to line art contours.
  const FS_CHROMA_RECONSTRUCT = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uStrength;
    out vec4 fragColor;

    vec3 rgb2yuv(vec3 c) {
      float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float u = (c.b - y) * 0.5389 + 0.5;
      float v = (c.r - y) * 0.6350 + 0.5;
      return vec3(y, u, v);
    }

    vec3 yuv2rgb(vec3 yuv) {
      float y = yuv.x;
      float u = yuv.y - 0.5;
      float v = yuv.z - 0.5;
      float r = y + 1.5748 * v;
      float g = y - 0.1873 * u - 0.4681 * v;
      float b = y + 1.8556 * u;
      return clamp(vec3(r, g, b), 0.0, 1.0);
    }

    void main() {
      vec2 px = 1.0 / uTexSize;
      vec3 cC = texture(uTex, vUv).rgb;
      vec3 yuvC = rgb2yuv(cC);
      float yC = yuvC.x;

      vec3 cL  = texture(uTex, vUv + vec2(-px.x, 0.0)).rgb;
      vec3 cR  = texture(uTex, vUv + vec2( px.x, 0.0)).rgb;
      vec3 cT  = texture(uTex, vUv + vec2(0.0, -px.y)).rgb;
      vec3 cB  = texture(uTex, vUv + vec2(0.0,  px.y)).rgb;
      vec3 cTL = texture(uTex, vUv + vec2(-px.x, -px.y)).rgb;
      vec3 cTR = texture(uTex, vUv + vec2( px.x, -px.y)).rgb;
      vec3 cBL = texture(uTex, vUv + vec2(-px.x,  px.y)).rgb;
      vec3 cBR = texture(uTex, vUv + vec2( px.x,  px.y)).rgb;

      vec3 yuvL  = rgb2yuv(cL);
      vec3 yuvR  = rgb2yuv(cR);
      vec3 yuvT  = rgb2yuv(cT);
      vec3 yuvB  = rgb2yuv(cB);
      vec3 yuvTL = rgb2yuv(cTL);
      vec3 yuvTR = rgb2yuv(cTR);
      vec3 yuvBL = rgb2yuv(cBL);
      vec3 yuvBR = rgb2yuv(cBR);

      float gx = (yuvTR.x + 2.0 * yuvR.x + yuvBR.x) - (yuvTL.x + 2.0 * yuvL.x + yuvBL.x);
      float gy = (yuvBL.x + 2.0 * yuvB.x + yuvBR.x) - (yuvTL.x + 2.0 * yuvT.x + yuvTR.x);
      float edge = sqrt(gx * gx + gy * gy);

      float sigmaLuma = max(0.035, edge * 0.45);
      float inv2Sigma2 = 1.0 / (2.0 * sigmaLuma * sigmaLuma);

      vec2 chromaAccum = yuvC.yz * 1.5;
      float totalWeight = 1.5;

      float dY; float w;
      dY = yuvL.x - yC;  w = 1.000 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvL.yz * w;  totalWeight += w;
      dY = yuvR.x - yC;  w = 1.000 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvR.yz * w;  totalWeight += w;
      dY = yuvT.x - yC;  w = 1.000 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvT.yz * w;  totalWeight += w;
      dY = yuvB.x - yC;  w = 1.000 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvB.yz * w;  totalWeight += w;
      dY = yuvTL.x - yC; w = 0.707 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvTL.yz * w; totalWeight += w;
      dY = yuvTR.x - yC; w = 0.707 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvTR.yz * w; totalWeight += w;
      dY = yuvBL.x - yC; w = 0.707 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvBL.yz * w; totalWeight += w;
      dY = yuvBR.x - yC; w = 0.707 * exp(-dY * dY * inv2Sigma2); chromaAccum += yuvBR.yz * w; totalWeight += w;

      vec2 sharpChroma = chromaAccum / totalWeight;

      if (edge > 0.07) {
        vec2 dir = normalize(vec2(gx, gy));
        vec2 uvPos = vUv + dir * (px * 1.2);
        vec2 uvNeg = vUv - dir * (px * 1.2);
        vec3 yuvPos = rgb2yuv(texture(uTex, uvPos).rgb);
        vec3 yuvNeg = rgb2yuv(texture(uTex, uvNeg).rgb);
        vec2 sideChroma = (yuvPos.x > yuvNeg.x) ? yuvPos.yz : yuvNeg.yz;
        float lockStrength = clamp((edge - 0.07) * 5.0, 0.0, 0.75);
        sharpChroma = mix(sharpChroma, sideChroma, lockStrength);
      }

      vec2 finalChroma = mix(yuvC.yz, sharpChroma, clamp(uStrength, 0.0, 1.0));
      fragColor = vec4(yuv2rgb(vec3(yC, finalChroma)), 1.0);
    }`;

  // Temporal Anti-Flicker & Motion Stability Buffer Shader
  // Solves line shimmering/flicker on fine line details (eyes, hair, fences) during camera pans.
  // Compares current upscaled frame with previous frame: blends 12% stability if below motion threshold,
  // bypasses blend during large motion or scene cuts to prevent ghosting.
  const FS_TEMPORAL_STABILITY = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uCurrent;
    uniform sampler2D uHistory;
    uniform float uBlend;
    uniform float uMotionThresh;
    uniform float uFirstFrame;
    out vec4 fragColor;

    void main() {
      vec4 cur = texture(uCurrent, vUv);
      if (uFirstFrame > 0.5) {
        fragColor = cur;
        return;
      }

      vec4 hist = texture(uHistory, vUv);

      vec3 delta = abs(cur.rgb - hist.rgb);
      float lumaCur = dot(cur.rgb, vec3(0.2126, 0.7152, 0.0722));
      float lumaHist = dot(hist.rgb, vec3(0.2126, 0.7152, 0.0722));
      float lumaDiff = abs(lumaCur - lumaHist);
      float maxDiff = max(max(delta.r, delta.g), delta.b);
      float motionMetric = max(lumaDiff * 1.5, maxDiff);

      float threshLow = uMotionThresh * 0.4;
      float threshHigh = uMotionThresh;
      float motionFactor = smoothstep(threshLow, threshHigh, motionMetric);

      float effectiveBlend = uBlend * (1.0 - motionFactor);
      vec3 clampedHist = clamp(hist.rgb, cur.rgb - vec3(0.15), cur.rgb + vec3(0.15));

      vec3 outColor = mix(cur.rgb, clampedHist, effectiveBlend);
      fragColor = vec4(outColor, cur.a);
    }`;

  // AMD FidelityFX CAS + Vibrance + Deband + Denoise Composite + Anime4K Highlight Clamping
  const FS_CAS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uSharpness;
    uniform float uVibrance;
    uniform float uDeband;
    uniform float uDenoise;
    uniform float uClampHighlights;
    out vec4 fragColor;

    vec3 applyVibrance(vec3 col, float vib) {
      if (vib <= 0.001) return col;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float maxC = max(col.r, max(col.g, col.b));
      float minC = min(col.r, min(col.g, col.b));
      float sat = maxC - minC;
      return clamp(mix(col, mix(vec3(luma), col, 1.0 + vib * (1.0 - sat)), 1.0), 0.0, 1.0);
    }

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 applyDeband(vec3 c, vec2 uv, vec2 px, float debandStr) {
      if (debandStr <= 0.01) return c;
      vec2 r4 = px * 4.0;
      vec3 c0 = texture(uTex, uv + vec2(-r4.x, 0.0)).rgb;
      vec3 c1 = texture(uTex, uv + vec2( r4.x, 0.0)).rgb;
      vec3 c2 = texture(uTex, uv + vec2(0.0, -r4.y)).rgb;
      vec3 c3 = texture(uTex, uv + vec2(0.0,  r4.y)).rgb;
      vec3 avg = (c0 + c1 + c2 + c3) * 0.25;

      vec3 diff = abs(c - avg);
      float maxDiff = max(max(diff.r, diff.g), diff.b);
      float threshold = 0.045 * debandStr;
      if (maxDiff < threshold) {
        float factor = 1.0 - (maxDiff / threshold);
        float dither = (hash(uv * 1000.0) - 0.5) * (1.0 / 255.0);
        return clamp(mix(c, avg + dither, factor * 0.8), 0.0, 1.0);
      }
      return c;
    }

    vec3 applyDenoise(vec3 c, vec2 uv, vec2 px, float denoiseStr) {
      if (denoiseStr <= 0.01) return c;
      vec3 cL = texture(uTex, uv - vec2(px.x, 0.0)).rgb;
      vec3 cR = texture(uTex, uv + vec2(px.x, 0.0)).rgb;
      vec3 cT = texture(uTex, uv - vec2(0.0, px.y)).rgb;
      vec3 cB = texture(uTex, uv + vec2(0.0, px.y)).rgb;
      vec3 blur = (cL + cR + cT + cB) * 0.25;
      float diff = length(c - blur);
      if (diff < 0.05) {
        float w = smoothstep(0.05, 0.005, diff) * denoiseStr * 0.5;
        return mix(c, blur, w);
      }
      return c;
    }

    // Anime4K Highlight Clamping: compress extreme specular values (>0.88)
    vec3 clampSpecular(vec3 col) {
      const float knee = 0.88;
      vec3 over = max(col - vec3(knee), vec3(0.0));
      return min(col, knee + over / (1.0 + over * 3.5));
    }

    void main() {
      vec2 px = 1.0 / uTexSize;
      vec3 c = texture(uTex, vUv).rgb;

      if (uDeband > 0.01) {
        c = applyDeband(c, vUv, px, uDeband);
      }
      if (uDenoise > 0.01) {
        c = applyDenoise(c, vUv, px, uDenoise);
      }

      if (uClampHighlights > 0.5) {
        c = clampSpecular(c);
      }

      if (uSharpness > 0.01) {
        vec3 a = texture(uTex, vUv + vec2(-px.x, 0.0)).rgb;
        vec3 b = texture(uTex, vUv + vec2(px.x, 0.0)).rgb;
        vec3 c_ = texture(uTex, vUv + vec2(0.0, -px.y)).rgb;
        vec3 d = texture(uTex, vUv + vec2(0.0, px.y)).rgb;

        if (uClampHighlights > 0.5) {
          a = clampSpecular(a);
          b = clampSpecular(b);
          c_ = clampSpecular(c_);
          d = clampSpecular(d);
        }

        vec3 e = c;

        vec3 minC = min(e, min(min(a, b), min(c_, d)));
        vec3 maxC = max(e, max(max(a, b), max(c_, d)));
        vec3 amp = clamp(min(minC, 2.0 - maxC) / max(maxC, vec3(0.0001)), 0.0, 1.0);
        vec3 w = amp * (-0.125 * uSharpness);
        c = (e + (a + b + c_ + d) * w) / (1.0 + 4.0 * w);
      }

      if (uVibrance > 0.001) {
        c = applyVibrance(clamp(c, 0.0, 1.0), uVibrance);
      }
      fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
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

  // 2026 Cinema Shaders:
  // Anime Line Art Shaper (Darkening & Thinning)
  const FS_LINE_ENHANCE = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uLineDarken;
    uniform float uLineThin;
    out vec4 fragColor;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec4 base = texture(uTex, vUv);
      if (uLineDarken <= 0.001 && uLineThin <= 0.001) {
        fragColor = base;
        return;
      }

      vec2 px = 1.0 / uTexSize;

      // 3x3 neighborhood samples for Sobel / Laplacian
      vec3 cTL = texture(uTex, vUv + vec2(-px.x, -px.y)).rgb;
      vec3 cT  = texture(uTex, vUv + vec2( 0.0,  -px.y)).rgb;
      vec3 cTR = texture(uTex, vUv + vec2( px.x, -px.y)).rgb;
      vec3 cL  = texture(uTex, vUv + vec2(-px.x,  0.0 )).rgb;
      vec3 cC  = base.rgb;
      vec3 cR  = texture(uTex, vUv + vec2( px.x,  0.0 )).rgb;
      vec3 cBL = texture(uTex, vUv + vec2(-px.x,  px.y)).rgb;
      vec3 cB  = texture(uTex, vUv + vec2( 0.0,   px.y)).rgb;
      vec3 cBR = texture(uTex, vUv + vec2( px.x,  px.y)).rgb;

      float yTL = getLuma(cTL);
      float yT  = getLuma(cT);
      float yTR = getLuma(cTR);
      float yL  = getLuma(cL);
      float yC  = getLuma(cC);
      float yR  = getLuma(cR);
      float yBL = getLuma(cBL);
      float yB  = getLuma(cB);
      float yBR = getLuma(cBR);

      // 3x3 Sobel gradient
      float gx = (yTR + 2.0 * yR + yBR) - (yTL + 2.0 * yL + yBL);
      float gy = (yBL + 2.0 * yB + yBR) - (yTL + 2.0 * yT + yTR);
      float edge = sqrt(gx * gx + gy * gy);

      // Laplacian luma edge curvature
      float lap = (yTL + yT + yTR + yL + yR + yBL + yB + yBR) - 8.0 * yC;

      vec3 outColor = cC;

      // Anime Line Art Darkening: darkens greyish/faded line edges towards ink black without halo
      if (uLineDarken > 0.001) {
        float edgeFactor = smoothstep(0.06, 0.32, edge);
        float greyFadeFactor = 1.0 - smoothstep(0.08, 0.72, yC);
        float darken = edgeFactor * greyFadeFactor * clamp(uLineDarken, 0.0, 1.0);
        outColor = mix(outColor, outColor * (1.0 - darken * 0.75), darken);
      }

      // Anime Line Art Thinning: suppresses wide blurred fringes
      if (uLineThin > 0.001) {
        vec3 maxNeighbor = max(max(max(cTL, cTR), max(cBL, cBR)), max(max(cT, cB), max(cL, cR)));
        float isFringe = smoothstep(0.08, 0.35, edge) * smoothstep(0.22, 0.70, yC) * smoothstep(0.0, 0.35, -lap);
        float thin = isFringe * clamp(uLineThin, 0.0, 1.0) * 0.45;
        outColor = mix(outColor, max(outColor, maxNeighbor), thin);
      }

      fragColor = vec4(clamp(outColor, 0.0, 1.0), base.a);
    }`;

  // Cinematic Anime Bloom / Shinkai Diffusion
  const FS_BLOOM = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uBloomStrength;
    out vec4 fragColor;

    float getLuma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 extractHighlight(vec3 c) {
      float luma = getLuma(c);
      float threshold = 0.70;
      float soft = 0.22;
      float weight = smoothstep(threshold, threshold + soft, luma);
      return c * weight;
    }

    void main() {
      vec4 base = texture(uTex, vUv);
      if (uBloomStrength <= 0.001) {
        fragColor = base;
        return;
      }

      vec2 px = (1.0 / uTexSize) * 2.5;

      // 9-tap Gaussian kernel weights (sigma ~ 2.5)
      const float w[9] = float[](
        0.0285, 0.0672, 0.1240, 0.1790, 0.2026, 0.1790, 0.1240, 0.0672, 0.0285
      );
      const float offsets[9] = float[](
        -4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0
      );

      vec3 bloomH = vec3(0.0);
      vec3 bloomV = vec3(0.0);

      for (int i = 0; i < 9; i++) {
        vec3 sH = texture(uTex, vUv + vec2(offsets[i] * px.x, 0.0)).rgb;
        vec3 sV = texture(uTex, vUv + vec2(0.0, offsets[i] * px.y)).rgb;
        bloomH += extractHighlight(sH) * w[i];
        bloomV += extractHighlight(sV) * w[i];
      }

      vec3 blurredHighlight = (bloomH + bloomV) * 0.5;
      vec3 bloomColor = blurredHighlight * clamp(uBloomStrength, 0.0, 0.3);
      vec3 screenBlended = 1.0 - (1.0 - base.rgb) * (1.0 - bloomColor);

      fragColor = vec4(clamp(screenBlended, 0.0, 1.0), base.a);
    }`;

  // Film Grain Shader (2026 Elite Procedural Animated Noise)
  const FS_FILM_GRAIN = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uTexSize;
    uniform float uTime;
    uniform float uGrainStrength;
    out vec4 fragColor;

    float hash21(vec2 p, float s) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + (33.33 + s));
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 baseColor = texture(uTex, vUv);
      if (uGrainStrength <= 0.001) {
        fragColor = baseColor;
        return;
      }

      vec2 coord = vUv * uTexSize;

      float n1 = hash21(coord, uTime * 60.0);
      float n2 = hash21(coord + vec2(1.23, 3.45), uTime * 60.0 + 17.0);
      float noise = (n1 + n2) * 0.5 - 0.5;

      float luma = dot(baseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float shadowBoost = smoothstep(0.02, 0.25, luma);
      float highlightFalloff = 1.0 - smoothstep(0.70, 0.96, luma);
      float lumaMod = shadowBoost * highlightFalloff;

      float grain = noise * uGrainStrength * 2.0 * lumaMod;
      vec3 result = baseColor.rgb + vec3(grain);

      fragColor = vec4(clamp(result, 0.0, 1.0), baseColor.a);
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
      this.droppedFrames = 0;
      this.isDrm       = false;
      this._inFS       = false;

      this._hasDrawnFirstFrame = false;
      this._isContextLost = false;
      this._isTabHidden = false;

      this._lastPresentedFrame = -1;
      this._isLoopActive = false;

      this.canvas      = null;
      this.hudEl       = null;
      this.splitHandle = null;
      this.splitBadgeLeft = null;
      this.splitBadgeRight = null;
      this.isDraggingSplit = false;

      this.progSplit       = null;
      this.progBicubic     = null;
      this.progCas         = null;
      this.progChromaRecon = null;
      this.progTemporal    = null;
      this.progLineEnhance = null;
      this.progBloom       = null;
      this.progFilmGrain   = null;

      this.historyTextures = null;
      this.historyFbos     = null;
      this.historyWidth    = 0;
      this.historyHeight   = 0;
      this.historyIdx      = 0;
      this.isFirstTemporalFrame = true;
      this.historyTexture  = null;
      this.chromaFbo       = null;
      this.postTextures    = null;
      this.postFbos        = null;
      this.postWidth       = 0;
      this.postHeight      = 0;
      this.postIdx         = 0;

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

      c.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this._onContextLost();
      });
      c.addEventListener('webglcontextrestored', () => {
        this._onContextRestored();
      });

      this._setupGLContext();
    }

    _setupGLContext() {
      const c = this.canvas;
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

      try { this.progSplit       = createProgram(gl, VS_QUAD, FS_SPLIT);              } catch(e) {}
      try { this.progBicubic     = createProgram(gl, VS_QUAD, FS_BICUBIC);            } catch(e) {}
      try { this.progCas         = createProgram(gl, VS_QUAD, FS_CAS);                } catch(e) {}
      try { this.progChromaRecon = createProgram(gl, VS_QUAD, FS_CHROMA_RECONSTRUCT); } catch(e) {}
      try { this.progTemporal    = createProgram(gl, VS_QUAD, FS_TEMPORAL_STABILITY); } catch(e) {}
      try { this.progLineEnhance = createProgram(gl, VS_QUAD, FS_LINE_ENHANCE);       } catch(e) {}
      try { this.progBloom       = createProgram(gl, VS_QUAD, FS_BLOOM);              } catch(e) {}
      try { this.progFilmGrain   = createProgram(gl, VS_QUAD, FS_FILM_GRAIN);          } catch(e) {}
    }

    _onContextLost() {
      console.warn('[AnimeUpScaler PRO] WebGL Context Lost! Pausing render pipeline...');
      this._isContextLost = true;
      this._hasDrawnFirstFrame = false;
      this._isLoopActive = false;
      if (this.video) this.video.style.opacity = '';
      this.updateHUD('⚠ WebGL Lost');
      this.passes = [];
      this.historyTextures = null;
      this.historyFbos = null;
      this.postTextures = null;
      this.postFbos = null;
      this.chromaFbo = null;
      this.rawTexture = null;
      this.quadBuf = null;
      this.progSplit = null;
      this.progBicubic = null;
      this.progCas = null;
      this.progChromaRecon = null;
      this.progTemporal = null;
      this.progLineEnhance = null;
      this.progBloom = null;
      this.progFilmGrain = null;
    }

    _onContextRestored() {
      console.log('[AnimeUpScaler PRO] WebGL Context Restored! Self-healing engine...');
      this._setupGLContext();
      this._isContextLost = false;
      this._hasDrawnFirstFrame = false;
      this.rebuildPasses();
      this.updateHUD('⚡ Контекст восстановлен');
      if (this.isOn) {
        this.renderSingleFrame();
        if (!this.video.paused && !this.video.ended && !this._isLoopActive) {
          const id = ++this.renderingId;
          this.renderLoop(id);
        }
      }
    }

    _destroyTemporalBuffers() {
      const gl = this.gl;
      if (!gl) return;
      if (this.historyTextures) {
        for (const t of this.historyTextures) if (t) gl.deleteTexture(t);
        this.historyTextures = null;
      }
      if (this.historyFbos) {
        for (const f of this.historyFbos) if (f) gl.deleteFramebuffer(f);
        this.historyFbos = null;
      }
      this.historyWidth = 0;
      this.historyHeight = 0;
      this.historyIdx = 0;
      this.isFirstTemporalFrame = true;
      this.historyTexture = null;
    }

    _initTemporalBuffers(w, h) {
      const gl = this.gl;
      if (!gl || !w || !h) return;
      if (this.historyWidth === w && this.historyHeight === h && this.historyTextures) return;

      this._destroyTemporalBuffers();

      this.historyTextures = [gl.createTexture(), gl.createTexture()];
      this.historyFbos = [gl.createFramebuffer(), gl.createFramebuffer()];
      this.historyWidth = w;
      this.historyHeight = h;
      this.historyIdx = 0;
      this.isFirstTemporalFrame = true;

      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.historyTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyFbos[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.historyTextures[i], 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    get postTexture() { return (this.postTextures && this.postTextures[this.postIdx]) || null; }
    get postFbo()     { return (this.postFbos && this.postFbos[this.postIdx]) || null; }

    _destroyPostBuffers() {
      const gl = this.gl;
      if (!gl) return;
      if (this.postTextures) {
        for (const t of this.postTextures) if (t) gl.deleteTexture(t);
        this.postTextures = null;
      }
      if (this.postFbos) {
        for (const f of this.postFbos) if (f) gl.deleteFramebuffer(f);
        this.postFbos = null;
      }
      this.postWidth = 0;
      this.postHeight = 0;
      this.postIdx = 0;
    }

    _initPostBuffers(w, h) {
      const gl = this.gl;
      if (!gl || !w || !h) return;
      if (this.postWidth === w && this.postHeight === h && this.postTextures) return;

      this._destroyPostBuffers();
      this.postTextures = [gl.createTexture(), gl.createTexture()];
      this.postFbos = [gl.createFramebuffer(), gl.createFramebuffer()];
      this.postWidth = w;
      this.postHeight = h;
      this.postIdx = 0;

      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.postTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.postFbos[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.postTextures[i], 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

      // Self-healing Fullscreen state synchronization
      const isActuallyFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (this._inFS && !isActuallyFS) {
        this._exitFullscreen();
      } else if (!this._inFS && isActuallyFS) {
        this._enterFullscreen(document.fullscreenElement || document.webkitFullscreenElement);
      }

      const vR = v.getBoundingClientRect();
      const pR = p.getBoundingClientRect();
      const visible = vR.width > 4 && vR.height > 4;
      const c = this.canvas;
      const vComp = window.getComputedStyle(v);

      if (this.isOn && visible) {
        c.style.position  = 'absolute';
        c.style.left      = (vR.left - pR.left + p.scrollLeft) + 'px';
        c.style.top       = (vR.top  - pR.top  + p.scrollTop)  + 'px';
        c.style.width     = vR.width  + 'px';
        c.style.height    = vR.height + 'px';
        c.style.objectFit = vComp.objectFit || 'contain';
        c.style.zIndex    = '2';
        c.style.display   = 'block';
      } else {
        c.style.display   = 'none';
      }

      if (this.hudEl && !this._inFS) {
        if (this.hudEl.parentElement !== document.documentElement) {
          document.documentElement.appendChild(this.hudEl);
        }
        this._placeHudFixed(vR);
      }
      if (this.splitHandle) this._placeSplitFixed(vR);
    }

    _placeHudFixed(r) {
      const h = this.hudEl;
      if (!h || this._inFS) return;
      h.style.position  = 'fixed';
      h.style.bottom    = '';
      h.style.right     = '';
      h.style.width     = 'max-content';
      h.style.maxWidth  = 'max-content';
      h.style.minWidth  = '0';
      h.style.height    = '28px';
      h.style.minHeight = '28px';
      h.style.maxHeight = '28px';
      const pos = cfg.hudPosition || 'bottom-left';
      const W = h.offsetWidth || 240;
      if (pos === 'top-right')         { h.style.left = (r.right - W - 14) + 'px'; h.style.top = (r.top + 14) + 'px'; }
      else if (pos === 'bottom-right') { h.style.left = (r.right - W - 14) + 'px'; h.style.top = (r.bottom - 42) + 'px'; }
      else if (pos === 'top-left')     { h.style.left = (r.left + 14) + 'px'; h.style.top = (r.top + 14) + 'px'; }
      else /* bottom-left */           { h.style.left = (r.left + 14) + 'px'; h.style.top = (r.bottom - 42) + 'px'; }
    }

    _placeSplitFixed(r) {
      if (!this.splitHandle) return;
      const sp = Number(cfg.splitPosition) || 0.5;

      if (this._inFS && this._fsContainer) {
        const cR = this._fsContainer.getBoundingClientRect();
        this.splitHandle.style.position = 'absolute';
        this.splitHandle.style.left   = (r.left - cR.left + r.width * sp) + 'px';
        this.splitHandle.style.top    = (r.top  - cR.top)  + 'px';
        this.splitHandle.style.height = r.height + 'px';

        if (this.splitBadgeLeft) {
          this.splitBadgeLeft.style.position = 'absolute';
          this.splitBadgeLeft.style.left = (r.left - cR.left + 14) + 'px';
          this.splitBadgeLeft.style.top  = (r.top  - cR.top  + 14) + 'px';
        }
        if (this.splitBadgeRight) {
          const w = this.splitBadgeRight.offsetWidth || 110;
          this.splitBadgeRight.style.position = 'absolute';
          this.splitBadgeRight.style.left = (r.right - cR.left - w - 14) + 'px';
          this.splitBadgeRight.style.top  = (r.top   - cR.top  + 14) + 'px';
        }
      } else {
        this.splitHandle.style.position = 'fixed';
        this.splitHandle.style.left   = (r.left + r.width * sp) + 'px';
        this.splitHandle.style.top    = r.top    + 'px';
        this.splitHandle.style.height = r.height + 'px';

        if (this.splitBadgeLeft) {
          this.splitBadgeLeft.style.position = 'fixed';
          this.splitBadgeLeft.style.left = (r.left + 14) + 'px';
          this.splitBadgeLeft.style.top  = (r.top  + 14) + 'px';
        }
        if (this.splitBadgeRight) {
          const w = this.splitBadgeRight.offsetWidth || 110;
          this.splitBadgeRight.style.position = 'fixed';
          this.splitBadgeRight.style.left = (r.right - w - 14) + 'px';
          this.splitBadgeRight.style.top  = (r.top   + 14) + 'px';
        }
      }
    }

    _initObservers() {
      this._resizeObs = new ResizeObserver(() => { if (this.video.videoWidth) this.rebuildPasses(); });
      this._resizeObs.observe(this.video);
      this._onVideoResize = () => this.rebuildPasses();
      this.video.addEventListener('resize', this._onVideoResize);
      this._onCanPlay = () => { if (this.video.mediaKeys) { this.isDrm = true; this.updateHUD('🛡 DRM'); } };
      this.video.addEventListener('canplay', this._onCanPlay);

      this._onLoadedMeta = () => {
        if (this.isOn) {
          this.rebuildPasses();
          this.renderSingleFrame();
        }
      };
      this._onLoadedData = () => {
        if (this.isOn) {
          this.rebuildPasses();
          this.renderSingleFrame();
        }
      };
      this.video.addEventListener('loadedmetadata', this._onLoadedMeta);
      this.video.addEventListener('loadeddata',     this._onLoadedData);
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
          if (!this._hasDrawnFirstFrame) this.video.style.opacity = '';
          setTimeout(() => this.renderSingleFrame(), 16);
        }
      };
      this._onSeeked = () => {
        this.isFirstTemporalFrame = true;
        this._hasDrawnFirstFrame = false;
        this.video.style.opacity = '';
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
      c.style.position  = 'absolute';
      c.style.left      = '0'; c.style.top = '0';
      c.style.width     = '100%'; c.style.height = '100%';
      c.style.zIndex    = '2';
      c.style.objectFit = window.getComputedStyle(this.video).objectFit || 'contain';
      if (this.isOn) c.style.display = 'block';
      container.appendChild(c);

      if (this.hudEl) {
        this.hudEl.style.position = 'absolute';
        this.hudEl.style.zIndex   = '2147483645';
        this._setHudAbsoluteCorner();
        container.appendChild(this.hudEl);
      }

      if (this.splitHandle) {
        container.appendChild(this.splitHandle);
        if (this.splitBadgeLeft)  container.appendChild(this.splitBadgeLeft);
        if (this.splitBadgeRight) container.appendChild(this.splitBadgeRight);
        const r = this.video.getBoundingClientRect();
        this._placeSplitFixed(r);
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
        this.hudEl.style.position  = 'fixed';
        this.hudEl.style.bottom    = '';
        this.hudEl.style.right     = '';
        this.hudEl.style.width     = 'max-content';
        this.hudEl.style.maxWidth  = 'max-content';
        this.hudEl.style.minWidth  = '0';
        this.hudEl.style.height    = '28px';
        this.hudEl.style.minHeight = '28px';
        this.hudEl.style.maxHeight = '28px';
        document.documentElement.appendChild(this.hudEl);
      }
      if (this.splitHandle) {
        this.splitHandle.style.position = 'fixed';
        document.documentElement.appendChild(this.splitHandle);
        if (this.splitBadgeLeft) {
          this.splitBadgeLeft.style.position = 'fixed';
          document.documentElement.appendChild(this.splitBadgeLeft);
        }
        if (this.splitBadgeRight) {
          this.splitBadgeRight.style.position = 'fixed';
          document.documentElement.appendChild(this.splitBadgeRight);
        }
        const r = this.video.getBoundingClientRect();
        this._placeSplitFixed(r);
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
      this.hudEl.style.position  = 'absolute';
      this.hudEl.style.left      = '';
      this.hudEl.style.top       = '';
      this.hudEl.style.right     = '';
      this.hudEl.style.bottom    = '';
      this.hudEl.style.width     = 'max-content';
      this.hudEl.style.maxWidth  = 'max-content';
      this.hudEl.style.minWidth  = '0';
      this.hudEl.style.height    = '28px';
      this.hudEl.style.minHeight = '28px';
      this.hudEl.style.maxHeight = '28px';
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

    getShaderFingerprint() {
      const mode = this.getActiveModeKey();
      const v = this.video;
      const vw = v ? v.videoWidth : 0;
      const vh = v ? v.videoHeight : 0;
      return `${mode}_${vw}x${vh}_${!!cfg.splitScreen}`;
    }

    rebuildPasses(force = false) {
      const gl = this.gl, v = this.video;
      if (!gl || !v || !v.videoWidth || !v.videoHeight) return;

      const fp = this.getShaderFingerprint();
      if (!force && this._lastShaderFingerprint === fp && this.passes.length > 0) {
        return; // Zero-lag cache hit: pipeline already compiled and optimal!
      }
      this._lastShaderFingerprint = fp;

      for (const p of this.passes) p && p.destroy && p.destroy();
      this.passes = [];
      this.isFirstTemporalFrame = true;

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
      this._hasDrawnFirstFrame = false;
      this.isDrm = !!this.video.mediaKeys;
      this._mountCanvas();
      this.canvas.style.display = 'block';
      // Black screen fix: do NOT hide video with 0.001 opacity yet!
      // Video stays visible underneath until the first frame has successfully rendered.
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
      this._hasDrawnFirstFrame = false;
      this.renderingId++;
      this._isLoopActive = false;
      if (this.canvas) this.canvas.style.display = 'none';
      if (this.video)  this.video.style.opacity  = '';
      if (this.hudEl)  { this.hudEl.remove(); this.hudEl = null; }
      if (this.splitHandle)     { this.splitHandle.remove();     this.splitHandle = null;     }
      if (this.splitBadgeLeft)  { this.splitBadgeLeft.remove();  this.splitBadgeLeft = null;  }
      if (this.splitBadgeRight) { this.splitBadgeRight.remove(); this.splitBadgeRight = null; }
    }

    renderSingleFrame() {
      const v = this.video, gl = this.gl;
      if (v && gl && !this._isContextLost && v.readyState >= 2 && v.videoHeight > 0) {
        this.renderFrame();
      }
    }

    // ── Smart Zero-Idle Render Loop ──────────────────────────────────────────
    renderLoop(runId) {
      if (!this.isOn || this.renderingId !== runId) {
        this._isLoopActive = false;
        return;
      }

      if (this._isContextLost || this._isTabHidden || document.hidden) {
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
      if (!gl || !v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;
      const mode = this.getActiveModeKey();

      try {
        const vW = v.videoWidth, vH = v.videoHeight;
        const outW = this.canvas.width || vW;
        const outH = this.canvas.height || vH;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);

        // ── Bicubic Fallback ────────────────────────────────────────────────
        if (mode === 'bicubic' || passes.length === 0) {
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, outW, outH);
          gl.useProgram(this.progBicubic);
          const a = gl.getAttribLocation(this.progBicubic, 'aPos');
          gl.enableVertexAttribArray(a);
          gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.uniform1i(gl.getUniformLocation(this.progBicubic, 'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(this.progBicubic, 'uTexSize'), vW, vH);
          gl.uniform1f(gl.getUniformLocation(this.progBicubic, 'uSharp'), Number(cfg.strength) || 0.7);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!this._hasDrawnFirstFrame) {
            this._hasDrawnFirstFrame = true;
            this.video.style.opacity = '0.001';
          }
          return;
        }

        // ── Step 1: Upload Video & Chroma Subsampling Reconstruction ─────────
        const useChromaRecon = cfg.enableChromaRecon !== false && this.progChromaRecon;
        if (useChromaRecon) {
          // Upload raw video frame
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);

          // Reconstruct chroma boundaries locked to line art contours into passes[0].inputTexture
          if (!this.chromaFbo) this.chromaFbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.chromaFbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, passes[0].inputTexture, 0);
          gl.viewport(0, 0, vW, vH);

          gl.useProgram(this.progChromaRecon);
          const aPos = gl.getAttribLocation(this.progChromaRecon, 'aPos');
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.uniform1i(gl.getUniformLocation(this.progChromaRecon, 'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(this.progChromaRecon, 'uTexSize'), vW, vH);
          gl.uniform1f(gl.getUniformLocation(this.progChromaRecon, 'uStrength'), 1.0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        } else {
          gl.bindTexture(gl.TEXTURE_2D, passes[0].inputTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.FLOAT, v);

          if (cfg.splitScreen) {
            gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          }
        }

        // ── Step 2: Render Neural Upscaling Passes ──────────────────────────
        // Ensure passes render to texture for post-processing chain
        passes[passes.length - 1].isLastPass = false;
        for (let i = 0; i < passes.length; i++) {
          passes[i].render();
        }
        let currentOutTex = passes[passes.length - 1].outputTexture;

        // ── Step 3: Temporal Anti-Flicker & Motion Stability Buffer ───────────
        const useTemporal = cfg.enableTemporalStability !== false && this.progTemporal;
        if (useTemporal) {
          this._initTemporalBuffers(outW, outH);

          const targetFbo = this.historyFbos[this.historyIdx];
          const targetTex = this.historyTextures[this.historyIdx];
          const prevTex   = this.historyTextures[1 - this.historyIdx];

          gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
          gl.viewport(0, 0, outW, outH);

          gl.useProgram(this.progTemporal);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
          const aPos = gl.getAttribLocation(this.progTemporal, 'aPos');
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, currentOutTex);
          gl.uniform1i(gl.getUniformLocation(this.progTemporal, 'uCurrent'), 0);

          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, prevTex);
          gl.uniform1i(gl.getUniformLocation(this.progTemporal, 'uHistory'), 1);

          gl.uniform1f(gl.getUniformLocation(this.progTemporal, 'uBlend'), 0.12);
          gl.uniform1f(gl.getUniformLocation(this.progTemporal, 'uMotionThresh'), 0.10);
          gl.uniform1f(gl.getUniformLocation(this.progTemporal, 'uFirstFrame'), this.isFirstTemporalFrame ? 1.0 : 0.0);

          gl.drawArrays(gl.TRIANGLES, 0, 6);

          this.isFirstTemporalFrame = false;
          this.historyIdx = 1 - this.historyIdx;
          this.historyTexture = targetTex;
          currentOutTex = targetTex;
        }

        // ── Step 4: Post-Processing Pipeline (CAS + Line Enhance + Bloom + Film Grain) ──
        const isModern = mode === 'modern';
        const isRetro  = mode === 'retro';
        const isCinema = mode === 'hq' || mode === 'godmode';

        const enableClamp   = cfg.enableHighlightClamp !== false;
        const enableCas     = isModern || (!isRetro && cfg.enableCas !== false);
        const enableVib     = isModern || (!isRetro && cfg.enableVibrance !== false);
        const enableDeband  = isRetro  || (!isModern && cfg.enableDeband !== false);
        const enableDenoise = isRetro;
        const needsCas      = !!(this.progCas && (enableCas || enableVib || enableDeband || enableDenoise || enableClamp));

        const enableLine    = !!(this.progLineEnhance && cfg.enableLineEnhance !== false);
        const enableBloom   = !!(this.progBloom && ((cfg.enableBloom === true) || (isCinema && cfg.enableBloom !== false)));
        const enableGrain   = !!(this.progFilmGrain && cfg.enableFilmGrain);

        const postPasses = [];

        if (needsCas) {
          postPasses.push((inTex, targetFbo) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
            gl.viewport(0, 0, outW, outH);
            gl.useProgram(this.progCas);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
            const aPos = gl.getAttribLocation(this.progCas, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inTex);
            gl.uniform1i(gl.getUniformLocation(this.progCas, 'uTex'), 0);
            gl.uniform2f(gl.getUniformLocation(this.progCas, 'uTexSize'), outW, outH);

            const sharpness = enableCas ? (Number(cfg.strength) || 0.7) : 0.0;
            const vibrance  = enableVib ? (Number(cfg.vibranceStrength) || 0.18) : 0.0;
            const deband    = enableDeband ? 1.0 : 0.0;
            const denoise   = enableDenoise ? 1.0 : 0.0;
            const clampHigh = enableClamp ? 1.0 : 0.0;

            gl.uniform1f(gl.getUniformLocation(this.progCas, 'uSharpness'), sharpness);
            gl.uniform1f(gl.getUniformLocation(this.progCas, 'uVibrance'),  vibrance);
            gl.uniform1f(gl.getUniformLocation(this.progCas, 'uDeband'),    deband);
            gl.uniform1f(gl.getUniformLocation(this.progCas, 'uDenoise'),   denoise);
            gl.uniform1f(gl.getUniformLocation(this.progCas, 'uClampHighlights'), clampHigh);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        }

        if (enableLine) {
          postPasses.push((inTex, targetFbo) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
            gl.viewport(0, 0, outW, outH);
            gl.useProgram(this.progLineEnhance);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
            const aPos = gl.getAttribLocation(this.progLineEnhance, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inTex);
            gl.uniform1i(gl.getUniformLocation(this.progLineEnhance, 'uTex'), 0);
            gl.uniform2f(gl.getUniformLocation(this.progLineEnhance, 'uTexSize'), outW, outH);

            const lineDarken = Number(cfg.lineDarken) || 0.25;
            const lineThin   = Number(cfg.lineThin) || 0.18;
            gl.uniform1f(gl.getUniformLocation(this.progLineEnhance, 'uLineDarken'), lineDarken);
            gl.uniform1f(gl.getUniformLocation(this.progLineEnhance, 'uLineThin'),   lineThin);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        }

        if (enableBloom) {
          postPasses.push((inTex, targetFbo) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
            gl.viewport(0, 0, outW, outH);
            gl.useProgram(this.progBloom);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
            const aPos = gl.getAttribLocation(this.progBloom, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inTex);
            gl.uniform1i(gl.getUniformLocation(this.progBloom, 'uTex'), 0);
            gl.uniform2f(gl.getUniformLocation(this.progBloom, 'uTexSize'), outW, outH);

            const bloomStrength = Number(cfg.bloomStrength) || 0.15;
            gl.uniform1f(gl.getUniformLocation(this.progBloom, 'uBloomStrength'), bloomStrength);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        }

        if (enableGrain) {
          postPasses.push((inTex, targetFbo) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
            gl.viewport(0, 0, outW, outH);
            gl.useProgram(this.progFilmGrain);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
            const aPos = gl.getAttribLocation(this.progFilmGrain, 'aPos');
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inTex);
            gl.uniform1i(gl.getUniformLocation(this.progFilmGrain, 'uTex'), 0);
            gl.uniform2f(gl.getUniformLocation(this.progFilmGrain, 'uTexSize'), outW, outH);

            const grainStrength = Math.min(0.10, Math.max(0.0, Number(cfg.grainStrength) || 0.035));
            gl.uniform1f(gl.getUniformLocation(this.progFilmGrain, 'uGrainStrength'), grainStrength);
            gl.uniform1f(gl.getUniformLocation(this.progFilmGrain, 'uTime'), (performance.now() * 0.001) % 1000.0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
        }

        if (postPasses.length > 0) {
          this._initPostBuffers(outW, outH);
          for (let i = 0; i < postPasses.length; i++) {
            const isLast = (i === postPasses.length - 1);
            const renderToScreen = isLast && !cfg.splitScreen;
            const targetFbo = renderToScreen ? null : this.postFbos[this.postIdx];

            postPasses[i](currentOutTex, targetFbo);

            if (!renderToScreen) {
              currentOutTex = this.postTextures[this.postIdx];
              this.postIdx = 1 - this.postIdx;
            }
          }
        } else if (!cfg.splitScreen) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, outW, outH);
          gl.useProgram(this.progCas);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
          const aPos = gl.getAttribLocation(this.progCas, 'aPos');
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, currentOutTex);
          gl.uniform1i(gl.getUniformLocation(this.progCas, 'uTex'), 0);
          gl.uniform2f(gl.getUniformLocation(this.progCas, 'uTexSize'), outW, outH);
          gl.uniform1f(gl.getUniformLocation(this.progCas, 'uSharpness'), 0.0);
          gl.uniform1f(gl.getUniformLocation(this.progCas, 'uVibrance'),  0.0);
          gl.uniform1f(gl.getUniformLocation(this.progCas, 'uDeband'),    0.0);
          gl.uniform1f(gl.getUniformLocation(this.progCas, 'uDenoise'),   0.0);
          gl.uniform1f(gl.getUniformLocation(this.progCas, 'uClampHighlights'), 0.0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // ── Step 5: Composite Split Screen (RAW vs Upscaled) ────────────────
        if (cfg.splitScreen) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, outW, outH);
          gl.useProgram(this.progSplit);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
          const a = gl.getAttribLocation(this.progSplit, 'aPos');
          gl.enableVertexAttribArray(a);
          gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.rawTexture);
          gl.uniform1i(gl.getUniformLocation(this.progSplit, 'uRaw'), 0);

          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, currentOutTex);
          gl.uniform1i(gl.getUniformLocation(this.progSplit, 'uUp'), 1);

          gl.uniform1f(gl.getUniformLocation(this.progSplit, 'uSplitX'), Number(cfg.splitPosition) || 0.5);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // Black Screen Fix: Only hide underlying video after the first frame has successfully drawn to canvas
        if (!this._hasDrawnFirstFrame) {
          this._hasDrawnFirstFrame = true;
          this.video.style.opacity = '0.001';
        }
      } catch (e) {
        console.warn('[AnimeUpScaler PRO] renderFrame:', e);
      }
    }

    recordFrameStats(ms) {
      if (this.video.getVideoPlaybackQuality) {
        const q = this.video.getVideoPlaybackQuality();
        this.droppedFrames = q ? q.droppedVideoFrames : 0;
      } else if (typeof this.video.webkitDroppedFrameCount === 'number') {
        this.droppedFrames = this.video.webkitDroppedFrameCount;
      } else {
        this.droppedFrames = 0;
      }

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
          'box-sizing:border-box',
          'width:max-content!important', 'max-width:max-content!important', 'min-width:0!important',
          'height:28px!important', 'min-height:28px!important', 'max-height:28px!important',
          'overflow:hidden',
          'background:rgba(10,14,22,0.92)', 'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
          'border:1px solid rgba(80,227,194,0.35)', 'border-radius:8px',
          'color:#e2e8f0', 'font:600 11px/28px ui-monospace,SFMono-Regular,Consolas,monospace',
          'padding:0 10px', 'box-shadow:0 4px 16px rgba(0,0,0,0.6)',
          'display:inline-flex', 'align-items:center', 'gap:7px', 'white-space:nowrap',
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
      const dot   = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;border:1px solid rgba(255,255,255,0.4);flex-shrink:0;"></span>`;

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
        ${this.droppedFrames > 0 ? `<span style="color:#334155">·</span><span style="color:${this.droppedFrames > 20 ? '#f87171' : '#f59e0b'}">${this.droppedFrames} drop</span>` : ''}
        ${notice ? `<span style="color:#fbbf24">[${notice}]</span>` : ''}`;
    }

    updateSplitHandle() {
      if (!cfg.splitScreen || !this.isOn) {
        if (this.splitHandle)     { this.splitHandle.remove();     this.splitHandle = null;     }
        if (this.splitBadgeLeft)  { this.splitBadgeLeft.remove();  this.splitBadgeLeft = null;  }
        if (this.splitBadgeRight) { this.splitBadgeRight.remove(); this.splitBadgeRight = null; }
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
        badge.textContent = '◀ ОРИГИНАЛ | НЕЙРОСЕТЬ 4K ▶';
        sh.appendChild(line); sh.appendChild(badge);
        document.documentElement.appendChild(sh);
        this.splitHandle = sh;

        const bLeft = document.createElement('div');
        bLeft.className = '__au_split_badge_left';
        bLeft.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;user-select:none;background:rgba(10,14,22,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(251,191,36,0.45);border-radius:6px;padding:3px 8px;color:#fbbf24;font:700 11px system-ui;box-shadow:0 4px 14px rgba(0,0,0,0.5);white-space:nowrap;';
        bLeft.textContent = '◀ ОРИГИНАЛ';
        document.documentElement.appendChild(bLeft);
        this.splitBadgeLeft = bLeft;

        const bRight = document.createElement('div');
        bRight.className = '__au_split_badge_right';
        bRight.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;user-select:none;background:rgba(10,14,22,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(251,191,36,0.45);border-radius:6px;padding:3px 8px;color:#fbbf24;font:700 11px system-ui;box-shadow:0 4px 14px rgba(0,0,0,0.5);white-space:nowrap;';
        bRight.textContent = 'НЕЙРОСЕТЬ 4K ▶';
        document.documentElement.appendChild(bRight);
        this.splitBadgeRight = bRight;

        const onMove = (e) => {
          if (!this.isDraggingSplit) return;
          const r = this.video.getBoundingClientRect();
          const cx = e.touches ? e.touches[0].clientX : e.clientX;
          const ratio = Math.max(0.02, Math.min(0.98, (cx - r.left) / r.width));
          cfg.splitPosition = ratio;
          this._placeSplitFixed(r);
          this.renderSingleFrame(); // Real-time split drag rendering even on paused video!
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
      const r = this.video.getBoundingClientRect();
      this._placeSplitFixed(r);
    }

    // Capture current 4K Upscaled Frame to PNG Wallpaper + Direct Clipboard Copy
    take4KSnapshot() {
      if (!this.canvas) return;
      try {
        this.canvas.toBlob(blob => {
          if (!blob) {
            const dataUrl = this.canvas.toDataURL('image/png');
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.download = `AnimeUpScaler_4K_${timestamp}.png`;
            a.href = dataUrl;
            document.body.appendChild(a);
            a.click();
            a.remove();
            this.updateHUD('📸 4K Снимок сохранён!');
            return;
          }

          // 1. File download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.download = `AnimeUpScaler_4K_${timestamp}.png`;
          a.href = url;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);

          // 2. Direct Clipboard Copy (PNG Blob)
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
              .then(() => {
                this.updateHUD('📸 4K Снимок скопирован в буфер! (Ctrl+V)');
              })
              .catch(err => {
                console.warn('[AnimeUpScaler PRO] Clipboard copy failed:', err);
                this.updateHUD('📸 4K Снимок сохранён!');
              });
          } else {
            this.updateHUD('📸 4K Снимок сохранён!');
          }
        }, 'image/png');
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
      this.video.removeEventListener('resize',         this._onVideoResize);
      this.video.removeEventListener('canplay',        this._onCanPlay);
      this.video.removeEventListener('loadedmetadata', this._onLoadedMeta);
      this.video.removeEventListener('loadeddata',     this._onLoadedData);
      this.video.removeEventListener('play',           this._onPlay);
      this.video.removeEventListener('pause',          this._onPause);
      this.video.removeEventListener('seeked',         this._onSeeked);
      for (const p of this.passes) p && p.destroy && p.destroy();
      this.passes = [];

      this._destroyTemporalBuffers();
      this._destroyPostBuffers();

      if (this.chromaFbo && this.gl) {
        try { this.gl.deleteFramebuffer(this.chromaFbo); } catch(e) {}
        this.chromaFbo = null;
      }

      if (this.gl) {
        try {
          if (this.progChromaRecon) this.gl.deleteProgram(this.progChromaRecon);
          if (this.progTemporal)    this.gl.deleteProgram(this.progTemporal);
          if (this.progCas)         this.gl.deleteProgram(this.progCas);
          if (this.progLineEnhance) this.gl.deleteProgram(this.progLineEnhance);
          if (this.progBloom)       this.gl.deleteProgram(this.progBloom);
          if (this.progFilmGrain)   this.gl.deleteProgram(this.progFilmGrain);
          if (this.progSplit)       this.gl.deleteProgram(this.progSplit);
          if (this.progBicubic)     this.gl.deleteProgram(this.progBicubic);
          if (this.rawTexture)      this.gl.deleteTexture(this.rawTexture);
          if (this.quadBuf)         this.gl.deleteBuffer(this.quadBuf);
          const e = this.gl.getExtension('WEBGL_lose_context');
          if (e) e.loseContext();
        } catch (e) {}
      }
      if (this.canvas) { try { this.canvas.remove(); } catch (e) {} this.canvas = null; }
      if (this.hudEl)  { try { this.hudEl.remove(); } catch (e) {} this.hudEl = null; }
      if (this.splitHandle) { try { this.splitHandle.remove(); } catch (e) {} this.splitHandle = null; }
      if (this.badgeLeft) { try { this.badgeLeft.remove(); } catch (e) {} this.badgeLeft = null; }
      if (this.badgeRight) { try { this.badgeRight.remove(); } catch (e) {} this.badgeRight = null; }
    }
  }

  // ─── Collapsible Glassmorphic Floating Widget ("Smart Pill") ────────────────
  class PlayerWidget {
    constructor(video) {
      this.video = video;
      this.isCollapsed = !!cfg.widgetCollapsed;
      this.isMenuOpen = false;
      this.activeMenuTab = 'modes';
      this.autoHideTimer = null;
      this.isHoveringWidget = false;

      this.btnAction = null;
      this.tray = null;
      this.btnMode = null;
      this.btnSnapshot = null;
      this.btnSettings = null;
      this.btnCollapse = null;
      this.quickMenu = null;

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
        'height:38px',
        'box-sizing:border-box',
        'transition:width 0.3s cubic-bezier(0.16,1,0.3,1), max-width 0.3s cubic-bezier(0.16,1,0.3,1), background 0.25s ease, border-radius 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease, opacity 0.2s ease',
        'user-select:none',
        'opacity:0',
        'pointer-events:none',
        'white-space:nowrap',
        'contain:layout',
        'will-change:width, transform, opacity'
      ].join(';');

      // In collapsed mode: clicking the collapsed circle expands the widget!
      w.addEventListener('click', (e) => {
        if (this.isCollapsed) {
          e.stopPropagation();
          e.preventDefault();
          this.toggleCollapse();
        }
      }, true);

      // 1. Main Action Button
      const btnAction = document.createElement('div');
      btnAction.className = '__au_widget_main_btn';
      btnAction.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:center', 'gap:5px',
        'height:28px', 'padding:0 12px',
        'border-radius:16px', 'cursor:pointer',
        'transition:all 0.2s cubic-bezier(0.16,1,0.3,1)',
        'box-sizing:border-box',
        'user-select:none'
      ].join(';');
      btnAction.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isCollapsed) return;
        const proc = activeProcessors.get(this.video);
        if (!proc) return;
        if (proc.isOn) {
          proc.stop();
          this.updateState(false);
          saveConfigPatch({ enabled: false });
        } else {
          proc.start();
          this.updateState(true);
          saveConfigPatch({ enabled: true });
        }
      });
      w.appendChild(btnAction);
      this.btnAction = btnAction;

      // Tray for secondary controls (smooth morphing slide-in)
      const tray = document.createElement('div');
      tray.className = '__au_widget_tray';
      tray.style.cssText = [
        'display:flex', 'align-items:center', 'gap:5px',
        'transition:max-width 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        'overflow:hidden', 'box-sizing:border-box'
      ].join(';');
      this.tray = tray;

      // 2. Mode Badge Button
      const btnMode = document.createElement('div');
      btnMode.className = '__au_widget_mode_btn';
      btnMode.title = 'Выбрать режим апскейла Anime UpScaler PRO';
      btnMode.style.cssText = [
        'display:flex', 'align-items:center', 'gap:4px',
        'height:28px', 'padding:0 10px',
        'background:rgba(255,255,255,0.08)',
        'color:#f1f5f9', 'font:600 12px/1 system-ui,-apple-system,sans-serif',
        'border-radius:14px', 'cursor:pointer',
        'border:1px solid rgba(255,255,255,0.12)',
        'transition:all 0.15s ease',
        'white-space:nowrap'
      ].join(';');
      const curMode = getEffectiveMode();
      btnMode.textContent = MODE_LABELS[curMode] || curMode;

      btnMode.addEventListener('mouseenter', () => {
        btnMode.style.background = 'rgba(255,255,255,0.16)';
        btnMode.style.borderColor = 'rgba(255,255,255,0.25)';
      });
      btnMode.addEventListener('mouseleave', () => {
        btnMode.style.background = 'rgba(255,255,255,0.08)';
        btnMode.style.borderColor = 'rgba(255,255,255,0.12)';
      });
      btnMode.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleQuickMenu('modes');
      });
      tray.appendChild(btnMode);
      this.btnMode = btnMode;

      // 3. 4K Snapshot Camera Button
      const btnSnapshot = document.createElement('div');
      btnSnapshot.title = '📸 Сохранить 4K кадр (Обои + Буфер)';
      btnSnapshot.style.cssText = [
        'width:28px', 'height:28px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:50%', 'background:rgba(255,255,255,0.06)',
        'border:1px solid rgba(255,255,255,0.1)',
        'color:#cbd5e1', 'font-size:13px', 'cursor:pointer',
        'transition:all 0.15s ease'
      ].join(';');
      btnSnapshot.textContent = '📸';
      btnSnapshot.addEventListener('mouseenter', () => {
        btnSnapshot.style.background = 'rgba(255,255,255,0.16)';
        btnSnapshot.style.color = '#fff';
      });
      btnSnapshot.addEventListener('mouseleave', () => {
        btnSnapshot.style.background = 'rgba(255,255,255,0.06)';
        btnSnapshot.style.color = '#cbd5e1';
      });
      btnSnapshot.addEventListener('click', (e) => {
        e.stopPropagation();
        const proc = activeProcessors.get(this.video);
        if (proc) proc.take4KSnapshot();
      });
      tray.appendChild(btnSnapshot);
      this.btnSnapshot = btnSnapshot;

      // 4. Settings Gear Button (opens Quick Effects & Settings directly)
      const btnSettings = document.createElement('div');
      btnSettings.title = 'Быстрые эффекты и настройки Anime UpScaler PRO';
      btnSettings.style.cssText = [
        'width:28px', 'height:28px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:50%', 'background:rgba(255,255,255,0.06)',
        'border:1px solid rgba(255,255,255,0.1)',
        'color:#cbd5e1', 'font-size:13px', 'cursor:pointer',
        'transition:all 0.15s ease'
      ].join(';');
      btnSettings.textContent = '⚙️';
      btnSettings.addEventListener('mouseenter', () => {
        btnSettings.style.background = 'rgba(255,255,255,0.16)';
        btnSettings.style.color = '#fff';
      });
      btnSettings.addEventListener('mouseleave', () => {
        btnSettings.style.background = 'rgba(255,255,255,0.06)';
        btnSettings.style.color = '#cbd5e1';
      });
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleQuickMenu('settings');
      });
      tray.appendChild(btnSettings);
      this.btnSettings = btnSettings;

      // 5. Collapse Toggle Chevron
      const btnCollapse = document.createElement('div');
      btnCollapse.title = 'Свернуть в мини-иконку';
      btnCollapse.style.cssText = [
        'width:22px', 'height:28px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border-radius:12px', 'background:transparent',
        'color:#94a3b8', 'font-size:14px', 'font-weight:700', 'cursor:pointer',
        'padding-right:2px',
        'transition:all 0.15s ease'
      ].join(';');
      btnCollapse.textContent = '‹';
      btnCollapse.addEventListener('mouseenter', () => { btnCollapse.style.color = '#fff'; });
      btnCollapse.addEventListener('mouseleave', () => { btnCollapse.style.color = '#94a3b8'; });
      btnCollapse.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse();
      });
      tray.appendChild(btnCollapse);
      this.btnCollapse = btnCollapse;

      w.appendChild(tray);

      // 6. Quick Menu Flyout
      this._initQuickMenu(w);

      // Hover on widget prevents auto-hiding
      w.addEventListener('mouseenter', () => {
        this.isHoveringWidget = true;
        clearTimeout(this.autoHideTimer);
        w.style.opacity = '1';
        w.style.pointerEvents = 'auto';
      });
      w.addEventListener('mouseleave', () => {
        this.isHoveringWidget = false;
        if (!this.isMenuOpen) {
          this._armAutoHide();
        }
      });

      document.documentElement.appendChild(w);
      this.el = w;

      if (this.isCollapsed) {
        this._applyCollapseVisuals(true);
      } else {
        this._applyCollapseVisuals(false);
      }
    }

    _initQuickMenu(parentEl) {
      const m = document.createElement('div');
      m.className = '__au_quick_menu';
      m.style.cssText = [
        'position:absolute',
        'top:calc(100% + 8px)',
        'left:0',
        'width:280px',
        'background:rgba(12,18,28,0.96)',
        'backdrop-filter:blur(16px)',
        '-webkit-backdrop-filter:blur(16px)',
        'border:1px solid rgba(255,255,255,0.16)',
        'border-radius:16px',
        'padding:10px',
        'box-shadow:0 10px 36px rgba(0,0,0,0.7)',
        'color:#e2e8f0',
        'font:12px/1.4 system-ui,-apple-system,sans-serif',
        'z-index:2147483647',
        'user-select:none',
        'display:none',
        'box-sizing:border-box'
      ].join(';');

      m.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      parentEl.appendChild(m);
      this.quickMenu = m;

      this._onDocClick = (e) => {
        if (this.isMenuOpen && !this.el.contains(e.target)) {
          this.closeQuickMenu();
        }
      };
      document.addEventListener('click', this._onDocClick);
    }

    renderQuickMenu() {
      if (!this.quickMenu) return;
      this.quickMenu.innerHTML = '';

      // Section Tabs: Modes vs Settings
      const tabWrap = document.createElement('div');
      tabWrap.style.cssText = 'display:flex;gap:4px;margin-bottom:10px;background:rgba(255,255,255,0.06);padding:3px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);';

      const tabModes = document.createElement('button');
      tabModes.textContent = '🚀 Режимы';
      tabModes.style.cssText = [
        'flex:1', 'padding:6px 0', 'border:none', 'border-radius:7px', 'cursor:pointer',
        'font:600 11px/1 system-ui,-apple-system,sans-serif', 'transition:all 0.15s ease',
        this.activeMenuTab === 'modes'
          ? 'background:#10b981;color:#ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.3);'
          : 'background:transparent;color:#94a3b8;'
      ].join(';');
      tabModes.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeMenuTab = 'modes';
        this.renderQuickMenu();
      });
      tabWrap.appendChild(tabModes);

      const tabSettings = document.createElement('button');
      tabSettings.textContent = '⚙️ Настройки и Эффекты';
      tabSettings.style.cssText = [
        'flex:1', 'padding:6px 0', 'border:none', 'border-radius:7px', 'cursor:pointer',
        'font:600 11px/1 system-ui,-apple-system,sans-serif', 'transition:all 0.15s ease',
        this.activeMenuTab === 'settings'
          ? 'background:#10b981;color:#ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.3);'
          : 'background:transparent;color:#94a3b8;'
      ].join(';');
      tabSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeMenuTab = 'settings';
        this.renderQuickMenu();
      });
      tabWrap.appendChild(tabSettings);

      this.quickMenu.appendChild(tabWrap);

      if (this.activeMenuTab === 'modes') {
        // Section: Modes (1-click switching)
        const modesList = [
          { id: 'godmode', label: '🚀 Supreme Godmode (50-Pass)' },
          { id: 'ultra',   label: '💎 Ultra Master (L-Tier)' },
          { id: 'hq',      label: '🎬 HQ Кино (RestoreM + UpscaleM)' },
          { id: '4-turbo', label: '⚡ Режим 4 Turbo (Fast 3-Pass)' },
          { id: '4',       label: '★ Режим 4 (Оригинал AnimeSR)' },
          { id: 'auto',    label: '🤖 Умный Авто-баланс' }
        ];

        const effectiveMode = getEffectiveMode();
        for (const m of modesList) {
          const item = document.createElement('div');
          const isActive = (effectiveMode === m.id);
          item.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'padding:6px 10px', 'border-radius:8px', 'cursor:pointer',
            'font-size:12px', 'margin-bottom:3px', 'transition:all 0.15s ease',
            isActive
              ? 'background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.45);color:#34d399;font-weight:600'
              : 'background:rgba(255,255,255,0.03);border:1px solid transparent;color:#cbd5e1'
          ].join(';');

          item.innerHTML = `<span>${m.label}</span>${isActive ? '<span style="color:#10b981;font-weight:700">✓</span>' : ''}`;

          item.addEventListener('mouseenter', () => {
            if (!isActive) {
              item.style.background = 'rgba(255,255,255,0.08)';
              item.style.color = '#fff';
            }
          });
          item.addEventListener('mouseleave', () => {
            if (!isActive) {
              item.style.background = 'rgba(255,255,255,0.03)';
              item.style.color = '#cbd5e1';
            }
          });

          item.addEventListener('click', () => {
            saveConfigPatch({ mode: m.id });
            cfg.mode = m.id;
            applyAll();
            this.renderQuickMenu();
            const proc = activeProcessors.get(this.video);
            this.updateState(proc && proc.isOn);
          });

          this.quickMenu.appendChild(item);
        }
      } else {
        // Section: Quick Toggles & Effects
        const togglesList = [
          { key: 'enableFilmGrain',      label: '🎞 Пленочное зерно (Grain)' },
          { key: 'enableHighlightClamp', label: '☀️ Защита пересветов (Clamp)', def: true },
          { key: 'enableLineEnhance',    label: '✒️ Контуры (Line Shaper)',    def: true },
          { key: 'enableBloom',          label: '✨ Блум (Bloom)' },
          { key: 'splitScreen',          label: '🎮 Сравнение (Split-Screen)' },
          { key: 'showHud',              label: '📊 Телеметрия (HUD-оверлей)', def: true }
        ];

        for (const t of togglesList) {
          const item = document.createElement('div');
          const isOn = (t.def === true) ? (cfg[t.key] !== false) : !!cfg[t.key];

          item.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'padding:6px 8px', 'border-radius:8px', 'cursor:pointer',
            'font-size:12px', 'margin-bottom:3px', 'background:rgba(255,255,255,0.03)',
            'color:#cbd5e1', 'transition:all 0.15s ease'
          ].join(';');

          const trackBg = isOn ? '#10b981' : 'rgba(255,255,255,0.18)';
          const thumbLeft = isOn ? '15px' : '2px';

          item.innerHTML = `
            <span>${t.label}</span>
            <div style="width:30px;height:17px;border-radius:9px;background:${trackBg};position:relative;transition:background 0.2s ease;">
              <div style="width:13px;height:13px;border-radius:50%;background:#ffffff;position:absolute;top:2px;left:${thumbLeft};transition:left 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
            </div>
          `;

          item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(255,255,255,0.07)';
          });
          item.addEventListener('mouseleave', () => {
            item.style.background = 'rgba(255,255,255,0.03)';
          });

          item.addEventListener('click', () => {
            const nextVal = !isOn;
            saveConfigPatch({ [t.key]: nextVal });
            applyAll();
            this.renderQuickMenu();
          });

          this.quickMenu.appendChild(item);
        }

        // Section: Whitelist & Full Settings
        const footer = document.createElement('div');
        footer.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:5px;';

        const btnHideSite = document.createElement('div');
        btnHideSite.style.cssText = [
          'display:flex', 'align-items:center', 'justify-content:center', 'gap:6px',
          'padding:6px 10px', 'border-radius:10px',
          'background:rgba(239,68,68,0.1)', 'border:1px solid rgba(239,68,68,0.25)',
          'color:#f87171', 'font:600 11px/1 system-ui,-apple-system,sans-serif',
          'cursor:pointer', 'transition:all 0.15s ease'
        ].join(';');
        btnHideSite.innerHTML = '<span>❌ Скрыть на этом сайте</span>';
        btnHideSite.title = `Убрать ${CLEAN_HOST} из белого списка и скрыть кнопку`;

        btnHideSite.addEventListener('mouseenter', () => {
          btnHideSite.style.background = 'rgba(239,68,68,0.2)';
          btnHideSite.style.color = '#fca5a5';
        });
        btnHideSite.addEventListener('mouseleave', () => {
          btnHideSite.style.background = 'rgba(239,68,68,0.1)';
          btnHideSite.style.color = '#f87171';
        });
        btnHideSite.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeQuickMenu();
          const cleanHost = CLEAN_HOST;
          let list = Array.isArray(cfg.allowedHosts) ? [...cfg.allowedHosts] : [...DEFAULTS.allowedHosts];
          list = list.filter(item => {
            const it = cleanDomain(item);
            return !(cleanHost === it || cleanHost.endsWith('.' + it) || it.endsWith('.' + cleanHost));
          });
          const hosts = { ...(cfg.hosts || {}) };
          delete hosts[HOST];
          delete hosts[cleanHost];
          saveConfigPatch({ allowedHosts: list, hosts });
          applyAll();
        });
        footer.appendChild(btnHideSite);

        const btnFullSettings = document.createElement('div');
        btnFullSettings.style.cssText = [
          'display:flex', 'align-items:center', 'justify-content:center', 'gap:6px',
          'padding:7px 10px', 'border-radius:10px',
          'background:rgba(56,189,248,0.1)', 'border:1px solid rgba(56,189,248,0.25)',
          'color:#38bdf8', 'font:600 12px/1 system-ui,-apple-system,sans-serif',
          'cursor:pointer', 'transition:all 0.15s ease'
        ].join(';');
        btnFullSettings.innerHTML = '<span>Детальные настройки ↗</span>';

        btnFullSettings.addEventListener('mouseenter', () => {
          btnFullSettings.style.background = 'rgba(56,189,248,0.2)';
          btnFullSettings.style.color = '#7dd3fc';
        });
        btnFullSettings.addEventListener('mouseleave', () => {
          btnFullSettings.style.background = 'rgba(56,189,248,0.1)';
          btnFullSettings.style.color = '#38bdf8';
        });
        btnFullSettings.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeQuickMenu();
          chrome.runtime.sendMessage({ op: 'OPEN_OPTIONS' });
        });

        footer.appendChild(btnFullSettings);
        this.quickMenu.appendChild(footer);
      }
    }

    toggleQuickMenu(tab = 'modes') {
      if (this.isMenuOpen && this.activeMenuTab === tab) {
        this.closeQuickMenu();
      } else {
        this.openQuickMenu(tab);
      }
    }

    openQuickMenu(tab = 'modes') {
      if (this.isCollapsed) {
        this.isCollapsed = false;
        saveConfigPatch({ widgetCollapsed: false });
        this._applyCollapseVisuals(false);
      }
      this.activeMenuTab = tab;
      this.isMenuOpen = true;
      this.renderQuickMenu();

      const rect = this.el.getBoundingClientRect();
      if (rect.bottom + 420 > window.innerHeight && rect.top > 420) {
        this.quickMenu.style.top = 'auto';
        this.quickMenu.style.bottom = 'calc(100% + 8px)';
      } else {
        this.quickMenu.style.bottom = 'auto';
        this.quickMenu.style.top = 'calc(100% + 8px)';
      }

      this.quickMenu.style.display = 'block';
      this.el.style.opacity = '1';
      this.el.style.pointerEvents = 'auto';
      clearTimeout(this.autoHideTimer);
    }

    closeQuickMenu() {
      this.isMenuOpen = false;
      if (this.quickMenu) this.quickMenu.style.display = 'none';
      this._armAutoHide();
    }

    _applyCollapseVisuals(collapsed) {
      if (!this.el) return;
      this.isCollapsed = !!collapsed;
      const proc = activeProcessors.get(this.video);
      const on = proc && proc.isOn;

      if (collapsed) {
        if (this.quickMenu) this.quickMenu.style.display = 'none';
        this.isMenuOpen = false;

        // Perfect 1:1 circle (36px x 36px) - seamless, zero outer padding
        this.el.style.width = '36px';
        this.el.style.minWidth = '36px';
        this.el.style.maxWidth = '36px';
        this.el.style.height = '36px';
        this.el.style.borderRadius = '50%';
        this.el.style.aspectRatio = '1 / 1';
        this.el.style.padding = '0';
        this.el.style.overflow = 'hidden';
        this.el.style.cursor = 'pointer';
        this.el.title = 'Нажмите, чтобы развернуть Anime UpScaler PRO';

        // Tray collapses smoothly
        if (this.tray) {
          this.tray.style.maxWidth = '0';
          this.tray.style.opacity = '0';
          this.tray.style.transform = 'translateX(-10px) scale(0.9)';
          this.tray.style.pointerEvents = 'none';
          this.tray.style.marginLeft = '0';
        }

        // Action button fills the entire circle cleanly
        this.btnAction.style.width = '100%';
        this.btnAction.style.height = '100%';
        this.btnAction.style.minWidth = 'unset';
        this.btnAction.style.maxWidth = 'unset';
        this.btnAction.style.padding = '0';
        this.btnAction.style.margin = '0';
        this.btnAction.style.borderRadius = '50%';
        this.btnAction.style.aspectRatio = '1 / 1';
        this.btnAction.style.background = 'transparent';
        this.btnAction.style.border = 'none';
        this.btnAction.style.boxShadow = 'none';
        this.btnAction.style.display = 'flex';
        this.btnAction.style.alignItems = 'center';
        this.btnAction.style.justifyContent = 'center';

        if (on) {
          this.el.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          this.el.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)';
          this.el.style.border = '1px solid rgba(52, 211, 153, 0.55)';
          this.btnAction.innerHTML = `<span style="font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;">✨</span>`;
        } else {
          this.el.style.background = 'linear-gradient(135deg, #334155, #1e293b)';
          this.el.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12)';
          this.el.style.border = '1px solid rgba(255, 255, 255, 0.18)';
          this.btnAction.innerHTML = `<span style="font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;color:#cbd5e1;">⚡</span>`;
        }
      } else {
        // Expanded sleek glassmorphic pill
        this.el.style.width = 'auto';
        this.el.style.minWidth = 'unset';
        this.el.style.maxWidth = '460px';
        this.el.style.height = '38px';
        this.el.style.borderRadius = '24px';
        this.el.style.aspectRatio = 'auto';
        this.el.style.padding = '4px 6px';
        this.el.style.overflow = 'visible';
        this.el.style.cursor = 'default';
        this.el.title = '';
        this.el.style.background = 'rgba(10, 15, 26, 0.92)';
        this.el.style.backdropFilter = 'blur(16px)';
        this.el.style.webkitBackdropFilter = 'blur(16px)';
        this.el.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        this.el.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.65)';

        // Action button inside expanded container
        this.btnAction.style.width = 'auto';
        this.btnAction.style.height = '28px';
        this.btnAction.style.minWidth = 'unset';
        this.btnAction.style.maxWidth = 'unset';
        this.btnAction.style.padding = '0 12px';
        this.btnAction.style.borderRadius = '16px';
        this.btnAction.style.aspectRatio = 'auto';
        this.btnAction.style.display = 'flex';
        this.btnAction.style.alignItems = 'center';
        this.btnAction.style.justifyContent = 'center';
        this.btnAction.style.gap = '5px';

        if (on) {
          this.btnAction.innerHTML = `<span style="font-size:13px">✨</span><span style="font-size:12px;font-weight:700">4K ON</span>`;
          this.btnAction.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          this.btnAction.style.boxShadow = '0 2px 10px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
          this.btnAction.style.border = '1px solid rgba(52, 211, 153, 0.4)';
          this.btnAction.style.color = '#ffffff';
        } else {
          this.btnAction.innerHTML = `<span style="font-size:13px">⚡</span><span style="font-size:12px;font-weight:600">Улучшить</span>`;
          this.btnAction.style.background = 'linear-gradient(135deg, #334155, #1e293b)';
          this.btnAction.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)';
          this.btnAction.style.border = '1px solid rgba(255, 255, 255, 0.14)';
          this.btnAction.style.color = '#cbd5e1';
        }

        // Tray expands smoothly
        if (this.tray) {
          this.tray.style.maxWidth = '360px';
          this.tray.style.opacity = '1';
          this.tray.style.transform = 'translateX(0) scale(1)';
          this.tray.style.pointerEvents = 'auto';
          this.tray.style.marginLeft = '5px';
        }
      }
      this.updateState(on);
    }

    toggleCollapse() {
      this.isCollapsed = !this.isCollapsed;
      cfg.widgetCollapsed = this.isCollapsed;
      this._applyCollapseVisuals(this.isCollapsed);
      try {
        chrome.storage.local.set({ widgetCollapsed: this.isCollapsed });
      } catch (e) {}
    }

    updateState(isOn) {
      const mode = getEffectiveMode();
      if (this.btnMode) {
        this.btnMode.textContent = MODE_LABELS[mode] || mode;
      }
      if (this.isMenuOpen) {
        this.renderQuickMenu();
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
      if (this.isHoveringWidget || this.isMenuOpen) return;
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

        if (fse) {
          // Fullscreen mode: mount inside fullscreen container to stay properly layered
          if (this.el.parentElement !== fse) {
            fse.appendChild(this.el);
          }
          this.el.style.position = 'absolute';
          this.el.style.left = '16px';
          this.el.style.top  = '16px';

          if (!cfg.autoHideUI || this.isHoveringWidget || this.isMenuOpen) {
            this.el.style.opacity = '1';
            this.el.style.pointerEvents = 'auto';
          }
        } else {
          // Windowed mode: attached to documentElement
          if (this.el.parentElement !== document.documentElement) {
            document.documentElement.appendChild(this.el);
          }
          this.el.style.position = 'fixed';

          const r = this.video.getBoundingClientRect();

          // Occlusion guards:
          // 1. Is player scrolled behind top sticky navbar (AnimeLib/Jut.su/YouTube sticky header: ~50-65px)?
          // 2. Is player scrolled out of viewport (bottom < 80px or top > innerHeight - 40px)?
          // 3. Is player hidden or collapsed (< 16px)?
          const isUnderStickyNav = (r.top < 56);
          const isOutOfView = (r.bottom < 80 || r.top > window.innerHeight - 40 || r.right < 40 || r.left > window.innerWidth - 40);
          const isTooSmall = (r.width < 16 || r.height < 16);

          if (isUnderStickyNav || isOutOfView || isTooSmall) {
            this.el.style.opacity = '0';
            this.el.style.pointerEvents = 'none';
            if (this.isMenuOpen) {
              this.closeQuickMenu();
            }
          } else {
            this.el.style.left = (r.left + 14) + 'px';
            this.el.style.top  = (r.top  + 14) + 'px';

            if (!cfg.autoHideUI || this.isHoveringWidget || this.isMenuOpen) {
              this.el.style.opacity = '1';
              this.el.style.pointerEvents = 'auto';
            }
          }
        }
        this._trackRaf = requestAnimationFrame(updatePos);
      };
      this._trackRaf = requestAnimationFrame(updatePos);
    }

    destroy() {
      if (this._trackRaf) cancelAnimationFrame(this._trackRaf);
      clearTimeout(this.autoHideTimer);
      if (this._onDocClick) document.removeEventListener('click', this._onDocClick);
      if (this.el) this.el.remove();
    }
  }

  // ─── Video Discovery ────────────────────────────────────────────────────────
  function collectVideos(root, list) {
    if (!root) return;
    try {
      for (const v of root.querySelectorAll('video')) {
        // Ignore micro-videos / hover preview thumbnails (< 64px)
        if ((v.offsetWidth > 0 && v.offsetWidth < 64) || (v.offsetHeight > 0 && v.offsetHeight < 64)) {
          continue;
        }
        list.add(v);
      }
    } catch (e) {}
    try {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collectVideos(el.shadowRoot, list);
      }
    } catch (e) {}
  }

  function scanForVideos() {
    if (!isSiteAllowed()) {
      for (const [video, proc] of activeProcessors.entries()) {
        try { proc.destroy(); } catch (e) {}
      }
      for (const [video, widget] of playerWidgets.entries()) {
        try { widget.destroy(); } catch (e) {}
      }
      activeProcessors.clear();
      playerWidgets.clear();
      purgeDOM();
      return;
    }

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
      if ((v.offsetWidth > 0 && v.offsetWidth < 64) || (v.offsetHeight > 0 && v.offsetHeight < 64)) {
        continue;
      }

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
    if (!isSiteAllowed()) {
      for (const [video, proc] of activeProcessors.entries()) {
        try { proc.destroy(); } catch (e) {}
      }
      for (const [video, widget] of playerWidgets.entries()) {
        try { widget.destroy(); } catch (e) {}
      }
      activeProcessors.clear();
      playerWidgets.clear();
      purgeDOM();
      return;
    }

    scanForVideos();

    const active = isSiteActive();
    for (const [video, proc] of activeProcessors.entries()) {
      let widget = playerWidgets.get(video);
      if (!widget && cfg.buttonStyle !== 'hidden') {
        widget = new PlayerWidget(video);
        playerWidgets.set(video, widget);
      }
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
        const cleanHost = CLEAN_HOST;
        let list = Array.isArray(cfg.allowedHosts) ? [...cfg.allowedHosts] : [...DEFAULTS.allowedHosts];
        const isAllowed = isSiteAllowed();
        const hosts = { ...(cfg.hosts || {}) };
        if (isAllowed) {
          hosts[HOST] = { ...(hosts[HOST] || {}), off: true };
          hosts[cleanHost] = { ...(hosts[cleanHost] || {}), off: true };
          list = list.filter(item => {
            const it = cleanDomain(item);
            return !(cleanHost === it || cleanHost.endsWith('.' + it) || it.endsWith('.' + cleanHost));
          });
        } else {
          if (!list.some(item => cleanDomain(item) === cleanHost)) {
            list.push(cleanHost);
          }
          if (hosts[HOST]) { delete hosts[HOST].off; hosts[HOST].allowed = true; }
          if (hosts[cleanHost]) { delete hosts[cleanHost].off; hosts[cleanHost].allowed = true; }
        }
        saveConfigPatch({ allowedHosts: list, hosts });
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
        let res = '–', fps = 0, ms = 0, dropped = 0, isRunning = false;
        for (const p of activeProcessors.values()) {
          if (p.isOn && p.video) {
            isRunning = true;
            res = `${p.video.videoWidth}x${p.video.videoHeight}→${p.canvas.width}x${p.canvas.height}`;
            fps = p.actualFps; ms = p.emaMs; dropped = p.droppedFrames || 0; break;
          }
        }
        // Fallback to cached subframe status if top frame has no active video
        if (!isRunning && cachedSubframeStatus && (Date.now() - lastSubframeTime < 4000)) {
          isRunning = true;
          res = cachedSubframeStatus.resolution;
          fps = cachedSubframeStatus.fps;
          ms = cachedSubframeStatus.renderMs;
          dropped = cachedSubframeStatus.droppedFrames || 0;
        }
        sendResponse({
          ok: true, active: isRunning || isSiteActive(), isRunning, mode: getEffectiveMode(),
          videoCount: isRunning ? Math.max(1, activeProcessors.size) : activeProcessors.size,
          resolution: res, fps, renderMs: ms, droppedFrames: dropped
        });
      }
    });
  } catch (e) {}

  // ─── Cross-Frame Iframe Telemetry Bridge ─────────────────────────────────────
  let cachedSubframeStatus = null;
  let lastSubframeTime = 0;

  if (window !== window.top) {
    setInterval(() => {
      let isRunning = false, res = '–', fps = 0, ms = 0, dropped = 0;
      for (const p of activeProcessors.values()) {
        if (p.isOn && p.video) {
          isRunning = true;
          res = `${p.video.videoWidth}x${p.video.videoHeight}→${p.canvas.width}x${p.canvas.height}`;
          fps = p.actualFps; ms = p.emaMs; dropped = p.droppedFrames || 0; break;
        }
      }
      if (isRunning) {
        try {
          window.top.postMessage({
            type: '__AU_FRAME_STATUS__',
            data: { isRunning, resolution: res, fps, renderMs: ms, droppedFrames: dropped, mode: getEffectiveMode() }
          }, '*');
        } catch (e) {}
      }
    }, 1000);
  } else {
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === '__AU_FRAME_STATUS__' && e.data.data) {
        cachedSubframeStatus = e.data.data;
        lastSubframeTime = Date.now();
      }
    });
  }

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

  // ─── Background Tab Optimization (0% GPU usage when hidden) ────────────────
  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    for (const proc of activeProcessors.values()) {
      if (hidden) {
        proc._isTabHidden = true;
      } else {
        proc._isTabHidden = false;
        if (proc.isOn && !proc.video.paused && !proc.video.ended && !proc._isLoopActive) {
          const id = ++proc.renderingId;
          proc.renderLoop(id);
        } else if (proc.isOn) {
          proc.renderSingleFrame();
        }
      }
    }
  });

  if (!isSiteAllowed()) {
    purgeDOM();
  }
  loadConfig();
  scanForVideos();
})();
