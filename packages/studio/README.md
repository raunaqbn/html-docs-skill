# HTML Docs Guided Studio

`@html-docs/studio` is a focused React Studio for explanatory video and
learning-course projects. It combines a deterministic live preview, source
evidence, storyboard, real waveform data, narration/cue/caption lanes,
selection-aware overrides, agent edit requests, voice profiles, and immutable
versions.

The package is intentionally not a general-purpose NLE. Generative changes are
queued for the active local Codex or Claude session; direct visual property
edits are stored as structured overrides.

```tsx
import { GuidedStudio } from '@html-docs/studio'

<GuidedStudio
  composition={composition}
  previewUrl={previewUrl}
  waveform={waveform}
  evidence={evidence}
  versions={versions}
  onSaveOverride={saveOverride}
  onCreateRequest={createRequest}
/>
```
