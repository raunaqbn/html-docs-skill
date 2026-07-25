/**
 * Runtime source injected into every composition. It deliberately exposes a
 * small deterministic toolkit rather than a self-playing animation clock.
 * Generated compositions receive the requested time and derive all pixels
 * from that value.
 */
export const RUNTIME_SOURCE = String.raw`
(function () {
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mapRange(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    return lerp(outMin, outMax, clamp((value - inMin) / (inMax - inMin), 0, 1));
  }
  function sceneProgress(timeMs, startMs, durationMs) {
    return clamp((timeMs - startMs) / Math.max(1, durationMs), 0, 1);
  }
  function phase(timeMs, startMs, endMs) {
    return clamp((timeMs - startMs) / Math.max(1, endMs - startMs), 0, 1);
  }
  function staggerProgress(progress, index, count, overlap) {
    var safeCount = Math.max(1, count);
    var spread = clamp(overlap == null ? 0.65 : overlap, 0, 0.95);
    var slot = (1 - spread) / safeCount;
    var start = index * slot;
    return clamp((progress - start) / Math.max(0.001, 1 - spread), 0, 1);
  }
  function seededRandom(seed) {
    var value = (Number(seed) || 1) >>> 0;
    return function () {
      value += 0x6D2B79F5;
      var t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smoothstep(edge0, edge1, value) {
    var t = phase(value, edge0, edge1);
    return t * t * (3 - 2 * t);
  }
  function criticallyDamped(t) {
    var x = clamp(t, 0, 1) * 8;
    return 1 - (1 + x) * Math.exp(-x);
  }
  function enterExit(timeMs, enterStart, enterEnd, exitStart, exitEnd) {
    return Math.min(phase(timeMs, enterStart, enterEnd), 1 - phase(timeMs, exitStart, exitEnd));
  }
  function setTransform(element, values) {
    if (!element) return;
    var x = values.x || 0, y = values.y || 0, scale = values.scale == null ? 1 : values.scale;
    var rotate = values.rotate || 0, rotateX = values.rotateX || 0, rotateY = values.rotateY || 0;
    element.style.transform = 'translate3d('+x+'px,'+y+'px,0) rotate('+rotate+'deg) rotateX('+rotateX+'deg) rotateY('+rotateY+'deg) scale('+scale+')';
  }
  function drawPath(element, progress) {
    if (!element) return;
    var paths = element.matches && element.matches('path,line,polyline,polygon,circle,ellipse,rect') ? [element] : Array.from(element.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect'));
    paths.forEach(function (path) {
      var length = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 1000;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length * (1 - clamp(progress, 0, 1)));
    });
  }
  function countTo(value, progress, decimals) {
    var places = decimals == null ? 0 : decimals;
    return (value * clamp(progress, 0, 1)).toFixed(places);
  }
  var ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutCubic: function (t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; },
    inCubic: function (t) { return t*t*t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutQuint: function (t) { return t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t+2,5)/2; },
    outExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10*t); },
    spring: criticallyDamped,
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); }
  };
  window.HtmlVideoRuntime = { clamp: clamp, lerp: lerp, mapRange: mapRange, sceneProgress: sceneProgress, phase: phase, staggerProgress: staggerProgress, seededRandom: seededRandom, smoothstep: smoothstep, enterExit: enterExit, setTransform: setTransform, drawPath: drawPath, countTo: countTo, ease: ease };
})();`

export interface PlayerDocumentOptions {
  variables?: Record<string, unknown>
  autoplay?: boolean
}

export function buildPlayerDocument(
  composition: import('./types').VideoComposition,
  options: PlayerDocumentOptions = {},
): string {
  const variables = Object.fromEntries(composition.variables.map((variable) => [variable.id, variable.default]))
  Object.assign(variables, options.variables ?? {})
  const configJson = JSON.stringify({
    id: composition.id,
    width: composition.width,
    height: composition.height,
    durationMs: composition.durationMs,
    fps: composition.fps,
    variables,
    assets: Object.fromEntries(composition.assets.map((asset) => [asset.id, asset.src])),
  }).replace(/</g, '\\u003c')
  const html = materializeAssetReferences(composition.html, composition)
  const css = materializeAssetReferences(composition.css, composition)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${composition.width},height=${composition.height},initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}
    *,*::before,*::after{box-sizing:border-box}
    #html-video-root{position:relative;width:${composition.width}px;height:${composition.height}px;overflow:hidden;transform-origin:top left}
    ${css}
  </style>
