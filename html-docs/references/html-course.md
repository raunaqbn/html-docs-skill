# Source-grounded HTML Docs courses

Use this reference whenever the user wants a course, curriculum, learning site,
training experience, or a set of lesson videos from source material. The active
Codex or Claude session is the curriculum designer, writer, director, and scene
author. `@html-docs/html-video` is the open deterministic compiler, renderer,
sync client, and course-project utility. HTML Docs hosts private projects,
Guided Studio, live players, and learning sites.

Do not invoke or depend on HyperFrames. The production behaviors worth keeping
are specified here and in `html-video.md` / `video-scene-craft.md`.

## Non-negotiable outcome

Given an HTML Docs document/folder, URL, PDF, local files, pasted content, or a
codebase, automatically produce:

- A portable `CourseProject v1` directory.
- One evidence graph and versioned source snapshot.
- A course homepage and cumulative module map.
- Rich reference prose and diagrams for every lesson.
- One four-to-ten-minute explanatory VideoProject v2 per lesson.
- Final voiceover, exact word timings, branded captions, and transcript.
- Two-to-four grounded knowledge checks per lesson.
- Contact sheets, quality reports, sound-on review, and a course trailer.
- A private HTML Docs preview with progress and Guided Studio.

No global course-duration limit exists. If one lesson exceeds roughly 1,500
spoken words, split it at a conceptual boundary. Generate the 60–120 second
trailer only after the lessons pass.

## Portable shape

```text
course-project/
  course.project.json
  COURSE.md
  design.md
  source/
    manifest.json
    evidence.jsonl
    fingerprints.json
  lessons/
    01-foundations/
      lesson.json
      page.html
      BRIEF.md
      SCRIPT.md
      STORYBOARD.md
      video.project.json
      audio/
        request.json
        manifest.json
        pronunciations.json
        segments/
        master.wav
        words.json
        captions.json
      scenes/
      quality/
      renders/
  publish-manifest.json
```

Initialize with:

```bash
<skill-root>/scripts/video.sh course init <source> \
  --output ./course-project --title "Course title"
```

This command normalizes source and creates a valid scaffold. It does not call a
model. Replace the scaffold with the real course before claiming completion.

## Source normalization and privacy

The source snapshot is the truth boundary.

- Preserve canonical URI, checksum, heading, page/line range, extracted text,
  and metadata for every usable source.
- Every substantive lesson claim, diagram fact, and check answer cites one or
  more evidence IDs.
- Reorganize for learning. Do not reproduce source section order by default.
- For codebases, respect `.gitignore`; exclude secrets, environment files,
  keys, VCS internals, dependencies, binaries, generated output, and caches.
- Capture Git commit and file hashes when present.
- Upload only evidence excerpts actually used unless the user explicitly opts
  into full-source upload.
- Do not expose local paths/line links publicly unless they are safe.
- Treat URLs as unstable snapshots. Record retrieval date and checksum.
- Extract PDFs/documents into evidence with page references before outlining.
- Never invent a missing mechanism, number, citation, or correct answer.

## Design the course before the lessons

Write `COURSE.md` with:

1. Audience and assumed prerequisites.
2. Confusion gaps and desired mastery.
3. One course thesis.
4. Learning outcomes phrased as observable abilities.
5. Module dependencies and lesson order.
6. The cumulative mental model learners assemble.
7. What is deliberately omitted or deferred.

The course spine should teach dependencies, not mirror a table of contents.
Each lesson has one core transformation: what the learner can understand or do
after it that they could not before.

Rich page prose and video share evidence and objectives but are not duplicates:

- The page is the detailed, cited reference: definitions, caveats, diagrams,
  code, transcript, sources, and checks.
- The video teaches the core mental model visually and sequentially.
- The check proves the objective, not recall of incidental narration wording.

## Global design system

Write one `design.md` before scene work:

- Course metaphor/visual world.
- Dominant hue, one accent, semantic colors, contrast rules.
- Display/body/mono type roles and size floor.
- Line weight, corner language, icon language, and diagram grammar.
- Caption skin and bottom 17% keep-out.
- Layout rhythm across lessons so every film does not use the same template.
- Motion verbs and 2–3 semantically assigned transition types.
- Negative rules specific to this course.

Reuse tokens, not DOM templates. Adjacent lessons should feel like one product
without becoming identical dashboards.

## Lesson artifact contract

For every lesson:

- `lesson.json`: objectives, prerequisites, evidence IDs/dependencies, checks,
  page/video paths, and state.
- `BRIEF.md`: audience state, one teaching job, thesis, evidence, target depth,
  voice profile, and exclusions.
- `SCRIPT.md`: locked spoken text split by scene, plus display text,
  pronunciation entries, and delivery direction.
- `STORYBOARD.md`: direction block and cue-directed scenes.
- `page.html`: complete detailed reference, accessible and responsive.
- `video.project.json`: VideoProject v2 with stable semantic IDs.

Each storyboard scene records:

