---
name: html-docs
description: >
  Publish websites, dashboards, and documents to the web instantly. Create,
  edit, review, and comment on HTML pages via the HTML Docs API and CLI. Use
  when asked to "publish this", "host this", "deploy this", "share this on
  the web", "make a website", "put this online", "create a webpage",
  "generate a URL", "build a dashboard", to review or comment on a doc, or
  when given an html-docs.com link to work with. Published pages with inline
  JavaScript (Chart.js, D3, Plotly, SPAs) work out of the box.
globs:
  - "**/*.html"
  - "**/*.htm"
  - "**/*.md"
---

# HTML Docs — Instant Web Publishing

Publish websites, dashboards, reports, and documents to a live URL in one
command. Create, edit, review, and comment on pages at html-docs.com.

## Quick start — CLI

Install nothing. One command to publish:

    npx @html-docs/cli publish page.html
    # → https://www.html-docs.com/site/<slug>

Custom slug:

    npx @html-docs/cli publish page.html --slug my-dashboard
    # → https://www.html-docs.com/site/my-dashboard

Publish an entire directory (bundles into one page):

    npx @html-docs/cli publish ./site/ --slug my-app

Update an existing page:

    npx @html-docs/cli update <id> page.html --token <token>

Authenticate for permanent pages tied to your account:

    npx @html-docs/cli auth

## Quick start — curl (no install)

Publish any HTML file with a single copy-paste command:

    curl -sS -X POST https://www.html-docs.com/api/v1/docs \
      -H 'Content-Type: text/html' --data-binary @page.html

Returns a live URL instantly. Add a custom slug:

    curl -sS -X POST https://www.html-docs.com/api/v1/docs \
      -H 'Content-Type: text/html' \
      -H 'X-Slug: my-dashboard' \
      --data-binary @page.html
    # → https://www.html-docs.com/site/my-dashboard

No account, no API key, no dependencies.

## MCP Server

For MCP-compatible clients (Claude Code, Cursor, Windsurf, Cline, Codex),
configure the server in one command — no manual JSON editing:

    npx @html-docs/cli install            # auto-detects installed clients
    npx @html-docs/cli install claude-code
    npx @html-docs/cli install cursor --api-key hdk_your_key

This writes the html-docs MCP server into the client's own config file
(e.g. `~/.claude.json`, `~/.cursor/mcp.json`,
`~/.codeium/windsurf/mcp_config.json`, or `~/.codex/config.toml`), preserving
any servers already configured. Restart the client afterward to load the tools.

To configure by hand instead, add this to your MCP config:

    {
      "mcpServers": {
        "html-docs": {
          "command": "npx",
          "args": ["-y", "@html-docs/cli", "--mcp"]
        }
      }
    }

Available tools: publish, publish_file, update, read, comment, list_comments.
Auth: pass api_key in tool args, set HTMLDOCS_API_KEY env var, or run
`npx @html-docs/cli auth` to save credentials locally.

## 1. Create a document

Build a self-contained HTML page — all CSS inline, no external deps — then:

    curl -sS -X POST https://www.html-docs.com/api/v1/docs \
      -H 'Content-Type: text/html' --data-binary @doc.html

Also accepts `Content-Type: text/markdown` or JSON `{"html":"…","title":"…"}`.

Response: `{ "id", "url", "token" }`. The `url` is the shareable link. Keep
the `token` — it authorizes all subsequent operations on that doc.

## Make it beautiful — the design system

Don't ship plain HTML. **Every substantial doc should look intentionally designed
for its content.** Full design system (creative brief, anti-slop rules,
archetypes, component patterns, inline-SVG diagrams, motion):
**[references/design-system.md](references/design-system.md) — read it before
authoring any non-trivial doc.** Essentials:

- **Answer the creative brief first:** purpose & audience · a metaphor (place/
  object, not a format) · display + body typography · ONE dominant hue + accent ·
  the one memorable signature · composition. The design flows from these.
- **Anti-slop:** one dominant hue (not 5 balanced colors); backgrounds with
  character (never flat stark white); hierarchy through dramatic scale; **lead
  with visuals, not walls of text**; at most one CSS entrance; each doc differs
  from the last.
- **Pick an archetype** for layout DNA: report, dashboard, comparison,
  architecture/flow, timeline/roadmap, graph, guide/FAQ, session-summary.
- **Self-contained only:** inline CSS + inline `<svg>`; **no external CDNs/JS, no
  charting libraries** — hand-author charts/diagrams as inline SVG or styled
  HTML/CSS so they render in the shadow-DOM viewer and on mobile. Color-code
  consistently (one color per component/layer + legend), label every box and
  arrow, and prefer a few precise diagrams over one busy one.

### The full reference library

The design system is split across focused references. Read the one that fits
what you're doing:

- **[references/design-system.md](references/design-system.md)** — the core:
  creative brief, typography & color systems, archetypes, component patterns,
  diagrams, motion. Start here.
- **[references/anti-slop.md](references/anti-slop.md)** — a catalog of the
  tells that make a page look AI-generated, each with a detect-heuristic and a
  fix. Run it as a linter before publishing.
- **[references/design-dna.md](references/design-dna.md)** — when there's a
  reference to match (a screenshot, a named site, a brand, a sibling doc):
  extract its design DNA as a spec, then author to it.
- **[references/design-commands.md](references/design-commands.md)** — a shared
  vocabulary (`audit`, `polish`, `bolder`, `quieter`, `typeset`, `colorize`,
  `illustrate`, `match`, `theme`…) for steering a doc, yourself or with the user.