</head>
<body>
  <main id="html-video-root" data-composition-id="${escapeAttribute(composition.id)}">${html}</main>
  <script>${RUNTIME_SOURCE}<\/script>
  <script>window.__HTML_VIDEO_CONFIG__=${configJson};<\/script>
  <script>${composition.script}<\/script>
  <script>
  (function () {
    var config = window.__HTML_VIDEO_CONFIG__;
    var api = window.__HTML_VIDEO__;
    var mounted = false;
    var base = { root: document.getElementById('html-video-root'), variables: config.variables, assets: config.assets, width: config.width, height: config.height, durationMs: config.durationMs, fps: config.fps };
    window.__htmlVideoSeek = async function (timeMs) {
      if (!api || typeof api.renderFrame !== 'function') throw new Error('Composition must register window.__HTML_VIDEO__.renderFrame(context)');
      if (!mounted) {
        if (typeof api.mount === 'function') await api.mount(base);
        mounted = true;
      }
      var safeTime = Math.min(config.durationMs, Math.max(0, Number(timeMs) || 0));
      await api.renderFrame(Object.assign({}, base, { timeMs: safeTime, progress: safeTime / config.durationMs }));
      await document.fonts.ready;
      var pending = Array.from(document.images).filter(function (img) { return !img.complete; }).map(function (img) { return new Promise(function (resolve) { img.addEventListener('load', resolve, {once:true}); img.addEventListener('error', resolve, {once:true}); }); });
      await Promise.all(pending);
      return { timeMs: safeTime };
    };
    function fit() {
      var scale = Math.min(window.innerWidth / config.width, window.innerHeight / config.height);
      base.root.style.transform = 'scale(' + scale + ')';
      base.root.style.position = 'absolute';
      base.root.style.left = Math.max(0, (window.innerWidth - config.width * scale) / 2) + 'px';
      base.root.style.top = Math.max(0, (window.innerHeight - config.height * scale) / 2) + 'px';
    }
    window.addEventListener('resize', fit);
    window.addEventListener('message', function (event) {
      var message = event.data;
      if (!message || message.source !== 'html-docs-player') return;
      if (message.type === 'seek') {
        window.__htmlVideoSeek(message.timeMs).then(function (result) {
          event.source && event.source.postMessage({ source: 'html-video-runtime', type: 'frame', timeMs: result.timeMs }, '*');
        });
      }
      if (message.type === 'variables' && message.variables && typeof message.variables === 'object') {
        Object.assign(base.variables, message.variables);
      }
      if (message.type === 'captions') {
        var captions = document.getElementById('hv-caption-safe-area');
        if (captions) captions.style.display = message.enabled === false ? 'none' : 'flex';
      }
    });
    base.root.addEventListener('click', function (event) {
      var legacySemanticAttribute = ['data', 'hv', 'id'].join('-');
      var target = event.target && event.target.closest ? event.target.closest('[data-html-video-id],[' + legacySemanticAttribute + ']') : null;
      if (!target) return;
      var scene = target.closest('[data-html-video-scene]');
      var bounds = target.getBoundingClientRect();
      window.parent.postMessage({
        source: 'html-video-runtime',
        type: 'selection',
        elementId: target.getAttribute('data-html-video-id') || target.getAttribute(legacySemanticAttribute),
        sceneId: scene && scene.getAttribute('data-html-video-scene'),
        text: (target.textContent || '').trim().slice(0, 500),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      }, '*');
    });
    fit();
    window.__htmlVideoReady = true;
    window.parent.postMessage({ source: 'html-video-runtime', type: 'ready', durationMs: config.durationMs, width: config.width, height: config.height }, '*');
  })();
  <\/script>
</body>
</html>`
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function materializeAssetReferences(source: string, composition: import('./types').VideoComposition): string {
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset.src]))
  return source.replace(/asset:([a-zA-Z][a-zA-Z0-9_-]*)/g, (reference, id: string) => assets.get(id) ?? reference)
}
