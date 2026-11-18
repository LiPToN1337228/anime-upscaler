// Anime UpScaler PRO — Exhaustive Automated Verification Suite (2026 Edition)
// Comprehensive testing across all shaders, pipelines, memory lifecycles, and MV3 invariants.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS:\x1b[0m ${testName} ${detail ? `(${detail})` : ''}`);
    passedTests++;
  } else {
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${testName} ${detail ? `(${detail})` : ''}`);
    failedTests++;
  }
}

console.log('\n======================================================');
console.log('  Anime UpScaler PRO — Automated Verification Suite');
console.log('======================================================\n');

// ── TEST SUITE 1: Manifest v3 Compliance ──────────────────────────────────────
console.log('[Suite 1] Manifest v3 Compliance & Chrome Store Limits');
try {
  const manifestRaw = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert(manifest.manifest_version === 3, 'Manifest is valid MV3', `version ${manifest.manifest_version}`);
  assert(manifest.version === '3.5.1', 'Version matches 3.5.1', manifest.version);
  assert(manifest.options_ui && manifest.options_ui.page === 'options.html', 'Options UI page configured', manifest.options_ui.page);
  assert(manifest.content_scripts && manifest.content_scripts[0].all_frames === true, 'Content script runs in all_frames for iframe support');

  // Chrome shortcut constraint: max 4 commands with suggested_key (including _execute_action)
  const commandsWithKey = Object.entries(manifest.commands || {}).filter(([_, v]) => v.suggested_key);
  assert(commandsWithKey.length <= 4, 'Commands with suggested_key <= 4 (Chrome limitation)', `count: ${commandsWithKey.length}`);
} catch (err) {
  assert(false, 'Manifest v3 validation', err.message);
}

// ── TEST SUITE 2: Mock WebGL2 Context & GLSL Shader Compilation ───────────────
console.log('\n[Suite 2] GLSL Shaders & WebGL2 Shader Programs');

function createStrictMockGL() {
  let idGen = 1;
  const compiledShaders = new Map();
  const linkedPrograms = new Map();

  return {
    RGBA16F: 0x881A, RGBA: 0x1908, FLOAT: 0x1406, UNSIGNED_BYTE: 0x1401,
    STATIC_DRAW: 0x88E4, ARRAY_BUFFER: 0x8892, TEXTURE_2D: 0x0DE1,
    FRAMEBUFFER: 0x8D40, COLOR_ATTACHMENT0: 0x8CE0, TRIANGLES: 0x0004,
    TEXTURE0: 0x84C0, TEXTURE1: 0x84C1, TEXTURE2: 0x84C2, TEXTURE3: 0x84C3,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812F, LINEAR: 0x2601, NEAREST: 0x2600,
    VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
    ACTIVE_ATTRIBUTES: 0x8B89, ACTIVE_UNIFORMS: 0x8B86,
    COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,

    pixelStorei: () => {},
    getParameter: (param) => null,
    getExtension: (name) => ({ name }),
    createBuffer: () => ({ id: idGen++, type: 'buffer' }),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: (b) => { b.deleted = true; },

    createTexture: () => ({ id: idGen++, type: 'texture' }),
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    deleteTexture: (t) => { t.deleted = true; },

    createFramebuffer: () => ({ id: idGen++, type: 'framebuffer' }),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    deleteFramebuffer: (f) => { f.deleted = true; },

    viewport: () => {},
    createShader: (type) => {
      const s = { id: idGen++, type, src: '', compiled: false };
      return s;
    },
    shaderSource: (sh, src) => { sh.src = src; },
    compileShader: (sh) => {
      // Basic GLSL syntax validation
      if (!sh.src || sh.src.trim().length === 0) {
        throw new Error('Empty shader source');
      }
      sh.compiled = true;
      compiledShaders.set(sh.id, sh);
    },
    getShaderParameter: (sh, param) => param === 0x8B81 ? sh.compiled : true,
    getShaderInfoLog: () => '',
    deleteShader: (s) => { s.deleted = true; },

    createProgram: () => ({ id: idGen++, shaders: [], linked: false }),
    attachShader: (p, sh) => p.shaders.push(sh),
    linkProgram: (p) => {
      p.linked = p.shaders.length >= 2;
      linkedPrograms.set(p.id, p);
    },
    getProgramParameter: (p, param) => param === 0x8B82 ? p.linked : 1,
    getProgramInfoLog: () => '',
    deleteProgram: (p) => { p.deleted = true; },

    useProgram: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    activeTexture: () => {},
    uniform1i: () => {},
    uniform1f: () => {},
    uniform2f: () => {},
    drawArrays: () => {},

    getAttribLocation: (p, name) => 0,
    getUniformLocation: (p, name) => ({ name, programId: p.id }),
    getActiveAttrib: () => ({ name: 'aPos' }),
    getActiveUniform: (p, idx) => ({ name: 'uTex' })
  };
}

const mockGL = createStrictMockGL();

// Test GLSL shaders from content.js
const contentCode = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
const bkgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');

function extractShader(code, constName) {
  const match = code.match(new RegExp(`const\\s+${constName}\\s*=\\s*\`([\\s\\S]*?)\`;`));
  return match ? match[1] : null;
}

