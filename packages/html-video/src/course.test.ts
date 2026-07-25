import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { courseProjectSchema, normalizeLocalSource } from './course'

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

test('accepts adaptive learning metadata while keeping legacy course projects readable', () => {
  const base = {
    kind: 'html-course-project' as const,
    version: 1 as const,
    id: 'course-one',
    title: 'Course one',
    description: 'A grounded course.',
    audience: 'New engineers',
    depth: 'intermediate' as const,
    learningOutcomes: ['Apply the central model'],
    visibility: 'private' as const,
    voiceProfile: 'warm-teacher' as const,
    designPath: 'design.md',
    source: {
      manifestPath: 'source/manifest.json',
      evidencePath: 'source/evidence.jsonl',
      fingerprintsPath: 'source/fingerprints.json',
    },
    website: { slug: 'course-one' },
    modules: [{
      id: 'core',
      title: 'Core',
      summary: 'Build the model.',
      lessons: [{
        id: 'foundations',
        slug: 'foundations',
        title: 'Foundations',
        summary: 'The core model.',
        objectives: ['Apply the model'],
        prerequisites: [],
        evidenceIds: ['ev_one'],
        sourceDependencies: ['source.md'],
        page: 'lessons/01/page.html',
        videoProject: 'lessons/01/video.project.json',
        durationTargetMinutes: 7,
        checks: [
          { id: 'check-one', prompt: 'Choose one', choices: ['A', 'B'], answer: 0, explanation: 'A', evidenceIds: ['ev_one'] },
          { id: 'check-two', prompt: 'Choose two', choices: ['A', 'B'], answer: 1, explanation: 'B', evidenceIds: ['ev_one'] },
        ],
        status: 'planned' as const,
      }],
    }],
    generation: {
      createdAt: '2026-07-25T00:00:00.000Z',
      sourceFingerprint: 'a'.repeat(64),
      privatePreviewOnly: true as const,
    },
  }

  assert.equal(courseProjectSchema.parse(base).modules[0].lessons[0].mastery, undefined)

  const adaptive = courseProjectSchema.parse({
    ...base,
    learning: {
      learnerPath: 'learning/LEARNER.md',
      glossaryPath: 'learning/GLOSSARY.md',
      resourcesPath: 'learning/RESOURCES.md',
      recordsDirectory: 'learning/records',
      masteryModel: 'evidence-state',
    },
    production: {
      specificationPath: 'COURSE-SPEC.md',
      slicesDirectory: 'production',
      strategy: 'vertical-slices',
    },
    modules: [{
      ...base.modules[0],
      lessons: [{
        ...base.modules[0].lessons[0],
        mastery: [{
          id: 'apply-model',
          objective: 'Apply the model',
          successCriteria: ['Solve a changed-surface example'],
          prerequisiteObjectiveIds: [],
          initialState: 'unseen',
        }],
        practice: {
          retrieval: 'Predict first.',
          guided: 'Try with hints.',
          transfer: 'Try a new case.',
          feedback: 'Explain the causal mismatch.',
        },
        productionSlice: 'production/01-foundations.md',
        checks: base.modules[0].lessons[0].checks.map((check, index) => ({
          ...check,
          objectiveId: 'apply-model',
          kind: index ? 'transfer' : 'recall',
          expectedReasoning: 'Use the model.',
          feedback: { correct: 'Correct.', misconceptions: {} },
          masteryTransition: index ? 'demonstrated' : 'practiced',
        })),
      }],
    }],
  })

  assert.equal(adaptive.learning?.masteryModel, 'evidence-state')
  assert.equal(adaptive.modules[0].lessons[0].checks[1].masteryTransition, 'demonstrated')
})
