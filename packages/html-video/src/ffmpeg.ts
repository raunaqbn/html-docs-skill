import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'

export function resolveFfmpegPath(explicit?: string) {
  if (explicit) return explicit
  if (process.env.HTML_VIDEO_FFMPEG_PATH) return process.env.HTML_VIDEO_FFMPEG_PATH
  return ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : 'ffmpeg'
}