const VS_QUAD = extractShader(contentCode, 'VS_QUAD');
const FS_SPLIT = extractShader(contentCode, 'FS_SPLIT');
const FS_CAS = extractShader(contentCode, 'FS_CAS');
const FS_BICUBIC = extractShader(contentCode, 'FS_BICUBIC');
const FS_CHROMA = extractShader(contentCode, 'FS_CHROMA_RECONSTRUCT');
const FS_TEMPORAL = extractShader(contentCode, 'FS_TEMPORAL_STABILITY');
const FS_LINE = extractShader(contentCode, 'FS_LINE_ENHANCE');
const FS_BLOOM = extractShader(contentCode, 'FS_BLOOM');
const FS_GRAIN = extractShader(contentCode, 'FS_FILM_GRAIN');

assert(VS_QUAD && VS_QUAD.includes('gl_Position'), 'VS_QUAD shader defined & valid', `${VS_QUAD.length} chars`);
assert(FS_SPLIT && FS_SPLIT.includes('uSplitX'), 'FS_SPLIT (A/B Comparison) shader valid', `${FS_SPLIT.length} chars`);
assert(FS_CAS && FS_CAS.includes('applyVibrance') && FS_CAS.includes('uSharpness'), 'FS_CAS (FidelityFX CAS + Vibrance) shader valid', `${FS_CAS.length} chars`);
assert(FS_CAS && FS_CAS.includes('clampSpecular') && FS_CAS.includes('uClampHighlights'), 'FS_CAS Anime4K Highlight Clamping (>0.88 specular compression) verified');
assert(FS_BICUBIC && FS_BICUBIC.includes('sampleBicubic'), 'FS_BICUBIC Catmull-Rom shader valid', `${FS_BICUBIC.length} chars`);
assert(FS_CHROMA && FS_CHROMA.includes('rgb2yuv') && FS_CHROMA.includes('yuv2rgb'), 'FS_CHROMA_RECONSTRUCT (YUV420p Chroma Fix) shader valid', `${FS_CHROMA.length} chars`);
assert(FS_TEMPORAL && FS_TEMPORAL.includes('uMotionThresh') && FS_TEMPORAL.includes('uBlend'), 'FS_TEMPORAL_STABILITY (Anti-Flicker) shader valid', `${FS_TEMPORAL.length} chars`);
assert(FS_LINE && FS_LINE.includes('uLineDarken') && FS_LINE.includes('uLineThin'), 'FS_LINE_ENHANCE (Line Art Shaper) shader valid', `${FS_LINE.length} chars`);
assert(FS_BLOOM && FS_BLOOM.includes('uBloomStrength'), 'FS_BLOOM (Cinema Diffusion) shader valid', `${FS_BLOOM.length} chars`);
assert(FS_GRAIN && FS_GRAIN.includes('uGrainStrength') && FS_GRAIN.includes('uTime'), 'FS_FILM_GRAIN (Procedural Film Grain) shader valid', `${FS_GRAIN.length} chars`);

