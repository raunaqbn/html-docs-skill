---
name: html-docs
description: >
  Turn a folder, codebase, website, HTML Docs link, PDF, document, pasted
  material, or research topic into a polished HTML document, deterministic
  narrated explainer video, combined document-and-video explanation, or
  source-grounded learning course. Also publish, edit, review, comment on, and
  share HTML pages at html-docs.com. Use when asked to explain, teach, document,
  visualize, publish, host, create a course, generate an HTML video, or work
  with an html-docs.com URL.
---

# HTML Docs

Create the clearest useful explanation of the user’s source. Use the active
Codex or Claude session to research, write, design, and author the artifacts.
Use the local CLI only to normalize sources, compile, validate, render,
synchronize, and publish. Never invoke a hidden authoring model.

## Choose the output

Resolve an explicit user request first. Otherwise use `auto`:

| Mode | Choose when | Deliver |
|---|---|---|
| `document` | Detail, scanning, reference, data, or collaboration matters | Designed responsive HTML document |
| `video` | Motion, sequence, mechanism, or narration is the main value | Captioned deterministic HTML video |
| `document-video` | A focused subject benefits from both explanation and reference | Rich document with embedded live video |
| `course` | The source has several learning outcomes or the user asks for training | Learning site with modules, lesson pages, videos, checks, and progress |
| `auto` | The user leaves the format open | `document-video` for one focused outcome; `course` for several cumulative outcomes |

State the chosen mode in one short working update, then continue. Do not stop
for storyboard or voice approval unless the user requests an approval gate.
Finish automatic work as a private preview. Publish publicly or unlisted only
after explicit instruction.

## Start from any source

Classify the input before authoring:

- HTML Docs document or folder: read it through the API.
- Local document, PDF, HTML, Markdown, or text: recover its structure and facts.
- Directory or Git repository: respect ignore rules; exclude credentials,
  dependencies, build output, binaries, and VCS internals.
- URL: capture the requested page. For a site-level request, crawl same-origin
  links to depth two and at most 100 pages unless the user sets another bound.
- Research topic: perform deep research with primary and authoritative sources.
  Freeze a source manifest before writing.
- Pasted material: preserve it as a source record rather than treating it as
  unsupported background knowledge.

Read [references/source-grounding.md](references/source-grounding.md) for source
normalization, research, privacy, evidence IDs, and refresh rules.

## Universal production loop

1. **Define mastery.** Identify the audience, prerequisites, confusion gap,
   desired capability, thesis, mechanism, evidence, and limits.
2. **Ground claims.** Create stable source/evidence records. Every substantive
   claim and knowledge-check answer must cite evidence.
3. **Design the explanation.** Build a cumulative teaching spine. Do not follow
   source order when another sequence teaches better.
4. **Specify the learning experience.** For a course, define the learner
   contract, demonstrated mastery states, assessment seams, dependencies, and
   vertical production slices before authoring.
5. **Choose a visual language.** Set typography, dominant color, contrast,
   diagram grammar, layout rhythm, and one memorable visual signature.
6. **Author the selected outputs.** Derive the page and video from the same
   lesson/evidence model without duplicating them: the page is the reference;
   the video teaches the mental model.
7. **Audit.** Check facts, citations, readability, responsive behavior,
   accessibility, visual quality, narration coverage, cue ownership, captions,
   deterministic seeking, and contact sheets.
8. **Refine until clean.** Fix every failing audit and every visibly weak scene.
9. **Publish privately.** Return the private document/course link and the stable
   video player link. Mention raw MP4 only as a fallback or requested download.

## Document workflow

Read [references/design-system.md](references/design-system.md) before any
substantial document. Use [references/anti-slop.md](references/anti-slop.md) as
the final visual linter. Use inline CSS and inline SVG; freeze assets locally.

Publish:

```bash
npx @html-docs/cli publish page.html
npx @html-docs/cli publish ./site --slug my-site
```

Authenticate owned work once:

```bash
npx @html-docs/cli auth
```

Read [references/api.md](references/api.md) when editing regions, commenting,
versioning, or using document APIs. Read [references/pdf.md](references/pdf.md)
for PDF import or export.

## Video workflow

Read both:

- [references/html-video.md](references/html-video.md) for project format,
  narration, timing, captions, compilation, rendering, and publication.
- [references/video-scene-craft.md](references/video-scene-craft.md) for
  explanatory scene grammar, layout rhythm, cue choreography, and visual review.

For narrated work, render captions in the composition itself as a karaoke rail:
keep the phrase readable while the exact word currently spoken receives the
design-matched highlight. WebVTT/SRT metadata alone is not a finished caption
system.

For a narrated explainer:

```bash
<skill-root>/scripts/video.sh build ./video-project
<skill-root>/scripts/video.sh check ./video-project
<skill-root>/scripts/video.sh audit ./video-project
<skill-root>/scripts/video.sh render ./video-project --output ./final.mp4
```

For a document-linked video:

```bash
<skill-root>/scripts/video.sh publish ./video-project \
  --document <document-id> \
  --prompt "Teach the central mechanism clearly" \
  --provider codex
```

For a standalone video, omit `--document` after the standalone video API is
available in the installed CLI release. Always prefer the stable `/v/<code>`
player link over the raw storage URL.

## Course workflow

Read all three:

- [references/html-course.md](references/html-course.md) for portable course
  artifacts, paired pages/videos, checks, publication, and refresh.
- [references/learning-design.md](references/learning-design.md) for the learner
  contract, mastery evidence, retrieval, feedback, adaptation, and reusable
  teaching components.
- [references/course-specification.md](references/course-specification.md) for
  decision-rich course specs, vertical production slices, dependencies,
  validation seams, and large-project uncertainty.

Then:

```bash
<skill-root>/scripts/video.sh course init <source> \
  --output ./course-project --title "Course title"
<skill-root>/scripts/video.sh course build ./course-project
<skill-root>/scripts/video.sh course audit ./course-project
<skill-root>/scripts/video.sh course preview ./course-project
<skill-root>/scripts/video.sh course publish ./course-project
```

The scaffold is not the course. Replace it with a real evidence graph, course
specification, learner model, course map, vertical lesson slices, lesson pages,
locked narration, cue-directed storyboards, semantic scene modules, diagnostic
checks, captions, and source dependencies before building.

For changed sources:

```bash
<skill-root>/scripts/video.sh course diff ./course-project
<skill-root>/scripts/video.sh course refresh ./course-project
```

Regenerate only affected lessons, preserve surviving semantic overrides, audit
again, and create a new private version. Never replace the published version
automatically.

## Guided Studio

Use Studio after a private version exists:

```bash
<skill-root>/scripts/video.sh studio context <video-id>
<skill-root>/scripts/video.sh studio requests <video-id>
```

Treat a Studio selection as precise source context: composition version, scene,
timestamp, semantic element ID, bounds, text, evidence, and surrounding cue.
Apply direct layout/text/color changes as structured overrides. Apply narration,
voice, evidence, or generative scene changes in the local project, audit, then
push a new immutable version.

## Publication and authentication

- Anonymous documents can be published with `curl` or the CLI.
- Owned videos, courses, edits, and durable publication require
  `HTMLDOCS_API_KEY` or credentials saved by `npx @html-docs/cli auth`.
- Keep provider keys local. Never upload TTS keys or put them in a project
  bundle.
- Keep source projects and diagnostics private. Only published runtime bundles,
  posters, and media should be public.

Machine-readable API:

```bash
curl https://www.html-docs.com/api/v1
```

Human documentation:

- https://www.html-docs.com/agents
- https://www.html-docs.com/developers
- https://www.html-docs.com/showcase