- Teaching job and source evidence.
- Exact narration.
- Time-coded cue phrases.
- Visual world, framing, focal elements, and structural geometry.
- Cue target IDs, visual verb, and settled state.
- Transition semantics and why the seam has that meaning.

Apply the story spine, layout rhythm, cue ownership, build/develop/settle,
transition semantics, and final visual review from `video-scene-craft.md`.

## Audio and voice

Choose the provider-neutral profile automatically:

- Technical/code: `precise-engineer`.
- Medical, personal, or sensitive: `gentle-guide`.
- General education: `warm-teacher`.
- Motivational practice: `energetic-coach`.
- Explicit user choice always wins.

Auditioning is optional because automatic generation has no approval gate, but
the selected provider mapping must be recorded in `audio/manifest.json`.
Provider credentials remain local and are never uploaded.

Rules:

- Generate scene-sized segments so one lesson change does not regenerate all
  speech.
- Give the TTS neighboring text/context when supported to preserve prosody.
- Maintain separate `spokenText`, `displayText`, pronunciations, and non-spoken
  delivery direction.
- Write phrase-shaped sentences with explicit conceptual pauses.
- Prefer ElevenLabs native timestamp output or HeyGen native word timestamps.
- For Kokoro/custom providers, forced-align final audio to the locked script.
  Unconstrained transcription is never timing truth.
- Add 200 ms pre-roll and 600 ms settled post-roll mechanically.
- Final audio duration owns all scene boundaries. Never time-stretch speech to
  an estimated storyboard.
- Assemble one playback master while preserving scene segments.
- Normalize narration near −16 LUFS with −1 dBTP ceiling and remove boundary
  clicks.
- Background music is off by default. If requested, keep it far below speech
  and duck during narration.
- Back-check script coverage and pronunciation. Regenerate or report anomalies.

## Cue, caption, and visual synchronization

One normalized word track drives everything:

1. Every spoken word belongs to exactly one cue and one scene.
2. Every cue owns one or more same-scene stable `data-hv-id` targets.
3. Targets may exist invisibly before their cue but cannot read as landed.
4. Motion starts at or immediately around its owned phrase.
5. Motion settles after the phrase, then the scene holds.
6. Scene boundaries come from final word timing plus hold budget.
7. Captions derive from the same words and therefore cannot drift.

Caption groups are usually two-to-six words, use punctuation and pauses, and
show one group at a time with active-word highlighting. Export HTML, WebVTT,
and SRT. Captions default on in the live player and rendered MP4; produce a
clean no-caption render only when useful.

## Automatic production loop

Do not stop after generating files. Loop per lesson:

1. Ground: confirm evidence coverage for every claim/check.
2. Direct: lock script and cue storyboard.
3. Voice: generate segments, master, exact words, captions.
4. Author: build semantic scene modules with explanatory visuals.
5. Compile and statically check.
6. Audit and open cue/scene contact sheets.
7. Fix story, framing, cue leaks, clipping, caption clearance, and weak visuals.
8. Render and watch with sound start-to-finish.
9. Fix pronunciation, handoffs, pacing, or late/early visual ownership.
10. Re-run until the lesson passes.

Commands:

```bash
<skill-root>/scripts/video.sh course build ./course-project
<skill-root>/scripts/video.sh course audit ./course-project
<skill-root>/scripts/video.sh course preview ./course-project
```

Minimum final gates:

- Every substantive claim/check is grounded.
- One clear teaching job per scene.
- At least three framing systems per lesson unless a continuous stage is
  intentionally stronger.
- A real explanatory visual in every body scene.
- Build/develop/settle reads at cue samples.
- Zero uncovered words, overlap, missing targets, or scene-crossing cues.
- Captions are readable and clear of important content.
- Contact sheets inspected and full sound-on review completed.

## Private preview, Studio, and publication

Upload only after all local gates:

```bash
<skill-root>/scripts/video.sh course publish ./course-project
```

This creates/updates a private preview. Return its `/courses/<id>` URL. Guided
Studio supports storyboard review, live deterministic playback, scene/cue/
caption lanes, selection context, structured overrides, edit requests, and
version rollback.

When the user creates an edit request:

```bash
<skill-root>/scripts/video.sh studio context <video-id>
<skill-root>/scripts/video.sh studio requests <video-id>
```

Pull context, apply the source change, build/audit/render, and push a new
immutable version. Direct overrides keyed by surviving `data-hv-id` values must
remain in the new project.

Only publish after explicit direction:

```bash
<skill-root>/scripts/video.sh course publish ./course-project --visibility unlisted
# or --visibility public
```

## Source refresh

Run:

```bash
<skill-root>/scripts/video.sh course diff ./course-project
<skill-root>/scripts/video.sh course refresh ./course-project
```

The refresh report identifies added/changed/removed files and dependent
lessons. Regenerate only those pages, audio segments, scenes, and checks.
Preserve overrides whose stable IDs and meaning survive. If a target was
removed or semantically replaced, mark it conflicted for Studio rebase. Push a
new private version and leave the published course untouched until explicitly
republished.
