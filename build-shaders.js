const fs = require('fs');

const content = fs.readFileSync('source/animesr-0.0.3/0.0.3_0/js/content_script.js', 'utf8');

const start = content.indexOf('var t={');
const endMarker = '},_={};!function e(x){';
const pos = content.indexOf(endMarker);

if (start === -1 || pos === -1) {
  console.error('Failed to locate bundle core');
  process.exit(1);
}

const bundleCore = content.slice(start, pos + 1);

const header = `// AnimeSR WebGL2 Neural Shaders & Passes Library
// Ported, enhanced, and verified for MV3 Chrome / Brave
(function(root) {
  'use strict';
  `;

const footer = `
  var cache = {};
  function __webpack_require__(id) {
    if (cache[id]) return cache[id].exports;
    var module = cache[id] = { exports: {} };
    t[id].call(module.exports, module, module.exports, __webpack_require__);
    return module.exports;
  }

  var basePassMod = __webpack_require__(9302);
  var programWrapperMod = __webpack_require__(7496);

  // Add robust destroy() method to BasePass to prevent WebGL memory leaks
  basePassMod.BasePass.prototype.destroy = function() {
    var gl = this.gl;
    if (!gl) return;
    if (this.verticesBuffer) {
      try { gl.deleteBuffer(this.verticesBuffer); } catch(e) {}
      this.verticesBuffer = null;
    }
    if (this.framebuffer) {
      try { gl.deleteFramebuffer(this.framebuffer); } catch(e) {}
      this.framebuffer = null;
    }
    if (this.programs) {
      for (var i = 0; i < this.programs.length; i++) {
        var p = this.programs[i];
        if (p && p.outputTexture) {
          try { gl.deleteTexture(p.outputTexture); } catch(e) {}
          p.outputTexture = null;
        }
      }
      this.programs = [];
    }
  };

  var passes = {
    Anime4kRestoreS: __webpack_require__(4774).default,
    Anime4kRestoreM: __webpack_require__(9565).default,
    Anime4kRestoreL: __webpack_require__(794).default,
    Anime4kRestoreVL: __webpack_require__(7838).default,
    Anime4kRestoreUL: __webpack_require__(9657).default,
    Anime4kUpscaleS: __webpack_require__(9897).default,
    Anime4kUpscaleM: __webpack_require__(6601).default,
    Anime4kUpscaleL: __webpack_require__(385).default,
    Anime4kUpscaleVL: __webpack_require__(6287).default,
    Anime4kUpscaleUL: __webpack_require__(8167).default
  };

  root.AnimeSREngine = {
    passes: passes,
    BasePass: basePassMod.BasePass,
    TextureSizeError: basePassMod.TextureSizeError,
    DEFAULT_POWER_SLIDER_FLOWS: basePassMod.DEFAULT_POWER_SLIDER_FLOWS,
    ProgramWrapper: programWrapperMod.default || programWrapperMod
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;

const output = header + bundleCore + footer;
fs.writeFileSync('anime4k-shaders.js', output, 'utf8');
console.log('Successfully generated anime4k-shaders.js with destroy() support (' + output.length + ' bytes)');