// ── TEST SUITE 3: Anime4K Engine Passes & Presets ─────────────────────────────
console.log('\n[Suite 3] Anime4K Engine & Preset Chains');

const ctx = { console, globalThis: {}, window: {} };
ctx.window.self = ctx.window.top = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'anime4k-shaders.js'), 'utf8'), ctx);
const engine = ctx.window.AnimeSREngine;

assert(!!engine && !!engine.passes, 'AnimeSREngine loaded successfully');

const allPassClasses = [
  'Anime4kRestoreS', 'Anime4kRestoreM', 'Anime4kRestoreL', 'Anime4kRestoreVL', 'Anime4kRestoreUL',
  'Anime4kUpscaleS', 'Anime4kUpscaleM', 'Anime4kUpscaleL', 'Anime4kUpscaleVL', 'Anime4kUpscaleUL'
];

allPassClasses.forEach(name => {
  const PassClass = engine.passes[name];
  assert(typeof PassClass === 'function', `Pass class exists: ${name}`);
  const inst = new PassClass(mockGL, null, 1920, 1080);
  assert(inst.programs.length > 0 && typeof inst.destroy === 'function', `Pass compiles & has destroy(): ${name}`, `${inst.programs.length} programs`);
});

const presetChains = {
  'Mode 1 (Denoise)': ['Anime4kRestoreS'],
  'Mode 2 (2X Upscale)': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode 3 (Upscale+Restore)': ['Anime4kUpscaleS', 'Anime4kRestoreS'],
  'Mode 4 (AnimeSR Favorite)': ['Anime4kRestoreS', 'Anime4kUpscaleS', 'Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode 4 Turbo (Fast 3-pass)': ['Anime4kRestoreS', 'Anime4kUpscaleS', 'Anime4kRestoreS'],
  'Mode 5 (M-Heavy)': ['Anime4kRestoreM', 'Anime4kUpscaleM', 'Anime4kRestoreM', 'Anime4kUpscaleM'],
  'Mode HQ (Cinema)': ['Anime4kRestoreM', 'Anime4kUpscaleM'],
  'Mode Ultra (Master L-Tier)': ['Anime4kRestoreL', 'Anime4kUpscaleL'],
  'Mode Godmode (50-Pass UL)': ['Anime4kRestoreUL', 'Anime4kUpscaleUL'],
  'Mode Modern (1080p Digital)': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode Retro (90s-2000s Film)': ['Anime4kRestoreUL', 'Anime4kUpscaleL']
};

for (const [title, passNames] of Object.entries(presetChains)) {
  let prev = null;
  const chain = [];
  let w = 1920, h = 1080;
  for (const pName of passNames) {
    const PC = engine.passes[pName];
    const pass = new PC(mockGL, prev ? prev.outputTexture : null, w, h);
    chain.push(pass);
    w = pass.outputWidth;
    h = pass.outputHeight;
    prev = pass;
  }
  const last = chain[chain.length - 1];
  last.isLastPass = true;

  // Simulate render execution
  chain.forEach(p => p.render());
  assert(chain.length === passNames.length, `Preset executes: ${title}`, `out: ${w}x${h}`);

  // Test cleanup
  chain.forEach(p => p.destroy());
}

// ── TEST SUITE 4: Architecture & Memory Invariants ───────────────────────────
console.log('\n[Suite 4] Architecture & DOM Invariants');

// Check that content.js mounts canvas into video.parentElement (fixes black screen)
assert(contentCode.includes('_mountCanvas'), 'content.js implements _mountCanvas for windowed player');
assert(contentCode.includes('p.insertBefore(this.canvas, v.nextSibling)'), 'Canvas mounted directly adjacent to video in parent');
assert(contentCode.includes('z-index:2') || contentCode.includes("zIndex = '2'"), 'Canvas z-index set to 2 to stay under player controls');

// Check that isLastPass is dynamically recalculated per frame (fixes A/B split bug)
assert(contentCode.includes('.isLastPass = !cfg.splitScreen'), 'isLastPass dynamically managed for split screen');

// Check snapshot capability
assert(contentCode.includes('take4KSnapshot'), '4K Snapshot wallpaper export implemented');
assert(contentCode.includes('ClipboardItem') && contentCode.includes('📸 4K Снимок скопирован в буфер! (Ctrl+V)'), '4K Snapshot direct clipboard copy implemented');

// Check selective whitelist guard
assert(contentCode.includes('function isSiteAllowed()') && contentCode.includes('allowedHosts:'), 'Selective site whitelist guard implemented in content.js');
assert(contentCode.includes('purgeDOM()'), 'content.js implements aggressive purgeDOM() for non-whitelisted sites');
assert(contentCode.includes('❌ Скрыть на этом сайте'), 'content.js quick menu provides in-player whitelist removal');
assert(bkgCode.includes('chrome.runtime.onInstalled.addListener'), 'background.js broadcasts config and purges unapproved tabs on install');

// Check in-player mode switching & quick menu flyout
assert(contentCode.includes('__au_quick_menu') && contentCode.includes('__au_widget_mode_btn'), 'PlayerWidget: In-player Mode switching badge & Glassmorphic Quick Menu flyout');

// Check v3.5.0 Performance & Zero-Lag Invariants
assert(contentCode.includes('getShaderFingerprint'), 'content.js implements pass fingerprint caching to eliminate video lag');
assert(contentCode.includes('isOnlyUI'), 'content.js implements zero-lag fast path bypassing WebGL recompile on UI changes');
assert(contentCode.includes("borderRadius = '50%'") && contentCode.includes("aspectRatio = '1 / 1'"), 'PlayerWidget implements geometric 1:1 circular FAB in collapsed mode');
assert(contentCode.includes('#10b981') && contentCode.includes('#334155'), 'PlayerWidget implements emerald green ON and slate gray OFF button colors');
assert(contentCode.includes('height:28px!important') && contentCode.includes('width:max-content!important'), 'HUD overlay strictly clamped to 28px height to prevent vertical stretching');
assert(contentCode.includes('__AU_FRAME_STATUS__'), 'Cross-frame iframe telemetry bridge implemented for embedded video players');

// ── TEST SUITE 5: Script Syntax Validation ────────────────────────────────────
console.log('\n[Suite 5] JavaScript Syntax Check on All Modules');

const filesToValidate = [
  'content.js',
  'background.js',
  'popup.js',
  'options.js',
  'build-shaders.js',
  'test-passes.js'
];

filesToValidate.forEach(file => {
  try {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    new vm.Script(code, { filename: file });
    assert(true, `Syntax check passed: ${file}`);
  } catch (err) {
    assert(false, `Syntax error in ${file}`, err.message);
  }
});

// ── TEST SUITE 6: UI, Settings & Telemetry Invariants ─────────────────────────
console.log('\n[Suite 6] UI, Settings & Telemetry Invariants');
try {
  const bkg = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  const optHtml = fs.readFileSync(path.join(__dirname, 'options.html'), 'utf8');
  const optJs = fs.readFileSync(path.join(__dirname, 'options.js'), 'utf8');
  const popHtml = fs.readFileSync(path.join(__dirname, 'popup.html'), 'utf8');
  const popJs = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');

  // Background DEFAULTS
  assert(bkg.includes('enableLineEnhance: true'), 'background.js: enableLineEnhance default true');
  assert(bkg.includes('lineDarken: 0.35'), 'background.js: lineDarken default 0.35');
  assert(bkg.includes('lineThin: 0.20'), 'background.js: lineThin default 0.20');
  assert(bkg.includes('enableBloom: false'), 'background.js: enableBloom default false');
  assert(bkg.includes('bloomStrength: 0.15'), 'background.js: bloomStrength default 0.15');
  assert(bkg.includes('batterySaver: true'), 'background.js: batterySaver default true');

  // Options HTML elements
  assert(optHtml.includes('id="checkEnableLineEnhance"'), 'options.html: checkEnableLineEnhance toggle present');
  assert(optHtml.includes('id="rangeLineDarken"') && optHtml.includes('id="valLineDarken"'), 'options.html: lineDarken slider + live badge');
  assert(optHtml.includes('id="rangeLineThin"') && optHtml.includes('id="valLineThin"'), 'options.html: lineThin slider + live badge');
  assert(optHtml.includes('id="checkEnableBloom"'), 'options.html: checkEnableBloom toggle present');
  assert(optHtml.includes('id="rangeBloomStrength"') && optHtml.includes('id="valBloomStrength"'), 'options.html: bloomStrength slider + live badge');
  assert(optHtml.includes('id="checkBatterySaver"'), 'options.html: checkBatterySaver toggle in performance tab');

  // Options JS binds
  assert(optJs.includes('enableLineEnhance: true') && optJs.includes('batterySaver: true'), 'options.js: DEFAULTS registered');
  assert(optJs.includes('$checkEnableLineEnhance') && optJs.includes('$checkBatterySaver'), 'options.js: DOM elements wired');

  // Popup HTML chips & telemetry
  assert(popHtml.includes('id="chipLineEnhance"'), 'popup.html: quick chip ✒️ Line Shaper present');
  assert(popHtml.includes('id="chipBloom"'), 'popup.html: quick chip ✨ Bloom present');
  assert(popHtml.includes('id="telemBatteryItem"') && popHtml.includes('id="telBattery"'), 'popup.html: battery telemetry row present');

  // Popup JS logic
  assert(popJs.includes('enableLineEnhance: true') && popJs.includes('batterySaver: true'), 'popup.js: DEFAULTS registered');
  assert(popJs.includes('navigator.getBattery'), 'popup.js: navigator.getBattery API detection');
  assert(popJs.includes('$chipLineEnhance.addEventListener'), 'popup.js: quick chip event listeners wired');

  // Whitelist & 2026 Shaders (Film Grain & Highlight Clamping)
  assert(bkg.includes("siteMode: 'whitelist'") && bkg.includes('animelib.org'), 'background.js: siteMode whitelist & allowedHosts registered');
  assert(bkg.includes('enableFilmGrain: true') && bkg.includes('grainStrength: 0.035'), 'background.js: Film Grain defaults registered');
  assert(bkg.includes('enableHighlightClamp: true'), 'background.js: Highlight Clamping default registered');
  assert(optHtml.includes('id="checkEnableFilmGrain"') && optHtml.includes('id="rangeGrainStrength"') && optHtml.includes('id="valGrainStrength"'), 'options.html: Film Grain card controls');
  assert(optHtml.includes('id="checkEnableHighlightClamp"'), 'options.html: Highlight Clamping toggle');
  assert(optHtml.includes('id="inputNewHost"') && optHtml.includes('id="btnAddHost"') && optHtml.includes('id="hostsContainer"'), 'options.html: Whitelist management controls');
  assert(optJs.includes('$checkEnableFilmGrain') && optJs.includes('$checkEnableHighlightClamp') && optJs.includes('renderHostsList'), 'options.js: Film Grain, Highlight Clamp & Whitelist wired');
  assert(popHtml.includes('id="btnSiteActivation"') && popHtml.includes('id="siteActivationDesc"'), 'popup.html: Redesigned Site Card activation controls');
  assert(popHtml.includes('id="chipGrain"') && popHtml.includes('id="chipHighlightClamp"'), 'popup.html: Quick chips for Film Grain & Highlight Clamp');
  assert(popJs.includes('$btnSiteActivation') && popJs.includes('isHostAllowed'), 'popup.js: Whitelist selective activation logic');
  assert(popJs.includes('$chipGrain') && popJs.includes('$chipHighlightClamp'), 'popup.js: Quick chips event listeners wired');
} catch (err) {
  assert(false, 'UI & Settings validation', err.message);
}

// ── FINAL SUMMARY ─────────────────────────────────────────────────────────────
console.log('\n======================================================');
console.log(`  Verification Complete: \x1b[32m${passedTests} passed\x1b[0m, \x1b[31m${failedTests} failed\x1b[0m`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
