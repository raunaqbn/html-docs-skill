import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { resolveFfmpegPath } from './ffmpeg'
import {
  videoCaptionGroupSchema,
  videoWordTimingSchema,
  type VideoCaptionGroup,
  type VideoNarrationCue,
  type VideoWordTiming,
} from './types'

export const voiceProfileIdSchema = z.enum([
  'warm-teacher',
  'precise-engineer',
  'gentle-guide',
  'energetic-coach',
])

export type VoiceProfileId = z.infer<typeof voiceProfileIdSchema>

export interface VoiceProfile {
  id: VoiceProfileId
  label: string
  description: string
  delivery: string
  elevenLabsVoiceEnv: string
  heyGenVoiceEnv: string
  kokoroVoice: string
}

/**
 * Provider-neutral teaching voices. Provider voice IDs remain local/BYOK:
 * callers map a profile through the named environment variable instead of
 * storing a credential or provider-specific ID in HTML Docs.
 */
export const VOICE_PROFILES: Record<VoiceProfileId, VoiceProfile> = {
  'warm-teacher': {
    id: 'warm-teacher',
    label: 'Warm teacher',
    description: 'Patient, conversational, and quietly confident.',
    delivery: 'Explain as a trusted teacher. Use warm phrasing, gentle emphasis, and short conceptual pauses. Never sound promotional.',
    elevenLabsVoiceEnv: 'HTML_VIDEO_ELEVENLABS_WARM_TEACHER_VOICE_ID',
    heyGenVoiceEnv: 'HTML_VIDEO_HEYGEN_WARM_TEACHER_VOICE_ID',
    kokoroVoice: 'af_heart',
  },
  'precise-engineer': {
    id: 'precise-engineer',
    label: 'Precise engineer',
    description: 'Measured and exact without becoming cold.',
    delivery: 'Teach a technical peer. Slow down for identifiers and mechanisms, lightly stress contrasts, and leave a pause after each causal step.',
    elevenLabsVoiceEnv: 'HTML_VIDEO_ELEVENLABS_PRECISE_ENGINEER_VOICE_ID',
    heyGenVoiceEnv: 'HTML_VIDEO_HEYGEN_PRECISE_ENGINEER_VOICE_ID',
    kokoroVoice: 'am_michael',
  },
  'gentle-guide': {
    id: 'gentle-guide',
    label: 'Gentle guide',
    description: 'Soft, reassuring, and unhurried.',
    delivery: 'Use a kind, low-pressure teaching voice. Keep the energy calm, articulate carefully, and make sensitive material feel safe and approachable.',
    elevenLabsVoiceEnv: 'HTML_VIDEO_ELEVENLABS_GENTLE_GUIDE_VOICE_ID',
    heyGenVoiceEnv: 'HTML_VIDEO_HEYGEN_GENTLE_GUIDE_VOICE_ID',
    kokoroVoice: 'af_sarah',
  },
  'energetic-coach': {
    id: 'energetic-coach',
    label: 'Energetic coach',
    description: 'Upbeat and motivating while remaining explanatory.',
    delivery: 'Keep forward momentum and make the learning goal feel achievable. Emphasize turning points, not every sentence, and avoid announcer energy.',
    elevenLabsVoiceEnv: 'HTML_VIDEO_ELEVENLABS_ENERGETIC_COACH_VOICE_ID',
    heyGenVoiceEnv: 'HTML_VIDEO_HEYGEN_ENERGETIC_COACH_VOICE_ID',
    kokoroVoice: 'af_bella',
  },
}

export function chooseVoiceProfile(input: {
  explicit?: VoiceProfileId
  subject?: string
  sensitive?: boolean
}): VoiceProfile {
  if (input.explicit) return VOICE_PROFILES[input.explicit]
  if (input.sensitive || /\b(?:medical|health|trauma|grief|personal|mental health)\b/i.test(input.subject ?? '')) {
    return VOICE_PROFILES['gentle-guide']
  }
  if (/\b(?:code|software|engineering|api|database|robot|technical|architecture)\b/i.test(input.subject ?? '')) {
    return VOICE_PROFILES['precise-engineer']
  }
  return VOICE_PROFILES['warm-teacher']
}

