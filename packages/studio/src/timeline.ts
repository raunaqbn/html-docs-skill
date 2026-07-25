import type { VideoComposition } from '@html-docs/html-video/types'

export interface TimelineItem {
  id: string
  left: number
  width: number
}

export function toTimelineItems(
  values: Array<{ id: string; startMs: number; endMs?: number; durationMs?: number }>,
  durationMs: number,
): TimelineItem[] {
  const safeDuration = Math.max(1, durationMs)
  return values.map((value) => {
    const itemDuration = value.durationMs ?? Math.max(1, (value.endMs ?? value.startMs) - value.startMs)
    return {
      id: value.id,
      left: Math.max(0, Math.min(100, value.startMs / safeDuration * 100)),
      width: Math.max(0.18, Math.min(100, itemDuration / safeDuration * 100)),
    }
  })
}

export function sceneAt(composition: VideoComposition, timeMs: number) {
  return composition.scenes.find((scene, index) => (
    timeMs >= scene.startMs
    && (index === composition.scenes.length - 1
      ? timeMs <= scene.startMs + scene.durationMs
      : timeMs < scene.startMs + scene.durationMs)
  ))
}
