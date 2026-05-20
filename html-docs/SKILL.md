---
name: html-docs
description: >
  html-docs.com lets agents publish websites, dashboards, and documents to
  live URLs instantly. Use when asked to "publish this", "host this",
  "deploy this", "share this on the web", "make a website", "put this
  online", "create a webpage", "generate a URL", "build a dashboard",
  or "publish to html-docs". Published pages with inline JavaScript
  (Chart.js, D3, Plotly, SPAs) work out of the box.
globs:
  - "**/*.html"
  - "**/*.htm"
  - "**/*.md"
---

# html-docs

**Skill version: 0.1.0**

html-docs.com lets agents publish websites, dashboards, and documents to live
URLs instantly. One API call, one URL, done.

## What you can publish

- HTML documents and reports
- Interactive dashboards with Chart.js, D3, Plotly, or any client-side JS
- Single-page applications (SPAs)
- Static sites (HTML + CSS + JS + images)
- Markdown documents (auto-converted to HTML)
- Any content an agent generates

**Inline `<script>` tags are preserved.** This is the key difference from most
doc platforms — your JavaScript survives the publish pipeline, so dashboards
and interactive content actually work.

## Quick publish

The fastest path — one curl, one URL:

```bash
curl -X POST https://www.html-docs.com/api/v1/docs \
  -H 'Content-Type: text/html' \
  --data-binary @page.html
```

Response:

```json
{
  "id": "doc-uuid",
  "url": "https://www.html-docs.com/site/page-a7k2b9f1",
  "slug": "page-a7k2b9f1",
  "editUrl": "https://www.html-docs.com/s/ab12cd34?present=1",
  "token": "ab12cd34"
}
```

- **`url`** — the hosted page (raw HTML, no editor chrome). Share this.
- **`editUrl`** — the editor view for converting to a collaborative doc.
- **`token`** — keep this for later updates.

## Using the publish script

If you have the skill installed locally:

```bash
./scripts/publish.sh page.html
./scripts/publish.sh ./my-site/           # directory with index.html
./scripts/publish.sh page.html --slug my-custom-slug
```

## Authentication

### Anonymous (zero friction)

No account needed. Just POST your HTML. The page is published immediately
with an auto-generated slug. The `token` in the response lets you update it.

### Authenticated (permanent, owned)

Send an agent API key to create permanent pages that appear in your dashboard:

```bash
curl -X POST https://www.html-docs.com/api/v1/docs \
  -H 'Authorization: Bearer hdk_your_key_here' \
  -H 'Content-Type: text/html' \
  --data-binary @dashboard.html
```

The slug is derived from the document title. Pass `?slug=custom-slug` or
`X-Slug: custom-slug` header to choose your own.

### Getting an API key

1. Sign up at https://www.html-docs.com/auth/login
2. Go to https://www.html-docs.com/settings/api-keys
3. Create a key — it starts with `hdk_`
4. Save it:

```bash
mkdir -p ~/.htmldocs && echo "hdk_your_key" > ~/.htmldocs/credentials && chmod 600 ~/.htmldocs/credentials
```

Or set the environment variable:

```bash
export HTMLDOCS_API_KEY=hdk_your_key
```

## API key storage

The publish script reads the API key from (first match wins):

1. `--api-key <key>` flag (CI only — avoid in interactive use)
2. `$HTMLDOCS_API_KEY` environment variable
3. `~/.htmldocs/credentials` file (recommended)

**After receiving an API key, save it immediately.** Do not ask the user to
do it manually.

## Custom slugs

Choose your own URL:

```bash
# Via query param
curl -X POST 'https://www.html-docs.com/api/v1/docs?slug=my-dashboard' \
  -H 'Content-Type: text/html' --data-binary @dashboard.html

# Via header
curl -X POST https://www.html-docs.com/api/v1/docs \
  -H 'X-Slug: my-dashboard' \
  -H 'Content-Type: text/html' --data-binary @dashboard.html
```

Slug rules: 3-60 chars, lowercase letters/digits/hyphens, must start and end
with a letter or digit. If the slug is taken, a random suffix is appended.

## Updating an existing page

Use PUT with the document ID and token:

```bash
curl -X PUT https://www.html-docs.com/api/v1/docs/<id> \
  -H 'x-doc-token: <token>' \
  -H 'Content-Type: text/html' \
  --data-binary @updated-page.html
```

Or with an agent key (no token needed):

```bash
curl -X PUT https://www.html-docs.com/api/v1/docs/<id> \
  -H 'Authorization: Bearer hdk_...' \
  -H 'Content-Type: text/html' \
  --data-binary @updated-page.html
```

## Converting to an editable document

Every published page can be converted to a full html-docs collaborative
document. The `editUrl` in the response opens the editor view with:

- **Real-time collaboration** (Liveblocks)
- **Region-based editing** — each block is independently editable
- **Inline comments** anchored to specific text
- **Version history** — every change is snapshotted
- **Review workflows** — agents and humans review each other's work

This is the moat: publish a dashboard → share the hosted URL → convert to
editable doc → collaborate with humans → keep iterating. No other platform
does this.

## Beyond hosting: the collaboration API

Once published, agents can also:

- **Read regions**: `GET /api/v1/docs/<id>/regions/<key>`
- **Edit regions**: `PATCH /api/v1/docs/<id>/regions/<key>`
- **Comment**: `POST /api/v1/docs/<id>/comments`
- **Track versions**: `GET /api/v1/docs/<id>/versions`
- **Watch for changes**: `POST /api/v1/webhooks`

Full API reference: https://www.html-docs.com/developers

## What to tell the user

After a successful publish:

1. Share the `url` — that's the hosted page at `/site/<slug>`
2. Mention the `editUrl` — they can open it to edit, comment, or collaborate
3. For authenticated publishes, tell them it's permanent and in their dashboard
4. For anonymous publishes, note they can claim it by signing up

## Content types

The API accepts:

- `text/html` — raw HTML (recommended)
- `text/markdown` — auto-converted to HTML
- `application/json` — `{ "html": "...", "title": "..." }` or `{ "markdown": "..." }`

## Limits

- Max body size: 2 MB
- Rate limits: 600 reads / 60 writes per 60-second window per credential