export const audioSegmentSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  spokenText: z.string().min(1),
  displayText: z.string().min(1).optional(),
  audioPath: z.string().min(1),
  timingsPath: z.string().min(1),
  durationMs: z.number().int().positive(),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  sha256: z.string().min(16),
})

export const audioManifestSchema = z.object({
  version: z.literal(1),
  provider: z.enum(['elevenlabs', 'heygen', 'kokoro', 'custom']),
  voiceProfile: voiceProfileIdSchema,
  voiceId: z.string().optional(),
  preRollMs: z.number().int().min(0).default(200),
  postRollMs: z.number().int().min(0).default(600),
  integratedLoudnessLufs: z.number().default(-16),
  truePeakDbtp: z.number().default(-1),
  masterPath: z.string().min(1),
  segments: z.array(audioSegmentSchema),
  words: z.array(videoWordTimingSchema),
  generatedAt: z.string().datetime(),
})

export type AudioManifest = z.infer<typeof audioManifestSchema>

export interface ElevenLabsAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export function elevenLabsAlignmentToWords(
  alignment: ElevenLabsAlignment,
  offsetMs = 0,
): VideoWordTiming[] {
  const text = alignment.characters.join('')
  if (
    alignment.characters.length !== alignment.character_start_times_seconds.length ||
    alignment.characters.length !== alignment.character_end_times_seconds.length
  ) {
    throw new Error('ElevenLabs alignment arrays must have identical lengths.')
  }
  const words: VideoWordTiming[] = []
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
    const startIndex = match.index ?? 0
    const endIndex = startIndex + match[0].length - 1
    const start = alignment.character_start_times_seconds[startIndex]
    const end = alignment.character_end_times_seconds[endIndex]
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`Invalid ElevenLabs character alignment for “${match[0]}”.`)
    }
    words.push({
      index: words.length,
      text: match[0],
      startMs: offsetMs + Math.round(start * 1000),
      endMs: offsetMs + Math.round(end * 1000),
    })
  }
  return z.array(videoWordTimingSchema).parse(words)
}

