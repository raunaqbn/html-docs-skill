import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compileVideoProject } from './project'
import { validateCompositionStatic } from './validate'

test('compiles a v2 semantic scene and preserves authoring metadata and overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-video-v2-'))
  try {
    await mkdir(join(root, 'scenes'))
    await Promise.all([
      writeFile(join(root, 'scenes', 'one.html'), '<div data-html-video-id="model"><span>Source</span><span>Model</span></div>'),
      writeFile(join(root, 'scenes', 'one.css'), '[data-html-video-id="model"]{position:absolute;inset:20%;color:white}'),
      writeFile(join(root, 'scenes', 'one.js'), "root.querySelector('[data-html-video-id=\"model\"]').style.opacity=String(progress);"),
    ])
    const projectPath = join(root, 'video.project.json')
    await writeFile(projectPath, JSON.stringify({
      kind: 'html-video-project',
      version: 2,
      id: 'semantic-video',
      title: 'Semantic video',
      width: 1280,
      height: 720,
      fps: 30,
      variables: [],
      assets: [],
      captions: { defaultOn: true, minWords: 2, maxWords: 6, pauseMs: 360 },
      source: { evidenceIds: ['ev-one'], sourceHash: 'abc' },
      manualOverrides: [{ sceneId: 'one', elementId: 'model', properties: { color: '#ffe58f', x: 40 } }],
      scenes: [{
        id: 'one',
        label: 'One model',
        teachingJob: 'Establish the map.',
        evidenceIds: ['ev-one'],
        layout: 'diagram',
        html: 'scenes/one.html',
        css: 'scenes/one.css',
        script: 'scenes/one.js',
        durationMs: 4_000,
        cues: [],
        transition: 'crossfade',
      }],
    }))
    const loaded = await compileVideoProject(projectPath)
    assert.equal(loaded.composition.authoring?.projectVersion, 2)
    assert.deepEqual(loaded.composition.authoring?.evidenceIds, ['ev-one'])
    assert.equal(loaded.composition.manualOverrides?.[0].elementId, 'model')
    assert.equal(validateCompositionStatic(loaded.composition).ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('compiles one canonical v2 word track into cues, captions, and chapters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-video-v2-audio-'))
  try {
    await mkdir(join(root, 'scenes'))
    await mkdir(join(root, 'audio'))
    await Promise.all([
      writeFile(join(root, 'scenes', 'one.html'), '<div data-html-video-id="model">Build the model</div>'),
      writeFile(join(root, 'scenes', 'one.css'), '[data-html-video-id="model"]{opacity:0;color:white}'),
      writeFile(join(root, 'scenes', 'one.js'), ''),
      writeFile(join(root, 'audio', 'master.wav'), silentWav(2_000)),
      writeFile(join(root, 'audio', 'words.json'), JSON.stringify({ words: [
        { text: 'Build', startMs: 200, endMs: 520 },
        { text: 'the', startMs: 550, endMs: 720 },
        { text: 'model', startMs: 750, endMs: 1_120 },
      ] })),
    ])
    const projectPath = join(root, 'video.project.json')
    await writeFile(projectPath, JSON.stringify({
      kind: 'html-video-project',
      version: 2,
      id: 'timed-video',
      title: 'Timed video',
      width: 1280,
      height: 720,
      fps: 30,
      variables: [],
      assets: [],
      audio: {
        master: 'audio/master.wav',
        timings: 'audio/words.json',
        provider: 'elevenlabs',
        voiceProfile: 'warm-teacher',
      },
      captions: { defaultOn: true, minWords: 2, maxWords: 6, pauseMs: 360 },
      source: { evidenceIds: ['ev-one'] },
      manualOverrides: [],
      scenes: [{
        id: 'one',
        label: 'Build the model',
        teachingJob: 'Show the model arriving with the phrase.',
        evidenceIds: ['ev-one'],
        layout: 'diagram',
        html: 'scenes/one.html',
        css: 'scenes/one.css',
        script: 'scenes/one.js',
        spokenText: 'Build the model',
        cues: [{
          id: 'build',
          spokenText: 'Build the model',
          targets: ['model'],
          effect: 'rise',
          visualVerb: 'assemble the model',
          settledState: 'the complete model is readable',
        }],
        transition: 'cut',
      }],
    }))
    const loaded = await compileVideoProject(projectPath)
    assert.equal(loaded.composition.narration?.words?.length, 3)
    assert.equal(loaded.composition.captions?.groups.length, 1)
    assert.match(loaded.composition.captions?.webVtt ?? '', /Build the model/)
    assert.match(loaded.composition.css, /\.hv-caption-word\[data-active="true"\]/)
    assert.match(loaded.composition.css, /background:var\(--hv-caption-accent/)
    assert.match(loaded.composition.script, /word\.startMs/)
    assert.match(loaded.composition.script, /--hv-caption-active/)
    assert.equal(loaded.composition.chapters?.[0].startMs, 0)
    assert.equal(validateCompositionStatic(loaded.composition).ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function silentWav(durationMs: number) {
  const sampleRate = 8_000
  const samples = Math.round(sampleRate * durationMs / 1000)
  const dataBytes = samples * 2
  const output = Buffer.alloc(44 + dataBytes)
  output.write('RIFF', 0)
  output.writeUInt32LE(36 + dataBytes, 4)
  output.write('WAVEfmt ', 8)
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36)
  output.writeUInt32LE(dataBytes, 40)
  return output
}
