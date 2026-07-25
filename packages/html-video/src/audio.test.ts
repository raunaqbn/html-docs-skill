import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignWordOwnership,
  buildCaptionGroups,
  captionsToSrt,
  captionsToWebVtt,
  elevenLabsAlignmentToWords,
  forcedAlignmentToWords,
} from './audio'

test('converts ElevenLabs character alignment into canonical word timings', () => {
  const characters = [...'Hello gentle world']
  const words = elevenLabsAlignmentToWords({
    characters,
    character_start_times_seconds: characters.map((_, index) => index * 0.05),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
  }, 200)
  assert.deepEqual(words.map((word) => word.text), ['Hello', 'gentle', 'world'])
  assert.equal(words[0].startMs, 200)
  assert.equal(words[2].endMs, 1100)
})

test('rejects forced alignment that drifts from the locked script', () => {
  assert.throws(() => forcedAlignmentToWords([
    { word: 'The', start: 0, end: 0.2 },
    { word: 'wrong', start: 0.21, end: 0.5 },
  ], 'The model'), /does not cover the locked script exactly/)
})

test('one word track drives cue ownership and caption exports', () => {
  const words = [
    { index: 0, text: 'Build', startMs: 200, endMs: 480 },
    { index: 1, text: 'the', startMs: 500, endMs: 650 },
    { index: 2, text: 'model', startMs: 670, endMs: 980 },
    { index: 3, text: 'then', startMs: 1400, endMs: 1620 },
    { index: 4, text: 'apply', startMs: 1640, endMs: 1900 },
    { index: 5, text: 'it', startMs: 1910, endMs: 2050 },
  ]
  const cues = [
    { id: 'build', sceneId: 'one', text: 'Build the model', startMs: 200, endMs: 980, targets: ['#model'], effect: 'rise' as const },
    { id: 'apply', sceneId: 'one', text: 'then apply it', startMs: 1400, endMs: 2050, targets: ['#application'], effect: 'draw' as const },
  ]
  const owned = assignWordOwnership(words, cues)
  assert.deepEqual(owned.map((word) => word.cueId), ['build', 'build', 'build', 'apply', 'apply', 'apply'])
  const captions = buildCaptionGroups(owned, { minWords: 2, maxWords: 6, pauseMs: 300 })
  assert.equal(captions.length, 2)
  assert.match(captionsToWebVtt(captions), /00:00:00\.200 --> 00:00:00\.980/)
  assert.match(captionsToSrt(captions), /00:00:01,400 --> 00:00:02,050/)
})
