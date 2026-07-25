import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { Browser, Page } from 'puppeteer-core'
import { launchVideoBrowser, prepareCompositionPage, seekPage } from './browser'
import { resolveFfmpegPath } from './ffmpeg'
import { validateCompositionStatic } from './validate'
import type { RenderOptions, RenderResult, VideoComposition } from './types'

export async function renderComposition(
  composition: VideoComposition,
  options: RenderOptions,
): Promise<RenderResult> {
  const validation = validateCompositionStatic(composition)
  if (!validation.ok) {
    throw new Error(`Composition validation failed:\n${validation.findings.filter((f) => f.severity === 'error').map((f) => `- ${f.code}: ${f.message}`).join('\n')}`)
  }

  const format = options.format ?? inferFormat(options.outputPath)
  const totalFrames = Math.ceil((composition.durationMs / 1000) * composition.fps)
  const cacheKey = getRenderCacheKey(composition, options.variables, format)
  const cacheRoot = join(options.cacheDir ?? join(dirname(options.outputPath), '.html-video-cache'), cacheKey)
  const resume = options.resume !== false
  await mkdir(dirname(options.outputPath), { recursive: true })
  await mkdir(cacheRoot, { recursive: true })
  const encoder = startEncoder(composition, { ...options, format })
  let browser: Browser | undefined
  let page: Page | undefined
  let reusedFrames = 0

  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const framePath = join(cacheRoot, `frame-${String(frame).padStart(8, '0')}.png`)
      let png: Buffer | undefined
      if (resume) {
        try {
          const cached = await readFile(framePath)
          if (cached.length > 8 && cached.subarray(1, 4).toString('ascii') === 'PNG') {
            png = cached
            reusedFrames += 1
          }
        } catch {
          // Cache miss: capture this exact timestamp below.
        }
      }
      if (!png) {
        if (!browser) browser = await launchVideoBrowser(options.executablePath)
        if (!page) page = await prepareCompositionPage(browser, composition, options.variables)
        const timeMs = Math.min(composition.durationMs, (frame / composition.fps) * 1000)
        await seekPage(page, timeMs)
        png = Buffer.from(await page.screenshot({ type: 'png', omitBackground: format === 'webm' }))
        const temporaryPath = `${framePath}.${process.pid}.partial`
        await writeFile(temporaryPath, png)
        await rename(temporaryPath, framePath)
      }
      if (!encoder.stdin.write(png)) await new Promise<void>((resolve) => encoder.stdin.once('drain', resolve))
      options.onProgress?.({ frame: frame + 1, totalFrames })
    }
    encoder.stdin.end()
    await page?.close()
    await encoder.done
  } catch (error) {
    encoder.kill()
    throw error
  } finally {
    await browser?.close()
  }

  const file = await stat(options.outputPath)
  return {
    outputPath: options.outputPath,
    format,
    frameCount: totalFrames,
    durationMs: composition.durationMs,
    bytes: file.size,
    cacheKey,
    reusedFrames,
  }
}

export function getRenderCacheKey(
  composition: VideoComposition,
  variables: Record<string, unknown> | undefined,
  format: 'mp4' | 'webm' | 'gif',
) {
  return createHash('sha256')
    .update(JSON.stringify({ composition, variables: variables ?? {}, transparent: format === 'webm' }))
    .digest('hex')
    .slice(0, 24)
}

function inferFormat(outputPath: string): 'mp4' | 'webm' | 'gif' {
  if (outputPath.toLowerCase().endsWith('.webm')) return 'webm'
  if (outputPath.toLowerCase().endsWith('.gif')) return 'gif'
  return 'mp4'
}

function startEncoder(
  composition: VideoComposition,
  options: RenderOptions & { format: 'mp4' | 'webm' | 'gif' },
) {
  const ffmpegPath = resolveFfmpegPath(options.ffmpegPath)
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(composition.fps), '-i', '-']
  if (options.audioPath) input.push('-i', options.audioPath)
  const quality = options.quality ?? 'standard'
  let output: string[]
  if (options.format === 'webm') {
    const crf = quality === 'draft' ? '42' : quality === 'high' ? '24' : '32'
    output = ['-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-pix_fmt', 'yuva420p', options.outputPath]
  } else if (options.format === 'gif') {
    output = ['-vf', `fps=${Math.min(30, composition.fps)}`, options.outputPath]
  } else {
    const crf = quality === 'draft' ? '30' : quality === 'high' ? '18' : '23'
    output = [
      '-c:v', 'libx264', '-preset', quality === 'high' ? 'slow' : 'medium',
      '-crf', crf, '-pix_fmt', 'yuv420p',
      ...(options.audioPath ? ['-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '160k'] : []),
      '-t', String(composition.durationMs / 1000),
      '-movflags', '+faststart', options.outputPath,
    ]
  }
  const child = spawn(ffmpegPath, [...input, ...output], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code}: ${stderr.trim()}`)))
  })
  return { stdin: child.stdin, done, kill: () => child.kill('SIGKILL') }
}
