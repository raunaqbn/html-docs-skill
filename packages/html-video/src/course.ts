import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { auditComposition } from './quality'
import { compileVideoProject } from './project'
import { voiceProfileIdSchema } from './audio'

const safeId = z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)

export const sourceManifestEntrySchema = z.object({
  evidenceId: z.string().min(1),
  uri: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(['text', 'html', 'markdown', 'code', 'pdf', 'binary']),
  sha256: z.string().length(64),
  bytes: z.number().int().min(0),
  lineCount: z.number().int().min(0).optional(),
  title: z.string().optional(),
})

export const sourceSnapshotSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  sourceType: z.enum(['html-docs', 'url', 'research', 'pdf', 'document', 'text', 'directory', 'codebase']),
  sourceUri: z.string().min(1),
  createdAt: z.string().datetime(),
  gitCommit: z.string().optional(),
  privacy: z.object({
    uploadMode: z.enum(['used-excerpts', 'full-source']).default('used-excerpts'),
    safeToExposePaths: z.boolean().default(false),
  }),
  entries: z.array(sourceManifestEntrySchema),
  fingerprint: z.string().length(64),
})

export const knowledgeCheckSchema = z.object({
  id: safeId,
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answer: z.number().int().min(0),
  explanation: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
})

export const courseLessonSchema = z.object({
  id: safeId,
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  objectives: z.array(z.string().min(1)).min(1).max(8),
  prerequisites: z.array(safeId).default([]),
  evidenceIds: z.array(z.string().min(1)).min(1),
  sourceDependencies: z.array(z.string().min(1)).min(1),
  page: z.string().min(1),
  videoProject: z.string().min(1),
  documentId: z.string().uuid().optional(),
  compositionId: z.string().uuid().optional(),
  durationTargetMinutes: z.number().min(1).max(20).default(7),
  checks: z.array(knowledgeCheckSchema).min(2).max(4),
  status: z.enum(['planned', 'authored', 'built', 'stale', 'conflicted']).default('planned'),
})

export const courseModuleSchema = z.object({
  id: safeId,
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  lessons: z.array(courseLessonSchema).min(1),
})

export const courseProjectSchema = z.object({
  kind: z.literal('html-course-project'),
  version: z.literal(1),
  id: safeId,
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  audience: z.string().min(1),
  depth: z.enum(['introductory', 'intermediate', 'advanced']),
  learningOutcomes: z.array(z.string().min(1)).min(1).max(12),
  visibility: z.enum(['private', 'unlisted', 'public']).default('private'),
  voiceProfile: voiceProfileIdSchema.default('warm-teacher'),
  designPath: z.string().min(1).default('design.md'),
  source: z.object({
    manifestPath: z.string().min(1).default('source/manifest.json'),
    evidencePath: z.string().min(1).default('source/evidence.jsonl'),
    fingerprintsPath: z.string().min(1).default('source/fingerprints.json'),
  }),
  website: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    trailerCompositionId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
  }),
  modules: z.array(courseModuleSchema).min(1),
  generation: z.object({
    createdAt: z.string().datetime(),
    sourceFingerprint: z.string().length(64),
    privatePreviewOnly: z.literal(true),
  }),
})

export type CourseProject = z.infer<typeof courseProjectSchema>
export type CourseLesson = z.infer<typeof courseLessonSchema>
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>

export interface EvidenceRecord {
  id: string
  sourceEvidenceId: string
  uri: string
  heading?: string
  lineStart?: number
  lineEnd?: number
  text: string
  sha256: string
}

const ALWAYS_EXCLUDED = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.cache',
  '.env',
  '.env.local',
  '.env.production',
])

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.mdx', '.html', '.htm', '.css', '.scss', '.json', '.jsonl',
  '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv', '.js', '.jsx', '.mjs',
  '.cjs', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sql', '.sh', '.zsh', '.fish',
  '.vue', '.svelte', '.astro',
])

