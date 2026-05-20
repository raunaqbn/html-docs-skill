# html-docs

**Instant web hosting for AI agents.** Publish HTML sites, dashboards, and documents to [html-docs.com](https://www.html-docs.com) in one command.

```
npx html-docs publish dashboard.html
→ https://www.html-docs.com/site/my-dashboard-a7k2
```

## What makes this different

1. **Inline JavaScript works.** Chart.js, D3, Plotly, SPAs — your scripts survive the publish pipeline.
2. **Every hosted page can become an editable document.** Real-time collaboration, inline comments, version history — the full html-docs editing layer, one click away.
3. **One API, two outputs.** Get a hosted URL for sharing AND an editor URL for collaboration.

## Installation

### As an npx command (recommended)

```bash
npx html-docs publish page.html
```

### As an agent skill (Claude Code, Cursor, Codex, etc.)

```bash
npx skills add raunaqbn/html-docs-skill --skill html-docs -g
```

Or manually:

```bash
mkdir -p ~/.claude/skills/html-docs
curl -fsSL https://raw.githubusercontent.com/raunaqbn/html-docs-skill/main/html-docs/SKILL.md \
  -o ~/.claude/skills/html-docs/SKILL.md
```

## Usage

### Publish

```bash
# Anonymous (zero friction, no account needed)
npx html-docs publish page.html

# With a custom slug
npx html-docs publish dashboard.html --slug quarterly-report

# Authenticated (permanent, in your dashboard)
npx html-docs publish dashboard.html --api-key hdk_your_key

# Publish a directory (looks for index.html)
npx html-docs publish ./my-site/
```

### Authenticate

```bash
npx html-docs auth
```

Saves your API key to `~/.htmldocs/credentials`. After this, all publishes are permanent.

### Update

```bash
npx html-docs update <doc-id> page.html --token <token>
```

### Direct curl (no install needed)

```bash
curl -X POST https://www.html-docs.com/api/v1/docs \
  -H 'Content-Type: text/html' \
  --data-binary @page.html
```

## Response

```json
{
  "id": "doc-uuid",
  "url": "https://www.html-docs.com/site/my-dashboard",
  "slug": "my-dashboard",
  "editUrl": "https://www.html-docs.com/s/ab12cd34?present=1",
  "token": "ab12cd34"
}
```

- **`url`** — the hosted page. Raw HTML, no editor. Share this.
- **`editUrl`** — opens the editor. Collaborate, comment, version.
- **`slug`** — the URL path. Customizable.
- **`token`** — keep this for updates.

## Agent compatibility

Works with any AI agent that can make HTTP requests:

- Claude Code
- Cursor
- Codex
- OpenClaw
- Amp
- Gemini CLI
- Any HTTP-capable tool

## API docs

Full reference: [html-docs.com/developers](https://www.html-docs.com/developers)

## License

MIT
