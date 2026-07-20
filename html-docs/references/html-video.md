# Deterministic HTML video

Use this reference when an HTML Docs document needs a generated video. The
current Codex or Claude session is the author. Chromium and FFmpeg run locally;
HTML Docs only validates metadata, issues one-use storage upload tokens, and
inserts the completed `<video>` block.

## Composition contract

Author one JSON file with this shape:

```json
{
  "version": 1,
  "id": "concise-lowercase-id",
  "title": "Human-readable title",
  "width": 1280,
  "height": 720,
  "fps": 30,
  "durationMs": 8000,
  "html": "<section class=\"scene\"><h1>Ideas in motion.</h1></section>",
  "css": ".scene{position:absolute;inset:0} ...",
  "script": "window.__HTML_VIDEO__={renderFrame:function(ctx){...}};",
  "variables": [],
  "assets": [],
  "scenes": [
    { "id": "scene-1", "label": "Opening", "startMs": 0, "durationMs": 8000, "track": 0 }
  ]
}
```

Recommended canvases: landscape `1280x720`, portrait `720x1280`, square
`1080x1080`. Use 30 fps and normally 3–15 seconds. Scene intervals on the same
track must not overlap or extend beyond `durationMs`.

The script must synchronously assign:

```js
window.__HTML_VIDEO__ = {
  renderFrame({ root, timeMs, progress, variables, width, height, durationMs, fps }) {
    // Set every render-critical property from timeMs.
  }
}
```

`renderFrame` must be seek-safe: rendering timestamp T twice, or after seeking
there from different timestamps, must produce identical pixels. Derive all
motion from `timeMs`; never increment state from the previous frame.

Available helpers live on `window.HtmlVideoRuntime`: `clamp`, `lerp`,
`mapRange`, `sceneProgress`, `staggerProgress`, `seededRandom`, and `ease`.

## Hard safety and determinism rules

- No `Date`, `performance.now`, `Math.random`, timers, `requestAnimationFrame`,
  fetch/network calls, workers, storage, dynamic imports, `eval`, or `Function`.
- No `<script>`, iframe, form, link, base, object, or embed markup in `html`.
- No remote URLs or external dependencies. Prefer HTML/CSS shapes and inline
  SVG. Keep `assets` empty unless a frozen local-asset workflow is added.
- No CSS transitions or `@keyframes` for render-critical motion. The local
  renderer seeks by calling `renderFrame`, not by playing a wall clock.
- Keep text concise, readable, and grounded in the document. Do not invent
  facts or statistics.
- Build a strong static composition first, then add purposeful motion. Every
  frame must stay inside the canvas and remain legible at the target aspect.

## Agent workflow

1. Obtain the owned document ID and an account API key. Read the document via
   `GET /api/v1/docs/:id` so the video reflects its real content and styling.
2. Read this reference, choose a beat plan, and author `composition.json`.
3. Resolve the installed skill root (the directory containing `SKILL.md`) and
   run its local renderer wrapper:

   ```bash
   <skill-root>/scripts/video.sh check composition.json
   <skill-root>/scripts/video.sh snapshot composition.json --at 0,1500,7999
   ```

4. Inspect the snapshots. Correct clipping, weak hierarchy, illegible copy, or
   timing problems before rendering.
5. Publish through the same wrapper:

   ```bash
   <skill-root>/scripts/video.sh publish composition.json \
     --document <document-id> \
     --prompt "Animate the three most important ideas" \
     --provider codex \
     --quality standard
   ```

   Use `--provider claude` in Claude Code. Optional flags: `--title`, `--after`,
   `--model`, `--output`, `--api-key`, and `--base-url`.

6. The command performs static validation, compares two same-time browser
   captures for determinism, renders every frame, encodes H.264 MP4, uploads the
   MP4/poster directly to storage, and calls the completion endpoint. Verify
   `video_url`, `poster_url`, and `inserted_region_key` in its JSON response.

The wrapper looks for `HTMLDOCS_VIDEO_REPO`, the current workspace, or
`~/projects/html-docs`; otherwise it falls back to the published
`@html-docs/html-video` package.
