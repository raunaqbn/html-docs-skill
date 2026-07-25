import assert from 'node:assert/strict'
import test from 'node:test'
import { getSampleTimes, validateCompositionStatic } from './validate'
import { videoCompositionSchema, type VideoComposition } from './types'

const valid: VideoComposition = {
  version: 1,
  id: 'hello-video',
  title: 'Hello video',
  width: 640,
  height: 360,
  fps: 30,
  durationMs: 2000,
  html: '<section id="card"><h1 id="title">Hello</h1></section>',
  css: '#card{position:absolute;inset:0;background:#111;color:white;display:grid;place-items:center}',
  script: `window.__HTML_VIDEO__={renderFrame({timeMs}){document.getElementById('title').style.opacity=String(Math.min(1,timeMs/500));}}`,
  variables: [],
  assets: [],
  scenes: [{ id: 'intro', startMs: 0, durationMs: 2000, track: 0 }],
}

test('accepts a deterministic composition', () => {
  assert.equal(validateCompositionStatic(valid).ok, true)
})

test('rejects clocks, randomness, and network access', () => {
  const report = validateCompositionStatic({
    ...valid,
    script: `window.__HTML_VIDEO__={renderFrame(){fetch('https://example.com');console.log(Date.now(),Math.random())}}`,
  })
  assert.equal(report.ok, false)
  assert.deepEqual(new Set(report.findings.map((finding) => finding.code)), new Set(['wall_clock', 'unseeded_random', 'network']))
})

test('rejects overlapping scenes on one track', () => {
  const report = validateCompositionStatic({
    ...valid,
    scenes: [
      { id: 'one', startMs: 0, durationMs: 1200, track: 0 },
      { id: 'two', startMs: 1000, durationMs: 1000, track: 0 },
    ],
  })
  assert.equal(report.ok, false)
  assert.ok(report.findings.some((finding) => finding.code === 'scene_overlap'))
})

test('rejects self-playing CSS and markup script breakouts', () => {
  const report = validateCompositionStatic({
    ...valid,
    html: '<div onload="alert(1)">Hello</div>',
    css: '@keyframes drift{to{transform:translateX(2px)}} #card{animation:drift 1s infinite}',
    script: `${valid.script}</script>`,
  })
  assert.equal(report.ok, false)
  assert.deepEqual(
    new Set(report.findings.map((finding) => finding.code)),
    new Set(['inline_html_script', 'self_playing_css', 'script_breakout']),
  )
})

test('allows ordinary element style properties named top', () => {
  const report = validateCompositionStatic({
    ...valid,
    script: `window.__HTML_VIDEO__={renderFrame(){document.getElementById('card').style.top='10px'}}`,
  })
  assert.equal(report.ok, true)
})

test('sample times include scene boundaries and midpoints', () => {
  assert.deepEqual(getSampleTimes(valid), [0, 1000, 1967, 2000])
})

test('accepts long-form compositions without an upper duration cap', () => {
  const longForm = videoCompositionSchema.parse({
    ...valid,
    durationMs: 3_600_000,
    scenes: [{ id: 'intro', startMs: 0, durationMs: 3_600_000, track: 0 }],
  })
  assert.equal(longForm.durationMs, 3_600_000)
})
