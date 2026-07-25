import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { auditComposition } from './quality'
import { normalizeSourceInput, sourceSnapshotSchema, writeSourceSnapshot } from './course'
import { loadVideoInput } from './project'
import { voiceProfileIdSchema } from './audio'

export const explanationModeSchema = z.enum(['document', 'video', 'document-video'])

export const explanationProjectSchema = z.object({
  kind: z.literal('html-explanation-project'),
  version: z.literal(1),
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  title: z.string().min(1).max(200),
  mode: explanationModeSchema,
  audience: z.string().min(1),
  teachingOutcome: z.string().min(1),
  visibility: z.literal('private'),
  voiceProfile: voiceProfileIdSchema,
  sourceTarget: z.string().min(1),
  sourceFingerprint: z.string().length(64),
  documentPath: z.string().optional(),
  videoProject: z.string().optional(),
  createdAt: z.string().datetime(),
})

export type ExplanationProject = z.infer<typeof explanationProjectSchema>

export async function initExplanationProject(input: {
  source: string
  output: string
  mode: z.infer<typeof explanationModeSchema>
  title?: string
  audience?: string
  teachingOutcome?: string
  voiceProfile?: string
  crawl?: boolean
  maxPages?: number
  maxDepth?: number
  apiKey?: string
}) {
  const root = resolve(input.output)
  const normalized = await normalizeSourceInput(input.source, {
    crawl: input.crawl,
    maxPages: input.maxPages,
    maxDepth: input.maxDepth,
    apiKey: input.apiKey,
  })
  const sourceLabel = input.source.startsWith('topic:')
    ? input.source.slice('topic:'.length)
    : /^https?:\/\//i.test(input.source)
      ? new URL(input.source).hostname
      : basename(resolve(input.source))
  const title = input.title?.trim() || `Understanding ${sourceLabel}`
  const project = explanationProjectSchema.parse({
    kind: 'html-explanation-project',
    version: 1,
    id: identifier(title),
    title,
    mode: input.mode,
    audience: input.audience || 'Learners who need a clear working mental model',
    teachingOutcome: input.teachingOutcome || 'Explain and apply the source’s central mechanism',
    visibility: 'private',
    voiceProfile: input.voiceProfile || 'warm-teacher',
    sourceTarget: input.source,
    sourceFingerprint: normalized.snapshot.fingerprint,
    documentPath: input.mode === 'document' || input.mode === 'document-video' ? 'document.html' : undefined,
    videoProject: input.mode === 'video' || input.mode === 'document-video' ? 'video.project.json' : undefined,
    createdAt: new Date().toISOString(),
  })
  await mkdir(join(root, 'scenes'), { recursive: true })
  await mkdir(join(root, 'audio', 'segments'), { recursive: true })
  await mkdir(join(root, 'quality'), { recursive: true })
  await writeSourceSnapshot(root, normalized)
  const evidenceId = normalized.evidence[0]?.id
    ?? normalized.snapshot.entries[0]?.evidenceId
    ?? 'research_pending'
  const files: Array<Promise<unknown>> = [
    writeFile(join(root, 'explanation.project.json'), `${JSON.stringify(project, null, 2)}\n`),
    writeFile(join(root, 'BRIEF.md'), `# ${title}\n\nAudience: ${project.audience}\n\nTeaching outcome: ${project.teachingOutcome}\n\nReplace this scaffold with an evidence-grounded explanation before publishing.\n`),
    writeFile(join(root, 'design.md'), '# Design direction\n\nChoose one dominant hue, one accent, a specific visual metaphor, and at least three framing systems. Reserve the bottom 17% for captions.\n'),
  ]
  if (project.documentPath) {
    files.push(writeFile(join(root, project.documentPath), documentScaffold(title, evidenceId)))
  }
  if (project.videoProject) {
    files.push(
      writeFile(join(root, project.videoProject), `${JSON.stringify(videoScaffold(project, evidenceId), null, 2)}\n`),
      writeFile(join(root, 'SCRIPT.md'), '# Locked narration\n\nWrite narration for listening, then generate final audio and exact word timings before setting scene boundaries.\n'),
      writeFile(join(root, 'STORYBOARD.md'), '# Storyboard\n\nRecord one teaching job, evidence, narration cues, semantic targets, visual verbs, transition meaning, and settled read per scene.\n'),
      writeFile(join(root, 'scenes', '01-orient.html'), sceneHtml(title)),
      writeFile(join(root, 'scenes', '01-orient.css'), sceneCss()),
      writeFile(join(root, 'scenes', '01-orient.js'), sceneScript()),
    )
  }
  await Promise.all(files)
  return {
    root,
    project,
    sourceFiles: normalized.snapshot.entries.length,
    evidenceRecords: normalized.evidence.length,
    researchRequired: normalized.snapshot.sourceType === 'research',
  }
}

