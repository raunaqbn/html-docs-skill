import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { normalizeLocalSource } from './course'

test('normalizes a local code source while excluding secrets and ignored build output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-course-source-'))
  try {
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'node_modules'))
    await Promise.all([
      writeFile(join(root, 'src', 'model.ts'), 'export function model(value: number) { return value * 2 }\n'),
      writeFile(join(root, 'README.md'), '# Example system\n\nThe model doubles its input.\n'),
      writeFile(join(root, '.env'), 'SECRET=never-upload\n'),
      writeFile(join(root, 'node_modules', 'dependency.js'), 'ignored\n'),
    ])
    const normalized = await normalizeLocalSource(root)
    assert.deepEqual(normalized.snapshot.entries.map((entry) => entry.path), ['README.md', 'src/model.ts'])
    assert.ok(normalized.evidence.some((record) => record.text.includes('doubles its input')))
    assert.equal(normalized.snapshot.privacy.uploadMode, 'used-excerpts')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