export async function normalizeLocalSource(
  sourcePath: string,
  options: { safeToExposePaths?: boolean; uploadMode?: 'used-excerpts' | 'full-source' } = {},
): Promise<{ snapshot: SourceSnapshot; evidence: EvidenceRecord[]; fingerprints: Record<string, string> }> {
  const absolute = resolve(sourcePath)
  const sourceStat = await stat(absolute)
  const root = sourceStat.isDirectory() ? absolute : dirname(absolute)
  const files = sourceStat.isDirectory() ? await listSourceFiles(root) : [absolute]
  const gitCommit = await gitOutput(root, ['rev-parse', 'HEAD']).catch(() => undefined)
  const entries: z.infer<typeof sourceManifestEntrySchema>[] = []
  const evidence: EvidenceRecord[] = []
  const fingerprints: Record<string, string> = {}

  for (const file of files) {
    const fileStat = await stat(file)
    if (!fileStat.isFile() || fileStat.size > 5_000_000) continue
    const rel = relative(root, file).split(sep).join('/')
    if (isSensitivePath(rel)) continue
    const bytes = await readFile(file)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const extension = extname(file).toLowerCase()
    const kind = classifySource(file, extension)
    const evidenceId = `src_${sha256.slice(0, 16)}`
    fingerprints[rel] = sha256
    let text: string | undefined
    if (kind === 'pdf') {
      text = await extractPdfText(file).catch(() => undefined)
    } else if (kind !== 'binary') {
      text = bytes.toString('utf8')
      if (text.includes('\u0000')) text = undefined
    }
    entries.push({
      evidenceId,
      uri: `local:${rel}`,
      path: rel,
      kind: text == null && kind !== 'pdf' ? 'binary' : kind,
      sha256,
      bytes: bytes.length,
      lineCount: text?.split(/\r?\n/).length,
      title: inferTitle(text, basename(file)),
    })
    if (text) evidence.push(...chunkEvidence(evidenceId, rel, text))
  }

  entries.sort((a, b) => a.path.localeCompare(b.path))
  const fingerprint = createHash('sha256')
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n'))
    .digest('hex')
  const sourceType = gitCommit ? 'codebase' : sourceStat.isDirectory() ? 'directory' : extname(absolute).toLowerCase() === '.pdf' ? 'pdf' : 'document'
  const snapshot = sourceSnapshotSchema.parse({
    version: 1,
    id: randomUUID(),
    sourceType,
    sourceUri: `local:${absolute}`,
    createdAt: new Date().toISOString(),
    gitCommit: gitCommit || undefined,
    privacy: {
      uploadMode: options.uploadMode ?? 'used-excerpts',
      safeToExposePaths: options.safeToExposePaths ?? false,
    },
    entries,
    fingerprint,
  })
  return { snapshot, evidence, fingerprints }
}

