import { PNG } from 'pngjs'
import { captureSnapshots, inspectCueOwnership } from './browser'
import { validateCompositionStatic } from './validate'
import type { QualityMetric, QualityReport, SceneQualitySummary, SnapshotResult, ValidationFinding, VideoComposition } from './types'

export interface AuditOptions {
  visual?: boolean
  minimumScore?: number
}

export interface AuditResult {
  report: QualityReport
  snapshots: SnapshotResult[]
  contactSheet?: Buffer
  cueContactSheet?: Buffer
  sceneContactSheet?: Buffer
}

export async function auditComposition(composition: VideoComposition, options: AuditOptions = {}): Promise<AuditResult> {
  const minimumScore = options.minimumScore ?? 78
  const validation = validateCompositionStatic(composition)
  const sceneSummaries = composition.scenes.map((scene) => summarizeScene(composition, scene.id))
  const findings: ValidationFinding[] = [...validation.findings]
  const metrics: QualityMetric[] = []

  const syncScore = composition.narration ? (validation.findings.some((finding) => finding.code.startsWith('cue_') || finding.code === 'audio_duration_mismatch') ? 0 : 30) : 30
  metrics.push({
    id: 'narration-sync', score: syncScore, maxScore: 30,
    message: composition.narration ? `${composition.narration.cues.length} spoken cues are mapped to scene-owned visual targets.` : 'Silent video: narration synchronization is not applicable.',
  })
  const captionScore = !composition.narration || composition.captions ? 10 : 0
  metrics.push({
    id: 'caption-sync',
    score: captionScore,
    maxScore: 10,
    message: !composition.narration
      ? 'Silent video: captions are not applicable.'
      : composition.captions
        ? `${composition.captions.groups.length} caption groups derive from ${composition.captions.words.length} exact timed words.`
        : 'Narrated video has no compiled caption track.',
  })
  if (composition.narration && !composition.captions) {
    findings.push({ code: 'missing_caption_track', severity: 'warning', message: 'Narrated final should include captions derived from the canonical word track.', path: 'captions' })
  }

  const distinctLayouts = new Set(composition.scenes.map((scene) => scene.layout).filter(Boolean)).size
  const layoutGoal = Math.min(3, composition.scenes.length)
  const layoutScore = layoutGoal ? Math.round(15 * Math.min(1, distinctLayouts / layoutGoal)) : 0
  metrics.push({ id: 'layout-diversity', score: layoutScore, maxScore: 15, message: `${distinctLayouts} distinct framing patterns across ${composition.scenes.length} scenes.` })
  for (let index = 1; index < composition.scenes.length; index += 1) {
    if (composition.scenes[index].layout && composition.scenes[index].layout === composition.scenes[index - 1].layout) {
      findings.push({ code: 'repeated_adjacent_layout', severity: 'warning', message: `Scenes ${composition.scenes[index - 1].id} and ${composition.scenes[index].id} repeat the ${composition.scenes[index].layout} layout.`, path: 'scenes' })
    }
  }

  const richScenes = sceneSummaries.filter((scene) => scene.svgPrimitiveCount >= 3 || scene.mediaCount >= 1 || scene.domNodes >= 8).length
  const richnessScore = Math.round(20 * richScenes / Math.max(1, sceneSummaries.length))
  metrics.push({ id: 'visual-explanation', score: richnessScore, maxScore: 20, message: `${richScenes}/${sceneSummaries.length} scenes contain a diagram, media, or substantial authored visual structure.` })
  for (const scene of sceneSummaries) {
    if (scene.domNodes < 5 && scene.svgPrimitiveCount === 0 && scene.mediaCount === 0) {
      findings.push({ code: 'slide_like_scene', severity: 'warning', message: `Scene ${scene.id} is mostly text with little explanatory structure.`, path: `scenes.${scene.id}` })
    }
  }

  const cueDensity = composition.narration
    ? sceneSummaries.reduce((sum, scene) => sum + Math.min(1, scene.cueCount / 2), 0) / Math.max(1, sceneSummaries.length)
    : sceneSummaries.reduce((sum, scene) => sum + Math.min(1, scene.scriptBytes / 160), 0) / Math.max(1, sceneSummaries.length)
  const choreographyScore = Math.round(10 * cueDensity)
  metrics.push({ id: 'sequential-choreography', score: choreographyScore, maxScore: 10, message: `${composition.narration ? 'Cue' : 'scene-script'} density indicates whether content develops across each shot.` })

  let snapshots: SnapshotResult[] = []
  let motionScore = 10
  let determinismScore = 5
  if (options.visual !== false && validation.ok) {
    const times = getQualitySampleTimes(composition)
    snapshots = await captureSnapshots(composition, [...times, Math.floor(composition.durationMs * 0.61), Math.floor(composition.durationMs * 0.61)])
    const repeatedA = snapshots.at(-2)
    const repeatedB = snapshots.at(-1)
    determinismScore = repeatedA && repeatedB && repeatedA.png.equals(repeatedB.png) ? 5 : 0
    snapshots = snapshots.slice(0, -2)
    for (const summary of sceneSummaries) {
      const scene = composition.scenes.find((item) => item.id === summary.id)!
      const relevant = snapshots.filter((snapshot) => snapshot.timeMs >= scene.startMs && snapshot.timeMs <= scene.startMs + scene.durationMs)
      summary.visualChange = maxPairDifference(relevant.map((snapshot) => snapshot.png))
    }
    const animatedScenes = sceneSummaries.filter((scene) => (scene.visualChange ?? 0) >= 0.0025).length
    motionScore = Math.round(10 * animatedScenes / Math.max(1, sceneSummaries.length))
    metrics.push({ id: 'visible-development', score: motionScore, maxScore: 10, message: `${animatedScenes}/${sceneSummaries.length} scenes visibly change across their sampled narration cues.` })
    findings.push(...await inspectCueOwnership(composition))
  } else {
    metrics.push({ id: 'visible-development', score: motionScore, maxScore: 10, message: 'Visual sampling skipped; static choreography evidence used.' })
  }
  metrics.push({ id: 'seek-determinism', score: determinismScore, maxScore: 5, message: determinismScore === 5 ? 'Repeated same-time browser captures are pixel-identical.' : 'Repeated same-time captures differ.' })

  const score = metrics.reduce((sum, metric) => sum + metric.score, 0)
  const report: QualityReport = {
    ok: validation.ok && findings.every((finding) => finding.severity !== 'error') && score >= minimumScore,
    score,
    minimumScore,
    metrics,
    findings,
    scenes: sceneSummaries,
    sampledTimesMs: snapshots.map((snapshot) => snapshot.timeMs),
  }
  const cueTimes = new Set((composition.narration?.cues ?? []).map((cue) => Math.round((cue.startMs + cue.endMs) / 2)))
  const sceneTimes = new Set(composition.scenes.flatMap((scene) => [0.12, 0.52, 0.86].map((phase) => Math.round(scene.startMs + scene.durationMs * phase))))
  const cueSnapshots = snapshots.filter((snapshot) => cueTimes.has(snapshot.timeMs))
  const sceneSnapshots = snapshots.filter((snapshot) => sceneTimes.has(snapshot.timeMs))
  return {
    report,
    snapshots,
    contactSheet: snapshots.length ? buildContactSheet(snapshots, composition.width, composition.height) : undefined,
    cueContactSheet: cueSnapshots.length ? buildContactSheet(cueSnapshots, composition.width, composition.height) : undefined,
    sceneContactSheet: sceneSnapshots.length ? buildContactSheet(sceneSnapshots, composition.width, composition.height) : undefined,
  }
}

