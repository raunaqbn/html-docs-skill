# HTML-authored explainer video

Use this reference whenever an HTML Docs document needs a generated video. The
current Codex or Claude session is the writer, director, designer, and scene
author. The open-source HTML Video package is the deterministic production
engine: it compiles scene modules, freezes local assets, seeks Chromium to each
frame, and encodes with FFmpeg. HTML Docs only stores the composition and
inserts the uploaded MP4 into the owned document.

## The quality contract

A final explainer is a short film, not a web page with a fade. It must have:

- A teaching spine: hook → orientation → 3–6 cumulative ideas → landing.
- One job per scene and at least three distinct framing systems across a video.
- A designed explanatory visual in every body scene: diagram, process, map,
  data-viz, type-as-subject, or a frozen asset with visual treatment.
- Sequential development across each scene. Do not reveal the finished canvas
  in its first quarter and hold it under the rest of the voiceover.
- Exact narration ownership. Every spoken word or phrase belongs to one cue,
  one scene, and one or more unique visual target IDs.
- A clean static read at every sampled timestamp, deterministic seeking, and a
  passing visual audit whose contact sheet has been inspected.

For a multi-scene explainer, `video-scene-craft.md` is the complete directing
doctrine. It is intentionally local to this skill; do not require HyperFrames or
translate the project into another video framework before authoring.

## Required project shape

For anything beyond a tiny silent loop, author a project directory:

```text
video-project/
  BRIEF.md                  audience, thesis, length, format, voice choice
  SCRIPT.md                 locked narration, one section per scene
  STORYBOARD.md             one scene job + time-coded cue plan per scene
  design.md                 palette, type roles, layout and motion grammar
  video.project.json        compiler manifest
  audio/
    voiceover.wav           final measured narration
    words.json              exact word timings when available
  assets/                   frozen local images, fonts, icons, or footage
  scenes/
    01-hook.html
    01-hook.css
    01-hook.js
    02-*.html / .css / .js
  quality/                  generated report, snapshots, contact sheet
  composition.json          generated; do not hand-edit
```

The renderer also accepts the legacy single-file composition JSON, but that
format is for very short motion snippets. Do not use it for a narrated
multi-scene explainer.

## Narration is the timing authority

This is load-bearing. A visually attractive scene is still wrong if the voice
is discussing the next idea.

1. Lock `SCRIPT.md` before scene implementation. Each spoken line is assigned
   to exactly one storyboard scene.
2. Generate or record the final voiceover before final scene timing. Never
   stretch a storyboard estimate to fit it.
3. Obtain exact word timings. Prefer provider-native timestamps. Otherwise run
   a local aligner/transcriber such as Whisper/WhisperX against the final audio.
4. Split each scene's narration into short, ordered cue phrases. The cue texts,
   concatenated, must equal that scene's narration exactly—no paraphrases,
   dropped words, or duplicated words.
5. Give every cue one or more unique ID selectors for the visual elements it
   owns. A target must live in the same scene as the cue.
6. Reveal or emphasize the target during the cue that names it. It must not be
   fully visible in an earlier scene merely because it was convenient to build
   the final layout up front.
7. Run `check`. The compiler rejects mismatched cue text, uncovered timed words,
   cue overlap, cues outside their scene, missing target IDs, and audio/video
   duration drift.

Word timing file shape:

```json
{
  "words": [
    { "text": "First", "startMs": 240, "endMs": 510 },
    { "text": "protect", "startMs": 540, "endMs": 910 }
  ]
}
```

`start`/`end` in seconds are also accepted. If no word timing file exists, every
cue must provide explicit `startMs` and `endMs` measured from the final audio.
Estimated timestamps are not acceptable for a final.

## Project manifest

```json
{
  "kind": "html-video-project",
  "version": 1,
  "id": "how-treatment-works",
  "title": "How the treatment works",
  "width": 1280,
  "height": 720,
  "fps": 30,
  "globalCss": "global.css",
  "voiceover": {
    "audio": "audio/voiceover.wav",
    "timings": "audio/words.json"
  },
  "assets": [
    { "id": "scan", "kind": "image", "src": "assets/scan.png" },
    { "id": "display", "kind": "font", "src": "assets/display.woff2" }
  ],
  "scenes": [
    {
      "id": "baseline",
      "label": "Baseline checks",
      "layout": "split",
      "html": "scenes/02-baseline.html",
      "css": "scenes/02-baseline.css",
      "script": "scenes/02-baseline.js",
      "transition": "push-left",
      "narration": "The scan maps the disease. The heart test clears the planned treatment.",
      "cues": [
        {
          "id": "scan-map",
          "text": "The scan maps the disease.",
          "targets": ["#baseline-scan"],
          "effect": "wipe"
        },
        {
          "id": "heart-clearance",
          "text": "The heart test clears the planned treatment.",
          "targets": ["#baseline-heart", "#baseline-check"],
          "effect": "scale"
        }
      ]
    }
  ]
}
```

