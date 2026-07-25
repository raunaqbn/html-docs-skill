import { z } from 'zod'

export const SEMANTIC_ID_ATTRIBUTE = 'data-html-video-id'
const LEGACY_SEMANTIC_ID_ATTRIBUTE = ['data', 'hv', 'id'].join('-')

/**
 * Older project bundles used a shorter semantic attribute. Normalize them at
 * the schema boundary so stored compositions keep rendering while all newly
 * compiled output uses the descriptive HTML Docs attribute.
 */
export function normalizeLegacySemanticInput(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replaceAll(LEGACY_SEMANTIC_ID_ATTRIBUTE, SEMANTIC_ID_ATTRIBUTE)
  }
  if (Array.isArray(value)) return value.map(normalizeLegacySemanticInput)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeLegacySemanticInput(item)]),
    )
  }
  return value
}

export const videoVariableSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'color']),
  default: z.union([z.string(), z.number(), z.boolean()]),
})

export const videoAssetSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  kind: z.enum(['image', 'video', 'audio', 'font']),
  src: z.string().min(1),
  mimeType: z.string().min(1),
})

export const videoSceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: z.string().optional(),
  teachingJob: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).max(100).optional(),
  layout: z.enum(['centered', 'asymmetric', 'split', 'diagram', 'timeline', 'triptych', 'layered', 'full-width']).optional(),
  startMs: z.number().int().min(0),
  durationMs: z.number().int().positive(),
  track: z.number().int().min(0).max(99),
})

export const videoNarrationCueSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  sceneId: z.string().min(1),
  text: z.string().min(1),
  displayText: z.string().min(1).optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  targets: z.array(z.string().min(1)).min(1).max(20),
  effect: z.enum(['fade', 'rise', 'scale', 'wipe', 'draw', 'none']).default('rise'),
  visualVerb: z.string().min(1).max(120).optional(),
  settledState: z.string().min(1).max(500).optional(),
})

export const videoWordTimingSchema = z.object({
  index: z.number().int().min(0),
  text: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  sceneId: z.string().min(1).optional(),
  cueId: z.string().min(1).optional(),
})

export const videoCaptionGroupSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  text: z.string().min(1),
  wordStart: z.number().int().min(0),
  wordEnd: z.number().int().min(0),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
})

export const videoChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  sceneId: z.string().min(1),
  startMs: z.number().int().min(0),
})

export const videoCaptionTrackSchema = z.object({
  defaultOn: z.boolean().default(true),
  groups: z.array(videoCaptionGroupSchema).max(2_000),
  words: z.array(videoWordTimingSchema).max(20_000),
  webVtt: z.string().optional(),
  srt: z.string().optional(),
})

export const videoManualOverrideSchema = z.object({
  elementId: z.string().min(1),
  sceneId: z.string().min(1),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export const videoNarrationSchema = z.object({
  transcript: z.string().min(1),
  audioDurationMs: z.number().int().positive().optional(),
  cues: z.array(videoNarrationCueSchema).min(1).max(500),
  words: z.array(videoWordTimingSchema).max(20_000).optional(),
  provider: z.string().min(1).optional(),
  voiceProfile: z.string().min(1).optional(),
  waveform: z.array(z.number().min(0).max(1)).max(2_000).optional(),
})

export const videoCompositionSchema = z.preprocess(normalizeLegacySemanticInput, z.object({
  version: z.literal(1),
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  title: z.string().min(1).max(200),
  width: z.number().int().min(240).max(4096),
  height: z.number().int().min(240).max(4096),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  durationMs: z.number().int().min(250),
  html: z.string().min(1).max(500_000),
  css: z.string().max(500_000),
  script: z.string().min(1).max(500_000),
  variables: z.array(videoVariableSchema).max(50).default([]),
  assets: z.array(videoAssetSchema).max(100).default([]),
  scenes: z.array(videoSceneSchema).min(1).max(100),
  narration: videoNarrationSchema.optional(),
  captions: videoCaptionTrackSchema.optional(),
  chapters: z.array(videoChapterSchema).max(100).optional(),
  manualOverrides: z.array(videoManualOverrideSchema).max(1_000).optional(),
  authoring: z.object({
    projectVersion: z.number().int().min(1),
    sourceHash: z.string().optional(),
    generationHash: z.string().optional(),
    evidenceIds: z.array(z.string()).max(10_000).default([]),
  }).optional(),
}))

export type VideoComposition = z.infer<typeof videoCompositionSchema>
export type VideoVariable = z.infer<typeof videoVariableSchema>
export type VideoAsset = z.infer<typeof videoAssetSchema>
export type VideoScene = z.infer<typeof videoSceneSchema>
export type VideoNarration = z.infer<typeof videoNarrationSchema>
export type VideoNarrationCue = z.infer<typeof videoNarrationCueSchema>
export type VideoWordTiming = z.infer<typeof videoWordTimingSchema>
export type VideoCaptionGroup = z.infer<typeof videoCaptionGroupSchema>
export type VideoCaptionTrack = z.infer<typeof videoCaptionTrackSchema>
export type VideoChapter = z.infer<typeof videoChapterSchema>
export type VideoManualOverride = z.infer<typeof videoManualOverrideSchema>

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationFinding {
  code: string
  severity: ValidationSeverity
  message: string
  path?: string
  timeMs?: number
}

export interface ValidationReport {
  ok: boolean
  findings: ValidationFinding[]
  sampledTimesMs: number[]
}

export interface SnapshotResult {
  timeMs: number
  png: Buffer
}

export interface RenderOptions {
  outputPath: string
  /** Optional local narration/music file muxed into MP4/WebM output. */
  audioPath?: string
  format?: 'mp4' | 'webm' | 'gif'
  quality?: 'draft' | 'standard' | 'high'
  variables?: Record<string, unknown>
  executablePath?: string
  ffmpegPath?: string
  /** Directory for content-addressed PNG frames. Existing frames are reused after interruption. */
  cacheDir?: string
  /** Disable frame reuse for a clean render. Defaults to true. */
  resume?: boolean
  onProgress?: (progress: { frame: number; totalFrames: number }) => void
}

export interface RenderResult {
  outputPath: string
  format: 'mp4' | 'webm' | 'gif'
  frameCount: number
  durationMs: number
  bytes: number
  cacheKey: string
  reusedFrames: number
}

export interface QualityMetric {
  id: string
  score: number
  maxScore: number
  message: string
}

export interface SceneQualitySummary {
  id: string
  label?: string
  layout?: VideoScene['layout']
  cueCount: number
  domNodes: number
  svgCount: number
  svgPrimitiveCount: number
  mediaCount: number
  scriptBytes: number
  visualChange?: number
}

export interface QualityReport {
  ok: boolean
  score: number
  minimumScore: number
  metrics: QualityMetric[]
  findings: ValidationFinding[]
  scenes: SceneQualitySummary[]
  sampledTimesMs: number[]
}