export function getQualitySampleTimes(composition: VideoComposition) {
  const values = new Set<number>()
  for (const scene of composition.scenes) {
    values.add(Math.round(scene.startMs + scene.durationMs * 0.12))
    values.add(Math.round(scene.startMs + scene.durationMs * 0.52))
    values.add(Math.round(scene.startMs + scene.durationMs * 0.86))
  }
  for (const cue of composition.narration?.cues ?? []) values.add(Math.round((cue.startMs + cue.endMs) / 2))
  return [...values].filter((time) => time >= 0 && time <= composition.durationMs).sort((a, b) => a - b)
}

function summarizeScene(composition: VideoComposition, id: string): SceneQualitySummary {
  const scene = composition.scenes.find((item) => item.id === id)!
  const html = extractMarked(composition.html, `<!-- html-video-scene:start ${id} -->`, `<!-- html-video-scene:end ${id} -->`)
  const script = extractMarked(composition.script, `/* html-video-scene-script:start ${id} */`, `/* html-video-scene-script:end ${id} */`)
  const domNodes = [...html.matchAll(/<(?!\/|!)[a-z][a-z0-9-]*\b/gi)].length
  const svgCount = [...html.matchAll(/<svg\b/gi)].length
  const svgPrimitiveCount = [...html.matchAll(/<(?:path|line|polyline|polygon|circle|ellipse|rect)\b/gi)].length
  const mediaCount = [...html.matchAll(/<(?:img|video|canvas)\b/gi)].length
  return {
    id, label: scene.label, layout: scene.layout,
    cueCount: composition.narration?.cues.filter((cue) => cue.sceneId === id).length ?? 0,
    domNodes, svgCount, svgPrimitiveCount, mediaCount, scriptBytes: Buffer.byteLength(script),
  }
}

