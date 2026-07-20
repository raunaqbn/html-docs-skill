# Scene craft for HTML explainers

Read this for every explainer with three or more scenes. It defines the
director's job between source text and scene code. The renderer contract and
exact cue schema live in `html-video.md`.

## Start with understanding, not sections

An input document is an information container. A video is a guided act of
understanding. Do not animate the paragraphs in their original order by
default.

Extract:

- Audience: what the viewer already knows.
- Gap: the question or confusion to resolve.
- Thesis: the one sentence they should remember.
- Spine: the 3–6 mechanisms, steps, or contrasts that prove the thesis.
- Evidence: only source-grounded examples, numbers, and caveats.
- Landing: what to remember, verify, or do next.

Choose one dominant structure:

- Concept: name the idea → reveal its mechanism → land the implication.
- Process: orient → move through ordered steps on a continuous stage → result.
- List: hook → parallel items with a repeatable rhythm → synthesis.
- Story: setup → tension → turn → resolution → general lesson.

One scene has one job. The body normally needs 3–6 scenes; one body slide does
not teach a mechanism.

## Storyboard every scene as timed cues

Write the locked narration as short clauses that can cue visible events. Then
design one time window per clause:

```md
## Scene 4 — The protective prephase

Job: turn "prephase" from a delay into a risk-reduction mechanism.
Layout: split — disease burden left, two-step dose sequence right.
Narration: "First, lower the burden. Then protect against tumor lysis."

- Cue A: "First, lower the burden."
  Visual: clustered cells visibly contract; risk meter falls.
- Cue B: "Then protect against tumor lysis."
  Visual: shield connects to the two medication steps.
- Hold: settled cause-and-effect diagram; no decorative drift.
```

The cue is not a caption marker. It is visual ownership. If a phrase names a
new mechanism, the corresponding visual arrives during that phrase. Do not
show the final mechanism diagram while the narration is still defining the
problem.

## Design a world, not a card layout

Before CSS, state the scene's experiential concept in two sentences. For
example: "The viewer watches six stations light up along a treatment route. The
route turns an intimidating duration into a finite, legible rhythm." That is a
directing idea. "Six cards in a row" is merely implementation.

Every body scene needs:

- A focal visual occupying roughly 40–60% of the usable frame.
- At least three depth roles: background field, explanatory stage, foreground
  labels/emphasis.
- Two focal moments: where the eye lands first and where the cue leads it next.
- Structural geometry—paths, dividers, axes, zones, or connectors—that gives
  motion a meaningful route.
- Short on-screen copy. Narration already carries complete sentences.

Useful scene worlds:

- Causal chain: nodes and directional edges build one consequence at a time.
- Mechanism map: tools or inputs converge on a central subject.
- Progressive diagram: one stable stage gains a new layer per cue.
- Timeline/stations: an ordered path makes duration or sequence tangible.
- Before/after split: one variable visibly changes while context stays fixed.
- Worked example: values and shapes assemble in the order used to reason.
- Data-viz: number + graphical quantity change together; label illustrative
  values honestly.
- Kinetic type: a term, number, or contrast is the subject, not a floating H1.

Avoid generic bokeh, decorative floating circles, small centered web cards,
purple-blue "AI" gradients, browser chrome, and a repeated dashboard template.

## Layout rhythm across the whole video

Use at least three framings and avoid the same framing twice in a row:

- Centered: concept naming, climax, final synthesis.
- Asymmetric 60/40: diagram plus annotation rail.
- Split: comparison or two related tests.
- Diagram: network, causal map, or mechanism.
- Timeline/full-width: sequence, stages, or a route.
- Triptych: a real rule of three.
- Layered: an atmospheric opening with foreground subject and environmental
  depth.

Name the rhythm before building, such as:

`hook → orient → build → build → breather → dense mechanism → warning → land`

Held scenes are useful. Uniform busyness is not. Allocate one or two deliberate
breathers; all other scenes should develop with the spoken cues.

## Motion grammar

Motion is a verb plus a purpose:

- Draw: reveals a route, relationship, outline, or threshold.
- Assemble: turns parts into a system.
- Fill/count: makes quantity legible.
- Push/zoom: changes the level of explanation.
- Wipe: uncovers a comparison or measured region.
- Lock: confirms a result or completion.
- Scatter/converge: shows many inputs becoming one mechanism.
- Highlight: points to the currently spoken term.

Use 2–4 coordinated moves per scene, not one independent motion per element.
The element moving first is read as most important.

### Build, develop, settle

- Entry: only the first spoken idea appears. Offset it slightly from the cut.
- Development: later pieces arrive across the scene, especially its back half,
  on their narration cues.
- Settle: the result holds long enough to read. Prefer stillness to a fake
  breathing loop or an uncomfortable slow camera push.

Entrances should generally decelerate smoothly (`outCubic`/`outExpo`). Exits,
when truly needed in the final scene, are quicker. Avoid bounce and overshoot
unless the brief is explicitly playful.

Transitions communicate meaning:

- Cut: a new register or alert.
- Crossfade: continuation or a soft layer change.
- Push: an ordered next step on a consistent stage.
- Zoom: move into a mechanism or out to the implication.

Pick 2–3 transition types for the video and repeat them deliberately. A
different novelty transition on every cut destroys the motion grammar.

## Continuity without a monolith

Scene modules can still feel like one film:

- Reuse design tokens, line weights, label shapes, and type roles.
- Carry a meaningful object across adjacent scenes when the explanation calls
  for it: a route, one cell, a cursor, a formula, or a progress rail.
- Match the outgoing direction and velocity to the incoming move.
- Keep ordered steps on one visual stage when possible; only cut when the level
  of explanation changes.

Do not reuse identical DOM structure and merely swap text. Continuity means a
shared visual language, not one template.

## Audio and captions

The voiceover is final before scene durations are final. Provider choice is
secondary to three requirements: clear pronunciation, acceptable voice
quality, and exact timing metadata.

- Local-first: Kokoro is a strong small open-source TTS default when installed.
- Higher consistency: a hosted TTS provider may be used when the user permits
  it and voice quality matters more than offline operation.
- Timing: use native word timestamps when supplied; otherwise align the final
  audio locally. Never infer cue timing from character counts for a final.

Captions are a separate overlay track. Do not repeat full narration sentences
as scene copy. Reserve the bottom 12–17% if captions will be added.

## Contact-sheet review

The audit score is a gate, not taste. Open the generated contact sheet and ask:

- Can I identify each scene's teaching job without reading tiny text?
- Are adjacent frames compositionally different but stylistically related?
- Does each body scene have a real diagram or visual mechanism?
- Is there a clear before/during/after progression within each scene?
- Does the frame shown during every cue depict the phrase being spoken then?
- Are important labels large enough for the target resolution?
- Are opening and closing frames as designed as the body, not empty title
  slides?

Then watch the rendered MP4 with sound. A contact sheet cannot reveal a late
voiceover handoff, rushed read, awkward pause, or poor pronunciation. Fix those
and run the loop again before publishing.
