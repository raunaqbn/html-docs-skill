# How deterministic HTML video works

Mode: `course`

Source: this repository’s open Producer, Player, and Studio packages.

```text
Use $html-docs to turn this repository into a private course for engineers who
need to understand deterministic HTML video. Cover the source model, timing
contract, audio/caption ownership, browser renderer, Player, and Guided Studio.
Use precise-engineer voice and publish a private preview.
```

Reproduce from the repository root:

```bash
html-docs project init . --mode course \
  --output ./deterministic-html-video-course \
  --title "How deterministic HTML video works" \
  --audience "Engineers building media systems" \
  --voice-profile precise-engineer
```

The public showcase hosts the live Player and rendered fallback. `project.json`
records the intended curriculum and the exact source package dependencies.
