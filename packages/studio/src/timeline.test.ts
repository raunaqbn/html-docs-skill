import assert from 'node:assert/strict'
import test from 'node:test'
import { toTimelineItems } from './timeline'

test('maps timed objects to percentages', () => {
  assert.deepEqual(toTimelineItems([
    { id: 'one', startMs: 0, durationMs: 2_000 },
    { id: 'two', startMs: 2_000, endMs: 5_000 },
  ], 10_000), [
    { id: 'one', left: 0, width: 20 },
    { id: 'two', left: 20, width: 30 },
  ])
})
