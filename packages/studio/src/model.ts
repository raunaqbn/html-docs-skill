import type { VideoComposition } from '@html-docs/html-video/types'

export interface StudioEvidence {
  id: string
  title: string
  uri?: string
  locator?: string
}

export interface StudioVersion {
  id: string
  version: number
  createdAt: string
  score?: number
  active?: boolean
}

export interface StudioSelection {
  elementId: string
  sceneId: string
  text?: string
  timeMs?: number
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface StudioOverride {
  x?: number
  y?: number
  width?: number
  height?: number
  fontSize?: number
  opacity?: number
  color?: string
  backgroundColor?: string
  text?: string
}

export interface GuidedStudioProps {
  composition: VideoComposition
  previewUrl: string
  waveform: number[]
  evidence?: StudioEvidence[]
  versions?: StudioVersion[]
  voiceProfile?: string
  onSeek?: (timeMs: number) => void
  onNarrationChange?: (cueId: string, spokenText: string) => void
  onCaptionChange?: (captionId: string, text: string) => void
  onVoiceProfileChange?: (profile: string) => void
  onSaveOverride?: (selection: StudioSelection, override: StudioOverride) => void | Promise<void>
  onCreateRequest?: (instruction: string, selection?: StudioSelection) => void | Promise<void>
  onCommitVersion?: () => void | Promise<void>
  onRollback?: (versionId: string) => void | Promise<void>
}