export function heyGenTimingToWords(value: unknown, offsetMs = 0): VideoWordTiming[] {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(record.words)
      ? record.words
      : Array.isArray(record.word_timestamps)
        ? record.word_timestamps
        : null
  if (!raw) throw new Error('HeyGen timing payload needs a words or word_timestamps array.')
  return raw.flatMap((entry, rawIndex) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Invalid HeyGen word timing at index ${rawIndex}.`)
    const item = entry as Record<string, unknown>
    const text = String(item.text ?? item.word ?? '').trim()
    const startMs = readTimeMs(item.start_ms ?? item.startMs, item.start)
    const endMs = readTimeMs(item.end_ms ?? item.endMs, item.end)
    if (!text || startMs == null || endMs == null || endMs <= startMs) {
      throw new Error(`Invalid HeyGen word timing at index ${rawIndex}.`)
    }
    const tokens = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
    return tokens.map((token) => ({
      index: 0,
      text: token,
      startMs: offsetMs + startMs,
      endMs: offsetMs + endMs,
    }))
  }).map((word, index) => videoWordTimingSchema.parse({ ...word, index }))
}

/**
 * Ingests a script-constrained forced-aligner result. Unlike a free
 * transcription, it is accepted only when every normalized locked-script word
 * appears exactly once and in order.
 */
export function forcedAlignmentToWords(
  value: unknown,
  lockedScript: string,
  offsetMs = 0,
): VideoWordTiming[] {
  const words = heyGenTimingToWords(value, offsetMs)
  const expected = tokenize(lockedScript)
  const actual = words.map((word) => normalizeToken(word.text))
  if (actual.join(' ') !== expected.join(' ')) {
    const firstMismatch = expected.findIndex((word, index) => actual[index] !== word)
    throw new Error(
      `Forced alignment does not cover the locked script exactly at word ${Math.max(0, firstMismatch) + 1}. ` +
      `Expected “${expected[firstMismatch] ?? '<end>'}”; received “${actual[firstMismatch] ?? '<end>'}”.`,
    )
  }
  return words
}

/**
 * Binds the canonical word track to exact cue and scene ownership. This is
 * the synchronization invariant used by visuals, captions, and Studio.
 */
export function assignWordOwnership(
  words: VideoWordTiming[],
  cues: VideoNarrationCue[],
): VideoWordTiming[] {
  const output: VideoWordTiming[] = []
  let cursor = 0
  for (const cue of cues) {
    const expected = tokenize(cue.text)
    const slice = words.slice(cursor, cursor + expected.length)
    const actual = slice.map((word) => normalizeToken(word.text))
    if (actual.join(' ') !== expected.join(' ')) {
      throw new Error(`Timing words do not match cue ${cue.id}. Expected “${expected.join(' ')}”; received “${actual.join(' ')}”.`)
    }
    for (const word of slice) output.push({ ...word, sceneId: cue.sceneId, cueId: cue.id })
    cursor += expected.length
  }
  if (cursor !== words.length) {
    throw new Error(`Cues own ${cursor} words, but the final audio track contains ${words.length}.`)
  }
  return output.map((word, index) => ({ ...word, index }))
}

export function buildCaptionGroups(
  words: VideoWordTiming[],
  options: { minWords?: number; maxWords?: number; pauseMs?: number } = {},
): VideoCaptionGroup[] {
  const minWords = options.minWords ?? 2
  const maxWords = options.maxWords ?? 6
  const pauseMs = options.pauseMs ?? 360
  if (minWords < 1 || maxWords < minWords) throw new Error('Caption word limits are invalid.')
  const groups: VideoCaptionGroup[] = []
  let start = 0
  while (start < words.length) {
    const sceneId = words[start].sceneId
    let end = start
    while (end + 1 < words.length && end - start + 1 < maxWords) {
      const current = words[end]
      const next = words[end + 1]
      if (next.sceneId !== sceneId) break
      const count = end - start + 1
      if (count >= minWords && next.startMs - current.endMs >= pauseMs) break
      end += 1
    }
    const slice = words.slice(start, end + 1)
    groups.push(videoCaptionGroupSchema.parse({
      id: `caption-${String(groups.length + 1).padStart(4, '0')}`,
      sceneId: sceneId ?? 'unassigned',
      text: slice.map((word) => word.text).join(' '),
      wordStart: start,
      wordEnd: end,
      startMs: slice[0].startMs,
      endMs: slice.at(-1)!.endMs,
    }))
    start = end + 1
  }
  return groups
}

export function captionsToWebVtt(groups: VideoCaptionGroup[]): string {
  return `WEBVTT\n\n${groups.map((group) => (
    `${group.id}\n${formatVttTime(group.startMs)} --> ${formatVttTime(group.endMs)}\n${group.text}`
  )).join('\n\n')}\n`
}

export function captionsToSrt(groups: VideoCaptionGroup[]): string {
  return `${groups.map((group, index) => (
    `${index + 1}\n${formatSrtTime(group.startMs)} --> ${formatSrtTime(group.endMs)}\n${group.text}`
  )).join('\n\n')}\n`
}

export async function synthesizeElevenLabs(input: {
  apiKey: string
  voiceId: string
  text: string
  outputPath: string
  modelId?: string
  previousText?: string
  nextText?: string
  stability?: number
  similarityBoost?: number
  style?: number
}): Promise<{ outputPath: string; words: VideoWordTiming[]; responseHash: string }> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`, {
    method: 'POST',
    headers: {
      'xi-api-key': input.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text: input.text,
      model_id: input.modelId ?? 'eleven_multilingual_v2',
      previous_text: input.previousText,
      next_text: input.nextText,
      voice_settings: {
        stability: input.stability ?? 0.62,
        similarity_boost: input.similarityBoost ?? 0.78,
        style: input.style ?? 0.12,
        use_speaker_boost: true,
      },
    }),
  })
  const body = await response.json() as {
    audio_base64?: string
    alignment?: ElevenLabsAlignment
    normalized_alignment?: ElevenLabsAlignment
    detail?: unknown
  }
  if (!response.ok || !body.audio_base64) {
    throw new Error(`ElevenLabs synthesis failed (${response.status}): ${JSON.stringify(body.detail ?? body).slice(0, 500)}`)
  }
  const alignment = body.normalized_alignment ?? body.alignment
  if (!alignment) throw new Error('ElevenLabs returned audio without alignment data.')
  const bytes = Buffer.from(body.audio_base64, 'base64')
  await mkdir(dirname(resolve(input.outputPath)), { recursive: true })
  await writeFile(input.outputPath, bytes)
  return {
    outputPath: resolve(input.outputPath),
    words: elevenLabsAlignmentToWords(alignment),
    responseHash: createHash('sha256').update(bytes).digest('hex'),
  }
}

