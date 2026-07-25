# HTML Video

`@html-docs/html-video` is the deterministic rendering core behind HTML Docs' generated-video feature. A language model authors ordinary HTML, CSS, and a small seek-driven JavaScript function. This package validates that source, opens it in an isolated Chromium page, seeks to every frame, and pipes PNG frames into FFmpeg.

The model is the author, not the renderer. The renderer is fully local and open source: Puppeteer/Chromium produces pixels and FFmpeg encodes MP4, WebM, or GIF. A hosted service is optional operational infrastructure, not part of the composition format.

## VideoProject v2

For narrated or multi-scene work, author a project directory instead of one
large JSON string:

```text
video-project/
  video.project.json
  global.css
  audio/voiceover.wav
  audio/words.json
  assets/
  scenes/01-hook.html
  scenes/01-hook.css
  scenes/01-hook.js
```

Version-1 projects remain readable. Version 2 adds stable `data-html-video-id`
identifiers, scene teaching jobs, source evidence, visual verbs, settled states,
manual overrides, generation hashes, word tracks, captions, chapters, and
provider-neutral voice metadata. It compiles to the same deterministic runtime,
so existing compositions and share links keep working.

The final audio track is timing authority. One normalized word track drives
scene boundaries, cue ownership, active-word captions, WebVTT/SRT, and Guided
Studio. Builds fail when a spoken word is uncovered, a cue crosses scenes, a
visual target is missing, or captions disagree with their owned words.

```bash
html-docs-video build ./video-project
html-docs-video check ./video-project
html-docs-video audit ./video-project
html-docs-video render ./video-project --output ./video-project/final.mp4
```

The package includes curated `warm-teacher`, `precise-engineer`,
`gentle-guide`, and `energetic-coach` profiles; ElevenLabs
character-alignment conversion; HeyGen timing ingestion; caption grouping and
exports; and FFmpeg assembly of scene-sized narration into a click-free
−16 LUFS, −1 dBTP master. Keys and provider voice IDs remain local.

`audit` samples the opening, development, and resolve of every scene plus cue
midpoints. It writes a quality report, individual PNGs, and a contact sheet; it
scores narration ownership, framing diversity, explanatory structure, visible
development, and deterministic seeking. `publish` enforces the same gate.

## Portable source-grounded courses

`CourseProject v1` turns folders, files, or codebases into a resumable course
artifact. Source normalization respects Git ignores and excludes credentials,
dependencies, binaries, and build output. Stable evidence records and file
fingerprints let the agent ground claims and refresh only affected lessons.
New course projects also contain an observable learner contract, canonical
glossary, annotated resource ledger, evidence-state mastery objectives,
diagnostic practice, a decision-rich course specification, and dependency-aware
vertical production slices. Existing `CourseProject v1` bundles remain readable.

```bash
html-docs-video course init ./source --output ./course-project --title "Servo control"
html-docs-video course build ./course-project
html-docs-video course audit ./course-project
html-docs-video course preview ./course-project
html-docs-video course diff ./course-project
html-docs-video course refresh ./course-project
html-docs-video course publish ./course-project
html-docs-video course publish ./course-project --visibility unlisted
```

The CLI never calls a second model. The active Codex or Claude session authors
lesson pages, narration, storyboards, scene modules, and checks. Automatic runs
end as private previews; `--visibility unlisted|public` is explicit.

Course audits verify the learning and production contracts as well as the
render: each adaptive lesson needs mastery success criteria, retrieval, guided
practice, transfer, feedback, diagnostic check metadata, and a real production
slice. Watching a lesson never counts as proof of mastery.

## Composition contract

Every composition is a versioned JSON object with dimensions, frame rate, duration, HTML, CSS, script, scenes, assets, and user-overridable variables. Its script registers one API:

```js
window.__HTML_VIDEO__ = {
  renderFrame({ root, timeMs, progress, variables }) {
    root.querySelector('.title').style.opacity = String(Math.min(1, timeMs / 500))
  },
}
```

Calling `renderFrame` at the same timestamp must always produce the same pixels. Wall clocks, unseeded randomness, timers, network calls, self-playing CSS animations, storage access, and runtime imports are rejected. The app also captures the same timestamp twice and compares the PNG bytes before it starts a full render.

## Local-agent pipeline

1. The owner creates a persistent private production project in the document editor.
2. Codex or Claude reads its queued brief with `html-docs-video studio requests <video-id>` and authors the project. HTML Docs does not call a separate hosted model.
3. Static and browser validation run on the user's computer.
4. Local Chromium captures each frame and local FFmpeg encodes the MP4.
5. The CLI registers the composition and receives one-use Supabase upload tokens from HTML Docs.
6. The MP4 and poster upload directly from the user's computer to Supabase Storage; they never pass through Vercel.
7. Completion inserts a portable `<html-video>` block with nested MP4 fallback; HTML Docs enhances it into the live seek-safe player.
8. Guided Studio adds storyboard cards, a live frame, waveform/cue/caption lanes, stable selection, overrides, edit requests, and rollback.

## Local requirements

- Set `HTML_VIDEO_CHROMIUM_PATH` or `HTML_VIDEO_FFMPEG_PATH` only when automatic binary discovery is unsuitable.
- Set `HTMLDOCS_API_KEY` to an account API key created in HTML Docs settings (or pass `--api-key`).
- The document must be owned by the API-key account.

Run `scripts/sql/html_video.sql`, `scripts/sql/html_video_share_code.sql`, and
`scripts/sql/html_courses.sql`. Rendered media uses the public `doc-videos`
bucket; course sources and diagnostics use the private `course-projects`
bucket.

## CLI development loop

```bash
pnpm --filter @html-docs/html-video cli check fixtures/hello.json
pnpm --filter @html-docs/html-video cli snapshot fixtures/hello.json --at 0,1500,2999
pnpm --filter @html-docs/html-video cli render fixtures/hello.json --output /tmp/hello.mp4
pnpm --filter @html-docs/html-video cli publish fixtures/hello.json \
  --document <document-id> \
  --prompt "Animate the key ideas" \
  --provider codex \
  --voiceover /path/to/narration.aiff \
  --output /tmp/hello.mp4

html-docs-video publish ./video-project \
  --project-id <persistent-video-project-id> \
  --document <document-id> \
  --prompt "Teach the queued lesson"

html-docs-video studio context <video-project-id>
html-docs-video studio requests <video-project-id>
```

After the package is published, agents can use the equivalent portable command:

```bash
npx @html-docs/html-video publish composition.json \
  --document <document-id> \
  --prompt "Animate the key ideas" \
  --provider claude
```

`--voiceover` accepts a local audio file and muxes it into MP4 output. Use
`--replace-region <region-key>` to update an existing generated-video block
instead of inserting another one. Compositions must run for at least 3 seconds.
There is no framework-imposed upper duration limit; narration and media
generation remain local, and long renders are bounded only by the user's
machine, storage, and upload capacity.

The package API exposes the same `loadVideoInput`, `compileVideoProject`,
`validateCompositionStatic`, `auditComposition`, `captureSnapshots`, and
`renderComposition` functions used by the CLI, so rendering can move to a queue
or dedicated worker later without changing stored compositions or document
embeds.
