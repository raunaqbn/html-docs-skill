# HTML Docs Player

`@html-docs/player` registers a small `<html-docs-video>` web component. It
embeds the live HTML Docs player when a stable share code is present and keeps
a native `<video>` fallback for raw HTML clients.

```html
<script type="module">
  import '@html-docs/player'
</script>

<html-docs-video
  share="a1b2c3d4e5"
  src="https://cdn.example.com/fallback.mp4"
  poster="https://cdn.example.com/poster.png"
  title="How deterministic HTML video works"
></html-docs-video>
```

The hosted player supplies deterministic seeking, chapters, captions,
transcript search, playback speed, fullscreen, keyboard controls, and MP4
download. The element is dependency-free and safe to use in ordinary HTML.
