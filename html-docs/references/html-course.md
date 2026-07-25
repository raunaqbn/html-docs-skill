# Source-grounded HTML Docs courses

Use this reference for curricula, training, onboarding, multi-lesson
explanations, and learning sites.

## Required outcome

Produce:

- Portable `CourseProject v1`.
- Versioned source snapshot and evidence graph.
- Course homepage and cumulative module map.
- Rich lesson pages.
- One explanatory `VideoProject v2` for each lesson that benefits from motion.
- Narration, word timings, captions, transcript, and chapters.
- Two to four grounded checks per lesson.
- Progress state and source citations.
- Quality reports and contact sheets.
- Private HTML Docs learning-site preview.
- Short course trailer after lessons pass.

Target four-to-ten-minute lesson videos. Split narration above roughly 1,500
spoken words at a conceptual boundary. Do not impose a course-wide duration
limit.

## Portable project

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
      assets/
      scenes/
      quality/
      renders/
  publish-manifest.json
```

## Design the curriculum

1. Define audience, prerequisites, confusion gaps, and desired mastery.
2. Extract candidate concepts and dependencies from evidence.
3. Reorganize them into a teaching sequence.
4. Give each module one cumulative capability.
5. Give each lesson two to four observable objectives.
6. Record prerequisites, evidence IDs, and source dependencies.
7. End modules with application or synthesis rather than repetition.

Do not mirror file order, page order, or paper sections unless that is also the
best learning order.

## Pair page and video

Derive both from one lesson model:

- The page is detailed, searchable, citeable, and collaborative.
- The video establishes the core mental model through voice, motion, examples,
  and visual causality.
- The transcript connects them.
- Diagrams may share a design language, but prose and narration should not be
  duplicates.

Embed the stable live player in the lesson page and keep MP4 fallback.

## Ground checks

Create two to four checks per lesson. Each check includes:

- Stable ID.
- Prompt.
- Choices or expected response.
- Correct answer.
- Explanation.
- Evidence IDs.

Test the objective, not trivia about wording. Never invent an answer that is not
supported by the evidence graph.

## Shared design system

Write one `design.md` for:

- Type roles and scale.
- Dominant color and semantic colors.
- Diagram shapes and connectors.
- Caption skin.
- Motion tempo.
- Layout families.
- Course-page components.
- Accessibility and responsive rules.

Vary framing between lessons while keeping entities and semantic colors stable.

## Build workflow

```bash
<skill-root>/scripts/video.sh course init <source> \
  --output ./course-project --title "Course title"
```

Replace the scaffold completely. Then:

```bash
<skill-root>/scripts/video.sh course build ./course-project
<skill-root>/scripts/video.sh course audit ./course-project
<skill-root>/scripts/video.sh course preview ./course-project
<skill-root>/scripts/video.sh course publish ./course-project
```

`publish` creates a private preview unless an explicit visibility is provided.
Do not use `--visibility unlisted` or `public` without user authorization.

## Course audit

Require:

- Every substantive claim and answer has evidence.
- Every lesson has a clear teaching job.
- Objectives match lesson content and checks.
- Each narrated video passes word/cue/scene ownership.
- Caption and visual safe areas remain clear.
- Pages work on mobile and keyboard.
- Navigation reflects dependencies and progress.
- No missing lesson assets or broken player embeds.
- Full sound-on video review and contact-sheet inspection.

Generate the trailer only after all lesson audits pass.

## Source refresh

```bash
<skill-root>/scripts/video.sh course diff ./course-project
<skill-root>/scripts/video.sh course refresh ./course-project
```

Use stored dependencies to mark lessons unchanged, stale, or conflicted.
Regenerate only stale pages, narration segments, scenes, and checks. Preserve
overrides with surviving semantic IDs. Resolve removed-target conflicts in
Studio. Produce a new private version and require explicit publication.
