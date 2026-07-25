# Deterministic HTML explainer video

Use this reference for narrated or multi-scene HTML video. The active agent
writes the brief, narration, storyboard, HTML/CSS/JavaScript scenes, and review.
The local renderer turns time-addressable HTML into pixels and media.

## Final-output contract

A final must provide:

- One teaching job per scene.
- A cumulative idea sequence, not a list of facts.
- A substantive explanatory visual in each body scene.
- Locked narration generated before final timing.
- Exact word timings from the final audio.
- One cue and one scene owner for every spoken word.
- One or more same-scene semantic targets for every cue.
- Captions derived from the same word track.
- Deterministic seeking and a passing sound-on visual audit.
- A live HTML player plus MP4 fallback.

## Project layout

```text
video-project/
  BRIEF.md
  SCRIPT.md
  STORYBOARD.md
  design.md
  video.project.json
  audio/
    request.json
    manifest.json
    pronunciations.json
    segments/
    master.wav
    words.json
    captions.json
  assets/
  scenes/
    01-hook.html
    01-hook.css
    01-hook.js
  quality/
  composition.json
```

`composition.json` is generated. Edit the project and scene modules instead.

## VideoProject v2

Each scene declares:

- Stable scene ID and label.
- Teaching job.
- Evidence IDs.
- Layout family.
- Source files.
- Spoken text.
- Ordered cues.
- Transition meaning.

Each cue declares:

- Stable cue ID.
- Exact contiguous spoken text.
- Optional shorter display text.
- One or more semantic target IDs.
- Visual verb.
- Settled read.
- Seek-driven effect.

Give selectable elements a globally unique `data-html-video-id`. Use descriptive
IDs such as `request-enters-queue`, not positions such as `left-box`.

## Write narration for explanation

Write speech, not page prose:

1. Name the learner’s problem.
2. Give one orienting model.
3. Explain the mechanism in causal order.
4. Demonstrate it with a concrete example.
5. State the practical consequence.
6. Recap the model in changed language.

Prefer short phrase-shaped sentences. Put difficult identifiers in
`pronunciations.json`. Keep `spokenText` separate from display labels. Add
delivery direction to the provider request rather than speaking it aloud.

## Voice pipeline

Choose a provider-neutral profile:

- `warm-teacher`: default educational narration.
- `gentle-guide`: personal, medical, or sensitive material.
- `precise-engineer`: technical and code-heavy material.
- `energetic-coach`: short, action-oriented instruction.

Use ElevenLabs with timestamps when available. Use a local Kokoro implementation
for offline work. When the provider does not return timings, forced-align the
locked transcript against the final audio. Do not use unconstrained
transcription as timing truth.

Generate scene-sized audio segments. Pass neighboring narration as context when
the provider supports it. Concatenate with click-free boundaries, normalize
narration near −16 LUFS with a −1 dBTP ceiling, and preserve segment sources for
selective regeneration.

Use the measured final audio duration as authority. Never time-stretch speech to
match an estimated storyboard.

## Timing and cue ownership

For each scene:

1. Split narration into ordered cue phrases.
2. Require concatenated cue text to equal scene narration after punctuation
   normalization.
3. Map timed words to cues exactly.
4. Map every cue to semantic targets in the same scene.
5. Begin target motion at or immediately around the owned phrase.
6. Settle the target after the phrase rather than revealing its conclusion
   early.
7. Compute scene boundaries from word timings plus pre/post-roll holds.

Use roughly 200 ms pre-roll and 600 ms settled post-roll unless the scene has a
reason to differ. Shift timestamps mechanically when adding holds.

## Captions

Build semantic caption groups from punctuation, pauses, and phrase structure:

- Usually two to six words.
- One active group at a time.
- Active-word emphasis from exact timings.
- Bottom 17% reserved across all scenes.
- Default on in the live player and captioned MP4.
- Also export WebVTT and SRT.

Do not independently retime captions. Cues, captions, scenes, and transcript all
derive from one normalized word track.

## Deterministic scene code

Register one seek function:

```js
window.__HTML_VIDEO__ = {
  renderFrame({ root, timeMs, progress, variables }) {
    const target = root.querySelector(
      '[data-html-video-id="central-mechanism"]',
    )
    target.style.opacity = String(Math.min(1, progress * 1.4))
  },
}
```

Derive every pixel from the supplied time and variables. Do not use wall clocks,
timers, unseeded randomness, requestAnimationFrame, self-running CSS animation,
network requests, storage, workers, dynamic imports, or external runtime media.

## Build and audit

```bash
<skill-root>/scripts/video.sh build ./video-project
<skill-root>/scripts/video.sh check ./video-project
<skill-root>/scripts/video.sh audit ./video-project
<skill-root>/scripts/video.sh render ./video-project --output ./final.mp4
```

Inspect:

- Scene opening, development, and settled frames.
- Cue midpoint frames.
- Caption clearance.
- Repeated layouts.
- Text clipping and contrast.
- Missing or premature targets.
- Same-time deterministic captures.
- Full playback with sound.

Do not publish a final that passes numerically but fails visually.

## Publish

Document-linked:

```bash
<skill-root>/scripts/video.sh publish ./video-project \
  --document <document-id> \
  --prompt "Teach the mechanism" \
  --provider codex
```

Standalone:

```bash
<skill-root>/scripts/video.sh publish ./video-project \
  --prompt "Teach the mechanism" \
  --provider codex
```

Use the returned `/v/<code>` URL for sharing. Keep the MP4 as fallback or
download. Keep provider keys, raw source bundles, and diagnostics private.