export async function normalizeSourceInput(
  input: string,
  options: {
    safeToExposePaths?: boolean
    uploadMode?: 'used-excerpts' | 'full-source'
    apiKey?: string
    crawl?: boolean
    maxPages?: number
    maxDepth?: number
  } = {},
): Promise<{ snapshot: SourceSnapshot; evidence: EvidenceRecord[]; fingerprints: Record<string, string> }> {
  if (input.startsWith('topic:')) {
    const topic = input.slice('topic:'.length).trim()
    if (!topic) throw new Error('Research topics cannot be empty.')
    const fingerprint = createHash('sha256').update(`research-topic:${topic}`).digest('hex')
    return {
      snapshot: sourceSnapshotSchema.parse({
        version: 1,
        id: randomUUID(),
        sourceType: 'research',
        sourceUri: `topic:${topic}`,
        createdAt: new Date().toISOString(),
        privacy: {
          uploadMode: options.uploadMode ?? 'used-excerpts',
          safeToExposePaths: true,
        },
        entries: [],
        fingerprint,
      }),
      evidence: [],
      fingerprints: {},
    }
  }
  if (!/^https?:\/\//i.test(input)) return normalizeLocalSource(input, options)
  if (options.crawl) {
    return normalizeWebsiteSource(input, options)
  }
  const url = new URL(input)
  const htmlDocsDocumentId = /(?:^|\/)(?:documents|d)\/([0-9a-f-]{36})(?:\/|$)/i.exec(url.pathname)?.[1]
  const requestUrl = htmlDocsDocumentId
    ? `${url.origin}/api/v1/docs/${htmlDocsDocumentId}`
    : url.toString()
  const response = await fetch(requestUrl, {
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
  })
  if (!response.ok) throw new Error(`Could not read source URL (${response.status} ${response.statusText}).`)
  const contentType = response.headers.get('content-type') ?? ''
  const raw = await response.text()
  let title = url.hostname
  let text = raw
  if (/json/i.test(contentType)) {
    const value = JSON.parse(raw) as Record<string, unknown>
    title = typeof value.title === 'string' ? value.title : title
    text = typeof value.html_content === 'string'
      ? htmlToText(value.html_content)
      : typeof value.content === 'string'
        ? value.content
        : raw
  } else if (/html/i.test(contentType) || /<html|<body|<article/i.test(raw)) {
    title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() || title
    text = htmlToText(raw)
  }
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const evidenceId = `src_${sha256.slice(0, 16)}`
  const entry = sourceManifestEntrySchema.parse({
    evidenceId,
    uri: url.toString(),
    path: url.toString(),
    kind: /html/i.test(contentType) ? 'html' : 'text',
    sha256,
    bytes: Buffer.byteLength(raw),
    lineCount: text.split(/\r?\n/).length,
    title,
  })
  const evidence = chunkEvidence(evidenceId, url.toString(), text).map((record) => ({
    ...record,
    uri: record.uri.replace(/^local:/, ''),
  }))
  const snapshot = sourceSnapshotSchema.parse({
    version: 1,
    id: randomUUID(),
    sourceType: htmlDocsDocumentId ? 'html-docs' : 'url',
    sourceUri: url.toString(),
    createdAt: new Date().toISOString(),
    privacy: {
      uploadMode: options.uploadMode ?? 'used-excerpts',
      safeToExposePaths: true,
    },
    entries: [entry],
    fingerprint: sha256,
  })
  return { snapshot, evidence, fingerprints: { [url.toString()]: sha256 } }
}

async function normalizeWebsiteSource(
  input: string,
  options: {
    uploadMode?: 'used-excerpts' | 'full-source'
    apiKey?: string
    maxPages?: number
    maxDepth?: number
  },
): Promise<{ snapshot: SourceSnapshot; evidence: EvidenceRecord[]; fingerprints: Record<string, string> }> {
  const start = new URL(input)
  const maxPages = Math.max(1, Math.min(100, options.maxPages ?? 100))
  const maxDepth = Math.max(0, Math.min(5, options.maxDepth ?? 2))
  const queue: Array<{ url: URL; depth: number }> = [{ url: canonicalWebUrl(start), depth: 0 }]
  const seen = new Set<string>()
  const entries: z.infer<typeof sourceManifestEntrySchema>[] = []
  const evidence: EvidenceRecord[] = []
  const fingerprints: Record<string, string> = {}
  while (queue.length && entries.length < maxPages) {
    const next = queue.shift()!
    const key = next.url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const response = await fetch(key, {
      headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : undefined,
      redirect: 'follow',
    })
    if (!response.ok) continue
    const contentType = response.headers.get('content-type') ?? ''
    if (!/html|text\/plain|markdown/i.test(contentType)) continue
    const raw = await response.text()
    if (Buffer.byteLength(raw) > 5_000_000) continue
    const text = /html/i.test(contentType) ? htmlToText(raw) : raw
    const sha256 = createHash('sha256').update(raw).digest('hex')
    const evidenceId = `src_${sha256.slice(0, 16)}`
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
      || next.url.pathname.split('/').filter(Boolean).at(-1)
      || next.url.hostname
    entries.push(sourceManifestEntrySchema.parse({
      evidenceId,
      uri: key,
      path: key,
      kind: /html/i.test(contentType) ? 'html' : 'text',
      sha256,
      bytes: Buffer.byteLength(raw),
      lineCount: text.split(/\r?\n/).length,
      title,
    }))
    evidence.push(...chunkEvidence(evidenceId, key, text).map((record) => ({
      ...record,
      uri: record.uri.replace(/^local:/, ''),
    })))
    fingerprints[key] = sha256
    if (next.depth >= maxDepth || !/html/i.test(contentType)) continue
    for (const href of extractSameOriginLinks(raw, next.url, start.origin)) {
      if (!seen.has(href.toString())) queue.push({ url: href, depth: next.depth + 1 })
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path))
  const fingerprint = createHash('sha256')
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n'))
    .digest('hex')
  return {
    snapshot: sourceSnapshotSchema.parse({
      version: 1,
      id: randomUUID(),
      sourceType: 'url',
      sourceUri: canonicalWebUrl(start).toString(),
      createdAt: new Date().toISOString(),
      privacy: {
        uploadMode: options.uploadMode ?? 'used-excerpts',
        safeToExposePaths: true,
      },
      entries,
      fingerprint,
    }),
    evidence,
    fingerprints,
  }
}

export async function writeSourceSnapshot(
  courseRoot: string,
  normalized: Awaited<ReturnType<typeof normalizeLocalSource>>,
): Promise<void> {
  const sourceDir = join(resolve(courseRoot), 'source')
  await mkdir(sourceDir, { recursive: true })
  await Promise.all([
    writeFile(join(sourceDir, 'manifest.json'), `${JSON.stringify(normalized.snapshot, null, 2)}\n`),
    writeFile(join(sourceDir, 'fingerprints.json'), `${JSON.stringify(normalized.fingerprints, null, 2)}\n`),
    writeFile(join(sourceDir, 'evidence.jsonl'), `${normalized.evidence.map((record) => JSON.stringify(record)).join('\n')}\n`),
  ])
}

export async function loadCourseProject(input: string): Promise<{ root: string; project: CourseProject }> {
  const absolute = resolve(input)
  const inputStat = await stat(absolute)
  const file = inputStat.isDirectory() ? join(absolute, 'course.project.json') : absolute
  return {
    root: dirname(file),
    project: courseProjectSchema.parse(JSON.parse(await readFile(file, 'utf8'))),
  }
}

export async function buildCourse(input: string): Promise<{
  course: CourseProject
  lessons: Array<{ id: string; compositionPath: string; durationMs: number; captions: number }>
  manifestPath: string
}> {
  const { root, project } = await loadCourseProject(input)
  const built: Array<{ id: string; compositionPath: string; durationMs: number; captions: number }> = []
  for (const lesson of allLessons(project)) {
    const projectPath = safeResolve(root, lesson.videoProject)
    const loaded = await compileVideoProject(projectPath)
    const lessonRoot = dirname(projectPath)
    const compositionPath = join(lessonRoot, 'composition.json')
    await writeFile(compositionPath, `${JSON.stringify(loaded.composition, null, 2)}\n`)
    if (loaded.composition.captions?.webVtt) {
      await writeFile(join(lessonRoot, 'audio', 'captions.vtt'), loaded.composition.captions.webVtt)
    }
    if (loaded.composition.captions?.srt) {
      await writeFile(join(lessonRoot, 'audio', 'captions.srt'), loaded.composition.captions.srt)
    }
    built.push({
      id: lesson.id,
      compositionPath: relative(root, compositionPath).split(sep).join('/'),
      durationMs: loaded.composition.durationMs,
      captions: loaded.composition.captions?.groups.length ?? 0,
    })
  }
  const manifest = {
    version: 1,
    courseId: project.id,
    privatePreview: true,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: project.generation.sourceFingerprint,
    lessons: built,
  }
  const manifestPath = join(root, 'publish-manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { course: project, lessons: built, manifestPath }
}

export async function auditCourse(input: string, minimumScore = 78): Promise<{
  ok: boolean
  lessons: Array<{ id: string; ok: boolean; score: number; reportPath: string }>
}> {
  const { root, project } = await loadCourseProject(input)
  const results: Array<{ id: string; ok: boolean; score: number; reportPath: string }> = []
  for (const lesson of allLessons(project)) {
    const loaded = await compileVideoProject(safeResolve(root, lesson.videoProject))
    const audit = await auditComposition(loaded.composition, { minimumScore })
    const qualityDir = join(dirname(safeResolve(root, lesson.videoProject)), 'quality')
    await mkdir(qualityDir, { recursive: true })
    const reportPath = join(qualityDir, 'report.json')
    await writeFile(reportPath, `${JSON.stringify(audit.report, null, 2)}\n`)
    if (audit.cueContactSheet) await writeFile(join(qualityDir, 'cue-contact-sheet.png'), audit.cueContactSheet)
    if (audit.sceneContactSheet) await writeFile(join(qualityDir, 'scene-contact-sheet.png'), audit.sceneContactSheet)
    const words = loaded.composition.captions?.words ?? []
    const waveform = Array.from({ length: 240 }, (_, index) => {
      const startMs = loaded.composition.durationMs * index / 240
      const endMs = loaded.composition.durationMs * (index + 1) / 240
      return {
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        speechDensity: words.filter((word) => word.startMs < endMs && word.endMs > startMs).length,
      }
    })
    await writeFile(join(qualityDir, 'waveform.json'), `${JSON.stringify({ durationMs: loaded.composition.durationMs, samples: waveform }, null, 2)}\n`)
    results.push({ id: lesson.id, ok: audit.report.ok, score: audit.report.score, reportPath })
  }
  return { ok: results.every((result) => result.ok), lessons: results }
}

export async function diffCourseSource(input: string, sourcePath?: string): Promise<{
  fingerprintChanged: boolean
  added: string[]
  changed: string[]
  removed: string[]
  affectedLessons: Array<{ id: string; status: 'stale' | 'conflicted'; dependencies: string[] }>
  snapshot: SourceSnapshot
}> {
  const { root, project } = await loadCourseProject(input)
  const manifestPath = safeResolve(root, project.source.manifestPath)
  const previous = sourceSnapshotSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const normalized = await normalizeSourceInput(sourcePath ?? previous.sourceUri.replace(/^local:/, ''))
  const before = new Map(previous.entries.map((entry) => [entry.path, entry.sha256]))
  const after = new Map(normalized.snapshot.entries.map((entry) => [entry.path, entry.sha256]))
  const added = [...after.keys()].filter((path) => !before.has(path))
  const removed = [...before.keys()].filter((path) => !after.has(path))
  const changed = [...after.keys()].filter((path) => before.has(path) && before.get(path) !== after.get(path))
  const changedSet = new Set([...added, ...changed, ...removed])
  const affectedLessons = allLessons(project).flatMap((lesson) => {
    const dependencies = lesson.sourceDependencies.filter((dependency) => changedSet.has(dependency))
    if (!dependencies.length) return []
    return [{
      id: lesson.id,
      status: lesson.status === 'authored' || lesson.status === 'built' ? 'conflicted' as const : 'stale' as const,
      dependencies,
    }]
  })
  return {
    fingerprintChanged: previous.fingerprint !== normalized.snapshot.fingerprint,
    added,
    changed,
    removed,
    affectedLessons,
    snapshot: normalized.snapshot,
  }
}

export function allLessons(project: CourseProject): CourseLesson[] {
  return project.modules.flatMap((module) => module.lessons)
}

export function safeResolve(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`Course paths must be relative: ${path}`)
  const absoluteRoot = resolve(root)
  const output = resolve(absoluteRoot, path)
  const rel = relative(absoluteRoot, output)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Course path escapes its root: ${path}`)
  return output
}

async function listSourceFiles(root: string): Promise<string[]> {
  const gitRoot = await gitOutput(root, ['rev-parse', '--show-toplevel']).catch(() => undefined)
  if (gitRoot) {
    const output = await gitOutput(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    return output.split('\0')
      .filter(Boolean)
      .map((path) => resolve(gitRoot, path))
      .filter((path) => path === root || path.startsWith(`${root}${sep}`))
  }
  const output: string[] = []
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ALWAYS_EXCLUDED.has(entry.name) || entry.name.startsWith('.env')) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) output.push(path)
    }
  }
  await walk(root)
  return output
}

function classifySource(path: string, extension: string): z.infer<typeof sourceManifestEntrySchema>['kind'] {
  if (extension === '.pdf') return 'pdf'
  if (extension === '.html' || extension === '.htm') return 'html'
  if (extension === '.md' || extension === '.mdx') return 'markdown'
  if (TEXT_EXTENSIONS.has(extension)) {
    return /\.(?:js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sql|sh|zsh|fish|vue|svelte|astro)$/i.test(path)
      ? 'code'
      : 'text'
  }
  return 'binary'
}

function isSensitivePath(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.split('/').some((part) => ALWAYS_EXCLUDED.has(part)) ||
    /(?:^|\/)(?:credentials|secrets?)(?:\.|\/|$)/.test(normalized) ||
    /(?:^|\/)\.env(?:\.|$)/.test(normalized) ||
    /\.(?:pem|key|p12|pfx)$/i.test(normalized)
}

function chunkEvidence(sourceEvidenceId: string, path: string, text: string): EvidenceRecord[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const records: EvidenceRecord[] = []
  for (let start = 0; start < lines.length; start += 80) {
    const chunk = lines.slice(start, start + 80).join('\n').trim()
    if (!chunk) continue
    const sha256 = createHash('sha256').update(chunk).digest('hex')
    records.push({
      id: `ev_${sha256.slice(0, 20)}`,
      sourceEvidenceId,
      uri: `local:${path}#L${start + 1}-L${Math.min(lines.length, start + 80)}`,
      heading: inferTitle(chunk, undefined),
      lineStart: start + 1,
      lineEnd: Math.min(lines.length, start + 80),
      text: chunk,
      sha256,
    })
  }
  return records
}

function inferTitle(text: string | undefined, fallback: string | undefined): string | undefined {
  const heading = text?.match(/^\s*(?:#{1,6}\s+|<h[1-6][^>]*>)([^<\n]+)/im)?.[1]?.trim()
  return heading || fallback
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8').trim())
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `git exited ${code}`))
    })
  })
}

async function extractPdfText(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.HTML_VIDEO_PDFTOTEXT_PATH ?? 'pdftotext', ['-layout', path, '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8'))
      else reject(new Error(Buffer.concat(stderr).toString('utf8') || `pdftotext exited ${code}`))
    })
  })
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function canonicalWebUrl(input: URL): URL {
  const url = new URL(input)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key)
  }
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url
}

function extractSameOriginLinks(html: string, base: URL, origin: string): URL[] {
  const output = new Map<string, URL>()
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = canonicalWebUrl(new URL(match[1], base))
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue
      if (/\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|pdf|zip|gz|tar)$/i.test(url.pathname)) continue
      output.set(url.toString(), url)
    } catch {
      // Ignore malformed or non-URL href values.
    }
  }
  return [...output.values()]
}
