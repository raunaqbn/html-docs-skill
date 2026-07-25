import { videoCompositionSchema, type ValidationFinding, type ValidationReport, type VideoComposition } from './types'

const FORBIDDEN_SCRIPT_PATTERNS: Array<[RegExp, string, string]> = [
  [/\bDate\s*\.\s*now\s*\(/, 'wall_clock', 'Date.now() makes frames depend on the wall clock.'],
  [/\bperformance\s*\.\s*now\s*\(/, 'wall_clock', 'performance.now() makes frames depend on the wall clock.'],
  [/\bMath\s*\.\s*random\s*\(/, 'unseeded_random', 'Use HtmlVideoRuntime.seededRandom() instead of Math.random().'],
  [/\brequestAnimationFrame\s*\(/, 'self_playing_animation', 'Rendering is seek-driven; requestAnimationFrame() is not allowed.'],
  [/\bset(?:Timeout|Interval)\s*\(/, 'timer', 'Timers are not deterministic during frame capture.'],
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, 'network', 'Runtime network access is not allowed.'],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, 'storage', 'Composition storage access is not allowed.'],
  [/(?:\bwindow\s*\.\s*(?:parent|top|opener)\b|(?<![.\w])(?:parent|top|opener)\b)/, 'parent_access', 'Composition code cannot access a parent or opener window.'],
  [/\b(?:eval|Function)\s*\(/, 'dynamic_code', 'Dynamic code evaluation is not allowed.'],
  [/\b(?:Worker|SharedWorker)\s*\(/, 'worker', 'Worker processes are not allowed in compositions.'],
  [/\bimport\s*\(/, 'dynamic_import', 'Dynamic imports are not allowed.'],
]

const REMOTE_URL = /(?:https?:)?\/\//i

export function validateCompositionStatic(input: unknown): ValidationReport {
  const findings: ValidationFinding[] = []
  const parsed = videoCompositionSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({
        code: 'schema',
        severity: 'error',
        path: issue.path.join('.'),
        message: issue.message,
      })
    }
    return { ok: false, findings, sampledTimesMs: [] }
  }

  const composition = parsed.data
  validateIds(composition, findings)
  validateScenes(composition, findings)
  validateSources(composition, findings)
  validateScript(composition, findings)
  validateNarration(composition, findings)
  validateCaptions(composition, findings)
  validateAuthoringMetadata(composition, findings)

  if (!/window\s*\.\s*__HTML_VIDEO__\s*=/.test(composition.script)) {
    findings.push({
      code: 'missing_runtime_registration',
      severity: 'error',
      message: 'Script must assign window.__HTML_VIDEO__ with a renderFrame(context) function.',
      path: 'script',
    })
  }
  if (!/\brenderFrame\s*[:(]/.test(composition.script)) {
    findings.push({
      code: 'missing_render_frame',
      severity: 'error',
      message: 'Composition does not define renderFrame(context).',
      path: 'script',
    })
  }

  return {
    ok: findings.every((finding) => finding.severity !== 'error'),
    findings,
    sampledTimesMs: getSampleTimes(composition),
  }
}

export function getSampleTimes(composition: VideoComposition): number[] {
  const values = new Set<number>([0, Math.max(0, composition.durationMs - Math.round(1000 / composition.fps))])
  for (const scene of composition.scenes) {
    values.add(scene.startMs)
    values.add(Math.min(composition.durationMs, scene.startMs + Math.floor(scene.durationMs / 2)))
    values.add(Math.min(composition.durationMs, scene.startMs + scene.durationMs))
  }
  return [...values].filter((value) => value >= 0 && value <= composition.durationMs).sort((a, b) => a - b)
}

function validateIds(composition: VideoComposition, findings: ValidationFinding[]) {
  for (const [label, ids] of [
    ['scene', composition.scenes.map((scene) => scene.id)],
    ['asset', composition.assets.map((asset) => asset.id)],
    ['variable', composition.variables.map((variable) => variable.id)],
  ] as const) {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    for (const id of new Set(duplicates)) {
      findings.push({ code: 'duplicate_id', severity: 'error', message: `Duplicate ${label} id: ${id}.`, path: `${label}s` })
    }
  }
  const domIds = [...composition.html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])
  for (const id of new Set(domIds.filter((value, index) => domIds.indexOf(value) !== index))) {
    findings.push({ code: 'duplicate_dom_id', severity: 'error', message: `Duplicate DOM id: ${id}. Cue ownership requires IDs to be unique across the video.`, path: 'html' })
  }
  const semanticIds = [...composition.html.matchAll(/\bdata-html-video-id\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])
  for (const id of new Set(semanticIds.filter((value, index) => semanticIds.indexOf(value) !== index))) {
    findings.push({ code: 'duplicate_semantic_id', severity: 'error', message: `Duplicate data-html-video-id: ${id}. Studio selections and overrides require stable IDs to be unique.`, path: 'html' })
  }
}

function validateScenes(composition: VideoComposition, findings: ValidationFinding[]) {
  for (const scene of composition.scenes) {
    if (scene.startMs + scene.durationMs > composition.durationMs) {
      findings.push({
        code: 'scene_out_of_bounds',
        severity: 'error',
        message: `Scene ${scene.id} ends after the composition duration.`,
        path: `scenes.${scene.id}`,
      })
    }
  }
  const tracks = new Map<number, typeof composition.scenes>()
  for (const scene of composition.scenes) tracks.set(scene.track, [...(tracks.get(scene.track) ?? []), scene])
  for (const [track, scenes] of tracks) {
    const sorted = [...scenes].sort((a, b) => a.startMs - b.startMs)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (current.startMs < previous.startMs + previous.durationMs) {
        findings.push({
          code: 'scene_overlap',
          severity: 'error',
          message: `Scenes ${previous.id} and ${current.id} overlap on track ${track}.`,
          path: 'scenes',
        })
      }
    }
  }
}

function validateSources(composition: VideoComposition, findings: ValidationFinding[]) {
  if (REMOTE_URL.test(composition.html) || REMOTE_URL.test(composition.css)) {
    findings.push({ code: 'remote_url', severity: 'error', message: 'Remote URLs are not allowed in composition HTML or CSS.' })
  }
  if (/<(?:script|style|iframe|object|embed|form|base|link|audio|video)\b/i.test(composition.html)) {
    findings.push({
      code: 'forbidden_html_element',
      severity: 'error',
      message: 'Composition HTML contains an element that is unsafe or not seek-controlled by the runtime.',
      path: 'html',
    })
  }
  if (/\son[a-z]+\s*=/i.test(composition.html) || /javascript\s*:/i.test(composition.html)) {
    findings.push({
      code: 'inline_html_script',
      severity: 'error',
      message: 'Composition HTML cannot contain event-handler attributes or javascript: URLs.',
      path: 'html',
    })
  }
  if (/<\s*\/\s*style\b/i.test(composition.css)) {
    findings.push({ code: 'style_breakout', severity: 'error', message: 'Composition CSS cannot close the runtime style element.', path: 'css' })
  }
  if (/@keyframes\b/i.test(composition.css) || /\b(?:animation|transition)(?:-[a-z-]+)?\s*:/i.test(composition.css)) {
    findings.push({
      code: 'self_playing_css',
      severity: 'error',
      message: 'Render-critical motion must be derived from timeMs, not CSS animations or transitions.',
      path: 'css',
    })
  }
  if (/<\s*\/\s*script\b/i.test(composition.script)) {
    findings.push({ code: 'script_breakout', severity: 'error', message: 'Composition script cannot close the runtime script element.', path: 'script' })
  }
  for (const asset of composition.assets) {
    if (!/^(?:data:|blob:|asset:)/i.test(asset.src)) {
      findings.push({
        code: 'undeclared_asset_protocol',
        severity: 'error',
        message: `Asset ${asset.id} must use data:, blob:, or asset: storage references.`,
        path: `assets.${asset.id}.src`,
      })
    }
  }
  const declared = new Set(composition.assets.map((asset) => asset.id))
  for (const match of `${composition.html}\n${composition.css}`.matchAll(/asset:([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
    if (!declared.has(match[1])) {
      findings.push({ code: 'undeclared_asset', severity: 'error', message: `Asset reference ${match[0]} is not declared.`, path: 'assets' })
    }
  }
}

function validateScript(composition: VideoComposition, findings: ValidationFinding[]) {
  for (const [pattern, code, message] of FORBIDDEN_SCRIPT_PATTERNS) {
    if (pattern.test(composition.script)) findings.push({ code, severity: 'error', message, path: 'script' })
  }
}

function validateNarration(composition: VideoComposition, findings: ValidationFinding[]) {
  const narration = composition.narration
  if (!narration) return
  const scenes = new Map(composition.scenes.map((scene) => [scene.id, scene]))
  const domIds = new Set([...composition.html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]))
  const semanticIds = new Set([...composition.html.matchAll(/\bdata-html-video-id\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]))
  const sorted = [...narration.cues].sort((a, b) => a.startMs - b.startMs)
  const cueIds = narration.cues.map((cue) => cue.id)
  for (const id of new Set(cueIds.filter((value, index) => cueIds.indexOf(value) !== index))) {
    findings.push({ code: 'duplicate_cue_id', severity: 'error', message: `Duplicate narration cue id: ${id}.`, path: 'narration.cues' })
  }
  for (let index = 0; index < sorted.length; index += 1) {
    const cue = sorted[index]
    const scene = scenes.get(cue.sceneId)
    if (!scene) {
      findings.push({ code: 'cue_scene_missing', severity: 'error', message: `Cue ${cue.id} belongs to missing scene ${cue.sceneId}.`, path: `narration.cues.${cue.id}` })
      continue
    }
    const sceneEnd = scene.startMs + scene.durationMs
    if (cue.startMs < scene.startMs || cue.endMs > sceneEnd || cue.endMs <= cue.startMs) {
      findings.push({
        code: 'cue_outside_scene', severity: 'error',
        message: `Cue ${cue.id} (${cue.startMs}–${cue.endMs}ms) must be fully inside scene ${scene.id} (${scene.startMs}–${sceneEnd}ms).`,
        path: `narration.cues.${cue.id}`,
      })
    }
    if (index > 0 && cue.startMs < sorted[index - 1].endMs) {
      findings.push({ code: 'cue_overlap', severity: 'error', message: `Narration cues ${sorted[index - 1].id} and ${cue.id} overlap. Each spoken word must own one visual cue.`, path: 'narration.cues' })
    }
    for (const target of cue.targets) {
      const domId = target.match(/^#([a-zA-Z][a-zA-Z0-9_-]*)$/)?.[1]
      const semanticId = target.match(/^\[data-html-video-id="([a-zA-Z][a-zA-Z0-9_-]*)"\]$/)?.[1]
      if ((!domId || !domIds.has(domId)) && (!semanticId || !semanticIds.has(semanticId))) {
        findings.push({ code: 'cue_target_missing', severity: 'error', message: `Cue ${cue.id} targets ${target}, but that unique element ID is missing.`, path: `narration.cues.${cue.id}.targets` })
      }
    }
  }
  if (normalizeWords(narration.transcript) !== normalizeWords(narration.cues.map((cue) => cue.text).join(' '))) {
    findings.push({
      code: 'cue_transcript_mismatch', severity: 'error',
      message: 'Narration cue text must cover the transcript exactly and in order. No spoken phrase may be visually unassigned.',
      path: 'narration',
    })
  }
  if (narration.audioDurationMs && narration.audioDurationMs !== composition.durationMs) {
    findings.push({ code: 'audio_duration_mismatch', severity: 'error', message: 'Composition duration must equal the measured voiceover duration.', path: 'durationMs' })
  }
  for (const scene of composition.scenes) {
    if (!narration.cues.some((cue) => cue.sceneId === scene.id)) {
      findings.push({ code: 'scene_without_narration_cue', severity: 'error', message: `Narrated scene ${scene.id} has no narration cue.`, path: `scenes.${scene.id}` })
    }
  }
}

function validateCaptions(composition: VideoComposition, findings: ValidationFinding[]) {
  const track = composition.captions
  if (!track) return
  if (!composition.narration) {
    findings.push({ code: 'captions_without_narration', severity: 'error', message: 'Caption tracks require a canonical narration track.', path: 'captions' })
    return
  }
  const words = track.words
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    if (word.index !== index) {
      findings.push({ code: 'caption_word_index', severity: 'error', message: `Caption word ${index} has a non-canonical index.`, path: `captions.words.${index}` })
    }
    if (index > 0 && word.startMs < words[index - 1].startMs) {
      findings.push({ code: 'caption_word_order', severity: 'error', message: 'Caption word timings must be chronological.', path: 'captions.words' })
    }
  }
  let expectedStart = 0
  for (const group of track.groups) {
    if (group.wordStart !== expectedStart || group.wordEnd < group.wordStart || group.wordEnd >= words.length) {
      findings.push({ code: 'caption_group_coverage', severity: 'error', message: `Caption group ${group.id} does not continue exact word coverage.`, path: `captions.groups.${group.id}` })
      continue
    }
    const slice = words.slice(group.wordStart, group.wordEnd + 1)
    if (normalizeWords(group.text) !== normalizeWords(slice.map((word) => word.text).join(' '))) {
      findings.push({ code: 'caption_group_text', severity: 'error', message: `Caption group ${group.id} text differs from its owned word range.`, path: `captions.groups.${group.id}` })
    }
    if (group.startMs !== slice[0]?.startMs || group.endMs !== slice.at(-1)?.endMs) {
      findings.push({ code: 'caption_group_timing', severity: 'error', message: `Caption group ${group.id} must derive timing from its first and last word.`, path: `captions.groups.${group.id}` })
    }
    expectedStart = group.wordEnd + 1
  }
  if (expectedStart !== words.length) {
    findings.push({ code: 'caption_uncovered_words', severity: 'error', message: `Caption groups cover ${expectedStart} of ${words.length} words.`, path: 'captions.groups' })
  }
}

function validateAuthoringMetadata(composition: VideoComposition, findings: ValidationFinding[]) {
  if ((composition.authoring?.projectVersion ?? 1) < 2) return
  const evidence = new Set(composition.authoring?.evidenceIds ?? [])
  for (const scene of composition.scenes) {
    if (!scene.teachingJob) {
      findings.push({ code: 'scene_teaching_job_missing', severity: 'error', message: `V2 scene ${scene.id} needs one explicit teaching job.`, path: `scenes.${scene.id}.teachingJob` })
    }
    if (!scene.evidenceIds?.length) {
      findings.push({ code: 'scene_evidence_missing', severity: 'error', message: `V2 scene ${scene.id} needs source evidence IDs.`, path: `scenes.${scene.id}.evidenceIds` })
    }
    for (const id of scene.evidenceIds ?? []) {
      if (!evidence.has(id)) {
        findings.push({ code: 'scene_evidence_unknown', severity: 'error', message: `Scene ${scene.id} cites unknown evidence ${id}.`, path: `scenes.${scene.id}.evidenceIds` })
      }
    }
  }
  for (const cue of composition.narration?.cues ?? []) {
    if (!cue.visualVerb || !cue.settledState) {
      findings.push({ code: 'cue_direction_missing', severity: 'error', message: `V2 cue ${cue.id} needs a visual verb and settled state.`, path: `narration.cues.${cue.id}` })
    }
  }
}

function normalizeWords(value: string) {
  return (value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map((word) => word.toLocaleLowerCase('en-US').replace(/’/g, "'")).join(' ')
}
