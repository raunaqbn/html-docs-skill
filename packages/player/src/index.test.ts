import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlayerUrl } from './index'

test('builds a stable embedded player URL', () => {
  assert.equal(
    buildPlayerUrl('A1B2C3D4E5'),
    'https://www.html-docs.com/v/a1b2c3d4e5?embed=1',
  )
})

test('rejects malformed share codes', () => {
  assert.throws(() => buildPlayerUrl('not-a-code'), /10 hexadecimal/)
})
