# Inside the browser rendering pipeline

Mode: `document-video`

```text
Use $html-docs to create a source-grounded document and narrated visual video
about the browser rendering pipeline. Use authoritative standards, explain the
causal path from markup to pixels, distinguish style, layout, paint, and
compositing, and publish a private preview.
```

```bash
html-docs project init https://html.spec.whatwg.org/ \
  --crawl --mode document-video \
  --output ./browser-rendering-pipeline \
  --title "Inside the browser rendering pipeline"
```

The document is the standards reference; the video is a progressively built
mental model rather than a spoken copy of the page.
