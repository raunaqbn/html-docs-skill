import assert from 'node:assert/strict'
import test from 'node:test'
import { getRenderCacheKey } from './renderer'
import type { VideoComposition } from './types'

const composition = {
  version: 1,
  id: 'cache-fixture',
  title: 'Cache fixture',
  width: 640,
  height: 360,
  fps: 30,
  durationMs: 1_000,
  html: '<main>hello</main>',
  css: 'main{color:white}',
  script: '',
  scenes: [{ id: 'one', startMs: 0, durationMs: 1_000, track: 0 }],
  variables: [],
  assets: [],
} satisfies VideoComposition

test('render cache keys are stable and include pixel-affecting inputs', () => {
  const first = getRenderCacheKey(composition, { theme: 'dark' }, 'mp4')
  assert.equal(first, getRenderCacheKey(composition, { theme: 'dark' }, 'mp4'))
  assert.notEqual(first, getRenderCacheKey(composition, { theme: 'light' }, 'mp4'))
  assert.notEqual(first, getRenderCacheKey(composition, { theme: 'dark' }, 'webm'))
})