/**
 * Concatenates scene-sized sources, adds the standard pre/post roll, and
 * applies course narration loudness/peak targets. Segment regeneration stays
 * cheap while playback uses one click-free master.
 */
export async function compileNarrationMaster(input: {
  segmentPaths: string[]
  outputPath: string
  preRollMs?: number
  postRollMs?: number
  ffmpegPath?: string
}): Promise<string> {
  if (!input.segmentPaths.length) throw new Error('At least one narration segment is required.')
  const ffmpeg = resolveFfmpegPath(input.ffmpegPath)
  const preRoll = Math.max(0, input.preRollMs ?? 200)
  const postRoll = Math.max(0, input.postRollMs ?? 600)
  const args = input.segmentPaths.flatMap((path) => ['-i', resolve(path)])
  const segmentFilters = input.segmentPaths.map((_, index) => (
    `[${index}:a]aresample=48000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,areverse,afade=t=in:st=0:d=0.008,areverse[a${index}]`
  ))
  const inputs = input.segmentPaths.map((_, index) => `[a${index}]`).join('')
  const filter = [
    ...segmentFilters,
    `${inputs}concat=n=${input.segmentPaths.length}:v=0:a=1,` +
      `loudnorm=I=-16:TP=-1:LRA=11,adelay=${preRoll}|${preRoll},apad=pad_dur=${(postRoll / 1000).toFixed(3)}[master]`,
  ].join(';')
  await mkdir(dirname(resolve(input.outputPath)), { recursive: true })
  await runProcess(ffmpeg, [
    '-y',
    ...args,
    '-filter_complex', filter,
    '-map', '[master]',
    '-ar', '48000',
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    resolve(input.outputPath),
  ])
  return resolve(input.outputPath)
}

export async function hashFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/** Decode the final narration master and return normalized RMS bins for Studio. */
export async function extractAudioWaveform(
  inputPath: string,
  bins = 320,
  ffmpegPath?: string,
): Promise<number[]> {
  const ffmpeg = resolveFfmpegPath(ffmpegPath)
  const output = await new Promise<Buffer>((resolvePromise, reject) => {
    const child = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-i', resolve(inputPath),
      '-vn', '-ac', '1', '-ar', '4000',
      '-f', 'f32le', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise(Buffer.concat(chunks))
      else reject(new Error(`Could not decode narration waveform (${code}): ${stderr.slice(-2_000)}`))
    })
  })
  const sampleCount = Math.floor(output.length / 4)
  if (!sampleCount) return []
  const safeBins = Math.max(16, Math.min(2_000, Math.round(bins)))
  const values: number[] = []
  for (let bin = 0; bin < safeBins; bin += 1) {
    const start = Math.floor(bin * sampleCount / safeBins)
    const end = Math.max(start + 1, Math.floor((bin + 1) * sampleCount / safeBins))
    let squareSum = 0
    for (let index = start; index < end; index += 1) {
      const sample = output.readFloatLE(index * 4)
      squareSum += sample * sample
    }
    values.push(Math.sqrt(squareSum / Math.max(1, end - start)))
  }
  const peak = Math.max(...values, 0.000_001)
  return values.map((value) => Number(Math.min(1, value / peak).toFixed(5)))
}

function readTimeMs(milliseconds: unknown, seconds: unknown): number | undefined {
  if (typeof milliseconds === 'number' && Number.isFinite(milliseconds)) return Math.round(milliseconds)
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.round(seconds * 1000)
  return undefined
}

function tokenize(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).map(normalizeToken)
}

function normalizeToken(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/’/g, "'")
}

function formatVttTime(milliseconds: number): string {
  return formatTime(milliseconds, '.')
}

function formatSrtTime(milliseconds: number): string {
  return formatTime(milliseconds, ',')
}

function formatTime(milliseconds: number, separator: string): string {
  const safe = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(safe / 3_600_000)
  const minutes = Math.floor((safe % 3_600_000) / 60_000)
  const seconds = Math.floor((safe % 60_000) / 1000)
  const millis = safe % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${String(millis).padStart(3, '0')}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

async function runProcess(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} failed with exit code ${code}:\n${stderr.slice(-4_000)}`))
    })
  })
}
