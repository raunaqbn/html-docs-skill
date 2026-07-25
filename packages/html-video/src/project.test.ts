import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compileVideoProject } from './project'
import { validateCompositionStatic } from './validate'

test('compiles modular scenes, embeds assets, and derives scenes from exact word timings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-video-project-test-'))
  try {
    await mkdir(join(root, 'scenes'))
    await mkdir(join(root, 'assets'))
    await mkdir(join(root, 'audio'))
    await Promise.all([
      writeFile(join(root, 'scenes/one.html'), '<div id="one-title">One</div><svg><path id="one-path" d="M0 0L10 10"/></svg>'),
      writeFile(join(root, 'scenes/two.html'), '<div id="two-title">Two</div><div id="two-result">Result</div>'),
      writeFile(join(root, 'scenes/one.css'), '#hv-scene-one{background:#112}'),
      writeFile(join(root, 'scenes/two.css'), '#hv-scene-two{background:#221}'),
      writeFile(join(root, 'scenes/one.js'), "root.querySelector('#one-path').style.opacity=String(cue('path'));"),
      writeFile(join(root, 'scenes/two.js'), "root.querySelector('#two-result').style.filter='blur('+h.lerp(8,0,cue('result'))+'px)';"),
      writeFile(join(root, 'assets/pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8DBVwAAAABJRU5ErkJggg==', 'base64')),
      writeFile(join(root, 'audio/voice.wav'), silentWav(2000)),
      writeFile(join(root, 'audio/words.json'), JSON.stringify([
        { text: 'Watch', startMs: 100, endMs: 320 },
        { text: 'the', startMs: 340, endMs: 470 },
        { text: 'path', startMs: 490, endMs: 760 },
        { text: 'See', startMs: 1030, endMs: 1210 },
        { text: 'the', startMs: 1230, endMs: 1340 },
        { text: 'result', startMs: 1360, endMs: 1690 },
      ])),
    ])
    const project = {
      kind: 'html-video-project', version: 1, id: 'timed-demo', title: 'Timed demo', width: 640, height: 360, fps: 30,
      assets: [{ id: 'pixel', kind: 'image', src: 'assets/pixel.png' }],
      voiceover: { audio: 'audio/voice.wav', timings: 'audio/words.json' },
      scenes: [
        {
          id: 'one', label: 'Path', layout: 'diagram', html: 'scenes/one.html', css: 'scenes/one.css', script: 'scenes/one.js',
          narration: 'Watch the path', cues: [
            { id: 'watch', text: 'Watch the', targets: ['#one-title'], effect: 'rise' },
            { id: 'path', text: 'path', targets: ['#one-path'], effect: 'draw' },
          ],
        },
        {
          id: 'two', label: 'Result', layout: 'split', html: 'scenes/two.html', css: 'scenes/two.css', script: 'scenes/two.js',
          narration: 'See the result', cues: [
            { id: 'see', text: 'See the', targets: ['#two-title'], effect: 'fade' },
            { id: 'result', text: 'result', targets: ['#two-result'], effect: 'scale' },
          ],
        },
      ],
    }
    await writeFile(join(root, 'video.project.json'), JSON.stringify(project))

    const loaded = await compileVideoProject(join(root, 'video.project.json'))
    assert.equal(loaded.composition.durationMs, 2000)
    assert.deepEqual(loaded.composition.scenes.map((scene) => [scene.startMs, scene.durationMs]), [[0, 895], [895, 1105]])
    assert.deepEqual(loaded.composition.narration?.cues.map((cue) => [cue.id, cue.startMs, cue.endMs]), [
      ['watch', 100, 470], ['path', 490, 760], ['see', 1030, 1340], ['result', 1360, 1690],
    ])
    assert.match(loaded.composition.assets[0].src, /^data:image\/png;base64,/)
    assert.equal(validateCompositionStatic(loaded.composition).ok, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects narration that is not fully assigned to visual cues', async () => {
  const root = await mkdtemp(join(tmpdir(), 'html-video-project-test-'))
  try {
    await mkdir(join(root, 'scenes'))
    await mkdir(join(root, 'audio'))
    await writeFile(join(root, 'scenes/one.html'), '<div id="one">One</div>')
    await writeFile(join(root, 'audio/voice.wav'), silentWav(500))
    await writeFile(join(root, 'video.project.json'), JSON.stringify({
      kind: 'html-video-project', version: 1, id: 'bad-cues', title: 'Bad cues', width: 640, height: 360, fps: 30,
      voiceover: { audio: 'audio/voice.wav' },
      scenes: [{
        id: 'one', label: 'One', layout: 'centered', html: 'scenes/one.html', narration: 'Every word matters',
        cues: [{ id: 'partial', text: 'Every word', targets: ['#one'], startMs: 0, endMs: 400 }],
      }],
    }))
    await assert.rejects(() => compileVideoProject(join(root, 'video.project.json')), /cue text must cover its narration exactly/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function silentWav(durationMs: number) {
  const sampleRate = 8000
  const sampleCount = Math.round(sampleRate * durationMs / 1000)
  const dataLength = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  return buffer
}