function extractMarked(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex < 0) return ''
  return source.slice(startIndex + start.length, endIndex)
}

function maxPairDifference(buffers: Buffer[]) {
  let maximum = 0
  for (let index = 1; index < buffers.length; index += 1) maximum = Math.max(maximum, imageDifference(buffers[index - 1], buffers[index]))
  return Number(maximum.toFixed(5))
}

function imageDifference(a: Buffer, b: Buffer) {
  const first = PNG.sync.read(a)
  const second = PNG.sync.read(b)
  if (first.width !== second.width || first.height !== second.height) return 1
  let difference = 0
  let samples = 0
  for (let index = 0; index < first.data.length; index += 16) {
    difference += Math.abs(first.data[index] - second.data[index])
      + Math.abs(first.data[index + 1] - second.data[index + 1])
      + Math.abs(first.data[index + 2] - second.data[index + 2])
    samples += 3
  }
  return difference / Math.max(1, samples * 255)
}

function buildContactSheet(snapshots: SnapshotResult[], sourceWidth: number, sourceHeight: number) {
  const columns = Math.min(4, snapshots.length)
  const cellWidth = Math.min(480, sourceWidth)
  const cellHeight = Math.round(sourceHeight * cellWidth / sourceWidth)
  const rows = Math.ceil(snapshots.length / columns)
  const gap = 12
  const output = new PNG({ width: columns * cellWidth + (columns + 1) * gap, height: rows * cellHeight + (rows + 1) * gap, colorType: 6 })
  for (let index = 0; index < output.data.length; index += 4) {
    output.data[index] = 18
    output.data[index + 1] = 18
    output.data[index + 2] = 18
    output.data[index + 3] = 255
  }
  snapshots.forEach((snapshot, index) => {
    const source = PNG.sync.read(snapshot.png)
    const column = index % columns
    const row = Math.floor(index / columns)
    const left = gap + column * (cellWidth + gap)
    const top = gap + row * (cellHeight + gap)
    for (let y = 0; y < cellHeight; y += 1) {
      const sy = Math.min(source.height - 1, Math.floor(y * source.height / cellHeight))
      for (let x = 0; x < cellWidth; x += 1) {
        const sx = Math.min(source.width - 1, Math.floor(x * source.width / cellWidth))
        const from = (sy * source.width + sx) * 4
        const to = ((top + y) * output.width + left + x) * 4
        output.data[to] = source.data[from]
        output.data[to + 1] = source.data[from + 1]
        output.data[to + 2] = source.data[from + 2]
        output.data[to + 3] = 255
      }
    }
  })
  return PNG.sync.write(output)
}