export async function loadExplanationProject(input: string) {
  const absolute = resolve(input)
  const inputStat = await stat(absolute)
  const file = inputStat.isDirectory() ? join(absolute, 'explanation.project.json') : absolute
  return {
    root: dirname(file),
    project: explanationProjectSchema.parse(JSON.parse(await readFile(file, 'utf8'))),
  }
}

export async function buildExplanation(input: string) {
  const { root, project } = await loadExplanationProject(input)
  let compositionPath: string | undefined
  if (project.documentPath) {
    const document = await readFile(join(root, project.documentPath), 'utf8')
    if (!/<(?:main|article)\b/i.test(document)) {
      throw new Error('The explanation document needs a semantic <main> or <article> root.')
    }
  }
  if (project.videoProject) {
    const loaded = await loadVideoInput(join(root, project.videoProject))
    compositionPath = join(root, 'composition.json')
    await writeFile(compositionPath, `${JSON.stringify(loaded.composition, null, 2)}\n`)
  }
  const manifest = {
    version: 1,
    projectId: project.id,
    mode: project.mode,
    privatePreview: true,
    sourceFingerprint: project.sourceFingerprint,
    documentPath: project.documentPath,
    compositionPath: compositionPath ? 'composition.json' : undefined,
  }
  const manifestPath = join(root, 'publish-manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { project, manifest, manifestPath }
}

export async function auditExplanation(input: string, minimumScore = 78) {
  const { root, project } = await loadExplanationProject(input)
  const findings: Array<{ severity: 'error' | 'warning'; message: string }> = []
  if (project.documentPath) {
    const html = await readFile(join(root, project.documentPath), 'utf8')
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) findings.push({ severity: 'error', message: 'Document is missing a responsive viewport.' })
    if (!/<(?:svg|figure|img|video|canvas)\b/i.test(html)) findings.push({ severity: 'warning', message: 'Document has no explanatory visual.' })
    if (/https?:\/\//i.test(html.replace(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi, ''))) findings.push({ severity: 'warning', message: 'Document appears to load a remote runtime asset.' })
  }
  let video: { ok: boolean; score: number } | undefined
  if (project.videoProject) {
    const loaded = await loadVideoInput(join(root, project.videoProject))
    const result = await auditComposition(loaded.composition, { minimumScore })
    await mkdir(join(root, 'quality'), { recursive: true })
    await writeFile(join(root, 'quality', 'report.json'), `${JSON.stringify(result.report, null, 2)}\n`)
    if (result.contactSheet) await writeFile(join(root, 'quality', 'contact-sheet.png'), result.contactSheet)
    if (result.cueContactSheet) await writeFile(join(root, 'quality', 'cue-contact-sheet.png'), result.cueContactSheet)
    if (result.sceneContactSheet) await writeFile(join(root, 'quality', 'scene-contact-sheet.png'), result.sceneContactSheet)
    video = { ok: result.report.ok, score: result.report.score }
  }
  return {
    ok: findings.every((finding) => finding.severity !== 'error') && (video?.ok ?? true),
    findings,
    video,
  }
}

export async function diffExplanationSource(input: string) {
  const { root, project } = await loadExplanationProject(input)
  const previous = sourceSnapshotSchema.parse(JSON.parse(await readFile(join(root, 'source', 'manifest.json'), 'utf8')))
  const normalized = await normalizeSourceInput(project.sourceTarget)
  return {
    fingerprintChanged: previous.fingerprint !== normalized.snapshot.fingerprint,
    previousFingerprint: previous.fingerprint,
    nextFingerprint: normalized.snapshot.fingerprint,
    snapshot: normalized,
  }
}

function videoScaffold(project: ExplanationProject, evidenceId: string) {
  return {
    kind: 'html-video-project',
    version: 2,
    id: `${project.id}-video`,
    title: project.title,
    width: 1280,
    height: 720,
    fps: 30,
    variables: [],
    assets: [],
    captions: { defaultOn: true, minWords: 2, maxWords: 6, pauseMs: 360 },
    source: { evidenceIds: [evidenceId], sourceHash: project.sourceFingerprint },
    manualOverrides: [],
    scenes: [{
      id: 'orient',
      label: 'Orient the central mechanism',
      teachingJob: project.teachingOutcome,
      evidenceIds: [evidenceId],
      layout: 'diagram',
      html: 'scenes/01-orient.html',
      css: 'scenes/01-orient.css',
      script: 'scenes/01-orient.js',
      durationMs: 8_000,
      cues: [],
      transition: 'cut',
    }],
  }
}

function documentScaffold(title: string, evidenceId: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{margin:0;background:#f2f0e7;color:#171815;font:18px/1.6 ui-sans-serif,system-ui}main{max-width:1080px;margin:auto;padding:8vw 5vw}h1{max-width:12ch;font:700 clamp(52px,9vw,112px)/.9 Georgia,serif;letter-spacing:-.06em}.model{margin-top:64px;padding:36px;border:1px solid #171815;background:#d8ff45}.source{font:700 12px ui-monospace,monospace;letter-spacing:.12em}</style></head>
<body><main><p class="source">PRIVATE EXPLANATION · ${escapeHtml(evidenceId)}</p><h1>${escapeHtml(title)}</h1><figure class="model"><strong>Replace this scaffold with the source-specific mental model.</strong></figure></main></body></html>
`
}

function sceneHtml(title: string) {
  return `<main class="stage"><p class="eyebrow">BUILD THE MENTAL MODEL</p><h1 data-html-video-id="thesis">${escapeHtml(title)}</h1><div class="mechanism" data-html-video-id="mechanism"><span>Source</span><i>becomes</i><span>Understanding</span></div><p class="note">Replace this scaffold with a source-specific explanatory visual.</p></main>`
}

function sceneCss() {
  return `.stage{position:absolute;inset:0;display:grid;align-content:center;gap:28px;padding:76px;background:#f2f0e7;color:#171815;font-family:ui-sans-serif,system-ui}.eyebrow{margin:0;color:#58724d;font:800 14px ui-monospace,monospace;letter-spacing:.18em}.stage h1{max-width:980px;margin:0;font:700 70px/.94 Georgia,serif;letter-spacing:-.055em}.mechanism{display:flex;align-items:center;gap:18px}.mechanism span{padding:17px 22px;border:1px solid #171815;background:#fffdf4;font:700 23px Georgia,serif}.mechanism i{font:700 13px ui-monospace,monospace;color:#58724d}.note{margin:0;color:#66675f}`
}

function sceneScript() {
  return `var thesis=root.querySelector('[data-html-video-id="thesis"]');var mechanism=root.querySelector('[data-html-video-id="mechanism"]');var a=h.phase(progress,0,.42),b=h.phase(progress,.28,.82);thesis.style.opacity=String(a);thesis.style.transform='translate3d(0,'+h.lerp(24,0,h.ease.outCubic(a))+'px,0)';mechanism.style.opacity=String(b);mechanism.style.transform='translate3d('+h.lerp(36,0,h.ease.outCubic(b))+'px,0,0)';`
}

function identifier(value: string) {
  const safe = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'explanation'
  return /^[a-z]/.test(safe) ? safe : `explanation-${safe}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