Allowed layouts: `centered`, `asymmetric`, `split`, `diagram`, `timeline`,
`triptych`, `layered`, `full-width`. Do not repeat one on adjacent scenes unless
the repeated stage is narratively intentional.

Allowed automatic cue effects: `fade`, `rise`, `scale`, `wipe`, `draw`, `none`.
Use `none` when the scene script controls the target's cue response itself.
Automatic effects are safe defaults, not a reason to give every scene the same
motion.

## Scene module contract

Scene HTML is a fragment, not a document. Do not include `<html>`, `<style>`,
`<script>`, network resources, audio, video, forms, iframes, or event-handler
attributes. Use unique element IDs across the whole project; cue targets must be
ID selectors.

Scene CSS must be scoped beneath `#hv-scene-<scene-id>` or use globally unique
class names. Do not use `transition`, `animation`, or `@keyframes` for
render-critical motion. Use `asset:<id>` in `src` or `url()`; build embeds the
declared local file as a data URL.

Each scene JS file is the body of a deterministic render function. It receives:

```js
// Available bindings in every scene module:
// root       scene root element
// timeMs     time inside this scene
// progress   0..1 scene progress
// cue(id)    exact 0..1 progress for one narration cue
// phase(t,a,b), h (HtmlVideoRuntime helpers), variables

var reveal = h.ease.outCubic(cue('heart-clearance'))
root.querySelector('#ef-number').textContent = h.countTo(60, reveal, 0) + '%'
h.drawPath(root.querySelector('#scan-outline'), cue('scan-map'))
```

Derive every render-critical property from `timeMs`, `progress`, or `cue(id)`.
Never increment from the prior frame.

Available helpers include `clamp`, `lerp`, `mapRange`, `sceneProgress`, `phase`,
`staggerProgress`, `seededRandom`, `smoothstep`, `enterExit`, `setTransform`,
`drawPath`, `countTo`, and ease functions. Prefer `outCubic`, `outExpo`, or the
critically damped `spring`; `outBack` is a rare playful exception, not a house
style.

## Hard safety and determinism rules

- No `Date`, wall-clock reads, `Math.random`, timers, `requestAnimationFrame`,
  fetch/network calls, workers, storage, dynamic import, `eval`, or `Function`.
- No remote URLs or runtime dependencies. Freeze media locally first.
- No CSS self-playing motion. The renderer seeks to an exact timestamp.
- No conflicting transforms on the same element. Put cue motion on a wrapper
  and scene-specific internal motion on a child.
- No invented facts or statistics. Ground all visible content in the source
  document; label illustrative charts as illustrative.
- Important content stays clear of the bottom ~12–17% when captions are added.
- A repeated seek to timestamp T must produce identical pixels.

## Production workflow

1. Read the owned document via `GET /api/v1/docs/:id` and extract the teaching
   truth: audience, confusion, thesis, 3–6 mechanisms, evidence, landing.
2. Write `BRIEF.md`, locked `SCRIPT.md`, `STORYBOARD.md`, and `design.md`.
   For multi-scene explainers, apply `video-scene-craft.md`.
3. Produce final voiceover and exact timings. Real audio duration wins.
4. Author one scene module at a time. Each storyboard cue becomes a manifest
   cue and one or more scene-owned target IDs.
5. Build and validate:

   ```bash
   <skill-root>/scripts/video.sh build ./video-project
   <skill-root>/scripts/video.sh check ./video-project
   ```

6. Run the visual audit:

   ```bash
   <skill-root>/scripts/video.sh audit ./video-project
   ```

   Inspect `quality/contact-sheet.png`, not just the score. Fix clipped type,
   empty frames, repeated layouts, weak diagrams, early reveals, unreadable
   labels, and any cue whose visual is not the phrase currently spoken. Re-run
   until clean.

7. Render a local final and watch it with sound from start to finish:

   ```bash
   <skill-root>/scripts/video.sh render ./video-project \
     --output ./video-project/final.mp4
   ```

8. Publish and embed only after the watched final passes:

   ```bash
   <skill-root>/scripts/video.sh publish ./video-project \
     --document <document-id> \
     --prompt "Explain the document with cue-synced diagrams" \
     --provider codex --quality high
   ```

The publish command repeats validation and the quality gate, renders, uploads
the MP4/poster directly to storage, and calls the completion endpoint. Verify
`video_url`, `poster_url`, and `inserted_region_key`.

The wrapper uses `HTMLDOCS_VIDEO_REPO`, the current workspace, or
`~/projects/html-docs`; otherwise it runs the published
`@html-docs/html-video` package.