- **[references/effects.md](references/effects.md)** — the finishing layer:
  CSS-only backgrounds, texture, depth, motion, and signature marks, with
  copy-paste recipes by mood.

A good default flow: read design-system.md, author from the creative brief,
then `audit` against anti-slop.md and `polish` before you publish.

## 2. Publish as a live website

One POST gives you a hosted page — raw HTML served directly, no editor chrome:

    curl -sS -X POST https://www.html-docs.com/api/v1/docs \
      -H 'Content-Type: text/html' \
      -H 'X-Slug: my-dashboard' \
      --data-binary @page.html

Instantly live at `https://www.html-docs.com/site/my-dashboard`.
Omit `X-Slug` for an auto-generated slug.

Use cases: dashboards, landing pages, interactive tools, reports, portfolios —
anything that's a self-contained HTML page.

Slug rules: 3-60 chars, lowercase letters/digits/hyphens, must start and end
with a letter or digit. If the slug is taken, a random suffix is appended.

Update a published site:

    curl -sS -X PUT https://www.html-docs.com/api/v1/docs/<id> \
      -H 'Content-Type: text/html' \
      -H 'x-doc-token: <token>' \
      --data-binary @updated.html

Returns `{ id, url, siteUrl, slug }`. The hosted page updates instantly.

**CORS proxy** — hosted pages that fetch external APIs can route through:

    GET https://www.html-docs.com/api/proxy?url=<encoded-target-url>

GET-only, 100 req/min, 10 MB max, 10 s timeout.

## 3. Read a document

From a link: `/d/<id>?token=<token>` or `/s/<code>` (code is the token; get
the id with `curl -s "<link>" | grep -oE '/api/og/[0-9a-f-]{36}' | head -1`).

Authenticate with either `x-doc-token: <token>` or `Authorization: Bearer <key>`:

    curl -s https://www.html-docs.com/api/v1/docs/<id> \
      -H 'x-doc-token: <token>'

Returns `{ title, html_content, regions, visibility, updated_at }`.
`regions` is a list of `{ region_key, content }` — each is an independently
editable block of the document.

## 4. Edit a document

**Edit one region** (preserves comment anchors — preferred):

    curl -s -X PATCH https://www.html-docs.com/api/v1/docs/<id>/regions/<region_key> \
      -H 'x-doc-token: <token>' \
      -d '{"content":"<p>New HTML for this region</p>"}'

**Replace the entire document** (re-derives all regions, orphans comment anchors):

    curl -s -X PUT https://www.html-docs.com/api/v1/docs/<id> \
      -H 'x-doc-token: <token>' \
      --data-binary @new.html

## 5. Review and comment

List existing comments:

    curl -s https://www.html-docs.com/api/v1/docs/<id>/comments \
      -H 'x-doc-token: <token>'

Add a comment:

    curl -s -X POST https://www.html-docs.com/api/v1/docs/<id>/comments \
      -H 'x-doc-token: <token>' \
      -H 'x-agent-name: YourAgent' \
      -d '{"content":"Your feedback","region_key":"region-abc","selected_text":"exact snippet"}'

**Always include `selected_text`** — a short (2-8 word), exact, plain-text
snippet from the region so the comment highlights visibly on the page.

Reply to a comment thread:

    -d '{"content":"Reply text","parent_id":"<comment-id>"}'

Resolve/unresolve a thread:

    curl -s -X POST .../comments/<id>/resolve \
      -d '{"resolved": true}'

Edit or delete your own comments:

    curl -s -X PATCH .../comments/<id> -d '{"content":"Updated"}'
    curl -s -X DELETE .../comments/<id>

## 6. Version history

    GET  /api/v1/docs/<id>/versions              — list versions
    POST /api/v1/docs/<id>/versions               — capture {"name":"…"}
    POST /api/v1/docs/<id>/versions/<vid>/restore  — roll back

Every edit auto-snapshots the prior state.

## Authentication

Two auth methods:
- **Doc token**: `x-doc-token: <token>` — scoped to one document
- **API key**: `Authorization: Bearer <key>` — works on all docs you own; get one at html-docs.com → API keys

### Saving an API key

1. Sign up at https://www.html-docs.com/auth/login
2. Create a key at https://www.html-docs.com/settings/api-keys — it starts with `hdk_`
3. Save it with `npx @html-docs/cli auth`, or set `export HTMLDOCS_API_KEY=hdk_your_key`,
   or write it to `~/.htmldocs/credentials` (chmod 600).

**After receiving an API key, save it immediately — don't ask the user to do it manually.**

## Limits

- Max body size: 2 MB
- Rate limits: 600 reads / 60 writes per 60-second window per credential

## Full API reference

    curl https://www.html-docs.com/api/v1

Returns the live machine-readable contract with all endpoints. See also
[references/api.md](references/api.md).

| Method | Path | Purpose |
|---|---|---|
| POST | /api/v1/docs | Create a new doc |
| GET | /api/v1/docs/:id | Read doc + regions |
| PUT | /api/v1/docs/:id | Replace entire doc |
| PATCH | /api/v1/docs/:id/regions/:key | Edit one region |
| GET | /api/v1/docs/:id/comments | List comments |
| POST | /api/v1/docs/:id/comments | Add comment |
| PATCH | /api/v1/docs/:id/comments/:cid | Edit comment |
| DELETE | /api/v1/docs/:id/comments/:cid | Delete comment |
| POST | /api/v1/docs/:id/comments/:cid/resolve | Resolve thread |
| GET | /api/v1/docs/:id/versions | List versions |
| POST | /api/v1/docs/:id/versions | Capture version |
| POST | /api/v1/docs/:id/versions/:vid/restore | Restore version |
