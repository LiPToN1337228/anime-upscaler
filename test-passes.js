const fs = require('fs');
const vm = require('vm');

const ctx = {
  console: console,
  globalThis: {},
  window: {}
};
ctx.window.self = ctx.window.top = ctx.window;
vm.createContext(ctx);

const code = fs.readFileSync('anime4k-shaders.js', 'utf8');
vm.runInContext(code, ctx);

const engine = ctx.window.AnimeSREngine;
console.log('Testing AnimeSREngine passes structure...');

// Mock WebGL2 context to inspect program creations
function createMockGL() {
  let idCounter = 1;
  return {
    RGBA16F: 0x881A,
    RGBA: 0x1908,
    FLOAT: 0x1406,
    STATIC_DRAW: 0x88E4,
    ARRAY_BUFFER: 0x8892,
    TEXTURE_2D: 0x0DE1,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84C0,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
    ACTIVE_ATTRIBUTES: 0x8B89,
    ACTIVE_UNIFORMS: 0x8B86,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    TEXTURE_BINDING_2D: 0x8069,

    createBuffer: () => ({ id: idCounter++ }),
    bindBuffer: () => {},
    bufferData: () => {},
    createTexture: () => ({ id: idCounter++ }),
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    getParameter: () => null,
    createFramebuffer: () => ({ id: idCounter++ }),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    viewport: () => {},
    useProgram: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    activeTexture: () => {},
    uniform1i: () => {},
    uniform2f: () => {},
    drawArrays: () => {},
    deleteTexture: () => {},
    deleteFramebuffer: () => {},
    deleteProgram: () => {},

    createShader: (type) => ({ id: idCounter++, type }),
    shaderSource: (sh, src) => { sh.src = src; },
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({ id: idCounter++, shaders: [] }),
    attachShader: (p, sh) => p.shaders.push(sh),
    linkProgram: () => {},
    getProgramParameter: (p, param) => {
      if (param === 0x8B82) return true; // LINK_STATUS
      if (param === 0x8B89) return 1; // ACTIVE_ATTRIBUTES (a_position)
      if (param === 0x8B86) return 3; // ACTIVE_UNIFORMS (u_texture0, u_texture1, u_size)
      return true;
    },
    getProgramInfoLog: () => '',
    getActiveAttrib: (p, idx) => ({ name: 'a_position' }),
    getAttribLocation: () => 0,
    getActiveUniform: (p, idx) => {
      const names = ['u_texture0', 'u_texture1', 'u_size'];
      return { name: names[idx] || 'u_extra' };
    },
    getUniformLocation: (p, name) => ({ name })
  };
}

const mockGL = createMockGL();
const testPassNames = [
  'Anime4kRestoreS',
  'Anime4kUpscaleS',
  'Anime4kRestoreM',
  'Anime4kUpscaleM',
  'Anime4kRestoreL',
  'Anime4kUpscaleL',
  'Anime4kRestoreVL',
  'Anime4kUpscaleVL',
  'Anime4kRestoreUL',
  'Anime4kUpscaleUL'
];

for (const name of testPassNames) {
  const PassClass = engine.passes[name];
  try {
    const inst = new PassClass(mockGL, null, 1280, 720);
    console.log(`[PASS OK] ${name.padEnd(18)} programs: ${inst.programs.length} out: ${inst.outputWidth}x${inst.outputHeight}`);
  } catch (err) {
    console.error(`[PASS FAIL] ${name}:`, err);
  }
}

console.log('\nTesting Preset Chains...');
const presets = {
  'Mode 1 (RestoreS)': ['Anime4kRestoreS'],
  'Mode 2 (RestoreS + UpscaleS)': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode 3 (UpscaleS + RestoreS)': ['Anime4kUpscaleS', 'Anime4kRestoreS'],
  'Mode 4 (User Favorite)': ['Anime4kRestoreS', 'Anime4kUpscaleS', 'Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode 5 (M-Heavy)': ['Anime4kRestoreM', 'Anime4kUpscaleM', 'Anime4kRestoreM', 'Anime4kUpscaleM'],
  'Mode HQ (Cinematic)': ['Anime4kRestoreM', 'Anime4kUpscaleM'],
  'Mode Ultra (Master)': ['Anime4kRestoreL', 'Anime4kUpscaleL'],
  'Mode Godmode (50-Pass UL)': ['Anime4kRestoreUL', 'Anime4kUpscaleUL'],
  'Mode Modern (1080p Digital)': ['Anime4kRestoreS', 'Anime4kUpscaleS'],
  'Mode Retro (90s-2000s)': ['Anime4kRestoreUL', 'Anime4kUpscaleL']
};

for (const [pName, pList] of Object.entries(presets)) {
  let prev = null;
  const chain = [];
  let w = 1280, h = 720;
  for (const passName of pList) {
    const PassClass = engine.passes[passName];
    const inst = new PassClass(mockGL, prev ? prev.outputTexture : null, w, h);
    chain.push(inst);
    w = inst.outputWidth;
    h = inst.outputHeight;
    prev = inst;
  }
  chain[chain.length - 1].isLastPass = true;
  console.log(`[CHAIN OK] ${pName.padEnd(28)} -> final: ${w}x${h} (passes: ${chain.length})`);
  // Render test
  for (const p of chain) {
    p.render();
  }
}
console.log('All presets successfully built and rendered without errors!');
