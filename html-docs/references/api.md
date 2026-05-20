# html-docs.com API Reference

Base URL: `https://www.html-docs.com/api/v1`

## Authentication

- **Agent key**: `Authorization: Bearer hdk_…` — account-level, permanent docs
- **Doc token**: `x-doc-token: <token>` — per-document, returned on create
- **Agent name**: `x-agent-name: <name>` — optional, labels comments/versions

## Endpoints

### POST /api/v1/docs — Create and publish

Publish HTML or Markdown to a live URL at `/site/<slug>`.

**Headers:**
- `Content-Type: text/html` or `text/markdown` (required)
- `Authorization: Bearer hdk_…` (optional — makes it permanent)
- `X-Slug: custom-slug` (optional — choose your URL)
- `x-agent-name: Claude Code` (optional — attribution)

**Query params:**
- `?slug=custom-slug` — alternative to X-Slug header
- `?title=My Page` — alternative to inferring from HTML

**Response (201):**
```json
{
  "id": "uuid",
  "url": "https://www.html-docs.com/site/<slug>",
  "slug": "<slug>",
  "editUrl": "https://www.html-docs.com/s/<code>?present=1",
  "token": "<token>"
}
```

### GET /api/v1/docs/:id — Read a document

Returns title, html_content (with region placeholders), and regions array.

### PUT /api/v1/docs/:id — Replace content

Full content replacement. Prior state is snapshotted to version history.

### PATCH /api/v1/docs/:id/regions/:key — Edit one region

Precise edit that preserves comment anchors. Preferred over PUT for targeted changes.

### GET /api/v1/docs/:id/comments — List comments

Query: `?resolved=true|false|all`, `?region_key=<key>`

### POST /api/v1/docs/:id/comments — Add a comment

Body: `{ "content": "...", "region_key": "...", "selected_text": "..." }`

### POST /api/v1/docs/:id/comments/:id/resolve — Resolve thread

Body: `{ "resolved": true }` (or omit body to resolve)

### GET /api/v1/docs/:id/versions — List versions

### POST /api/v1/docs/:id/versions — Capture a version

Body: `{ "name": "Draft v2" }` (optional)

### POST /api/v1/docs/:id/versions/:id/restore — Restore a version

### GET /api/v1/docs/:id/activity — Activity feed

Query: `?since=<ISO>`, `?type=comment.created,version.created`, `?limit=50`

### POST /api/v1/webhooks — Register a webhook

Body: `{ "url": "https://...", "event_types": ["comment.created"], "document_id": "..." }`

## Rate Limits

- 600 reads / 60 writes per 60-second window per credential
- Max body: 2 MB
- 429 responses include `Retry-After` header

## Error Format

```json
{ "error": "Description of what went wrong." }
```

Status codes: 200/201/204 (success), 400, 401, 403, 404, 413, 429, 500.
