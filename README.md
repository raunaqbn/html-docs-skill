# html-docs

**HTML publishing and generated video for AI agents.** Publish sites, dashboards, and documents to [html-docs.com](https://www.html-docs.com), then generate deterministic HTML motion and embed the rendered MP4.

```
npx @html-docs/cli publish dashboard.html
→ https://www.html-docs.com/site/my-dashboard-a7k2
```

## What makes this different

1. **Inline JavaScript works.** Chart.js, D3, Plotly, SPAs — your scripts survive the publish pipeline.
2. **Every hosted page can become an editable document.** Real-time collaboration, inline comments, version history — the full html-docs editing layer, one click away.
3. **One API, two outputs.** Get a hosted URL for sharing AND an editor URL for collaboration.

## Installation

### As an npx command (recommended)

```bash
npx @html-docs/cli publish page.html
```

### As an MCP server (Claude Code, Cursor, Windsurf, Cline, Codex)

One command — auto-detects your installed clients and wires in the server:

```bash
npx @html-docs/cli install
```

Or target a specific client (and optionally bake in your API key):

```bash
npx @html-docs/cli install claude-code
npx @html-docs/cli install cursor --api-key hdk_your_key
```

This writes the html-docs MCP server into the client's own config file
(`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json`,
`~/.codex/config.toml`, or Cline's settings), preserving any servers you
already have. Restart the client to load the tools.

Prefer to edit JSON by hand? Add this to your MCP config:

```json
{
  "mcpServers": {
    "html-docs": {
      "command": "npx",
      "args": ["-y", "@html-docs/cli", "--mcp"]
    }
  }
}
```

This gives your agent native `publish`, `update`, `read`, `comment`,
`list_comments`, and `generate_video` tools — no skill file needed.

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
npx @html-docs/cli publish page.html

# With a custom slug
npx @html-docs/cli publish dashboard.html --slug quarterly-report

# Authenticated (permanent, in your dashboard)
npx @html-docs/cli publish dashboard.html --api-key hdk_your_key

# Publish a directory (looks for index.html)
npx @html-docs/cli publish ./my-site/
```

### Authenticate

```bash
npx @html-docs/cli auth
```

Saves your API key to `~/.htmldocs/credentials`. After this, all publishes are permanent.

### Update

```bash
npx @html-docs/cli update <doc-id> page.html --token <token>
```

### Generate and embed a video

Requires an authenticated document owned by the API-key account:

```bash
npx @html-docs/cli video <doc-id> \
  --prompt "Animate the three most important ideas" \
  --aspect landscape --duration 8
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

Works with any AI agent that can make HTTP requests or use MCP:

- Claude Code (MCP or skill)
- Cursor (MCP or skill)
- Windsurf (MCP)
- Cline (MCP)
- Codex
- OpenClaw
- Amp
- Gemini CLI
- Any HTTP-capable tool

### MCP tools

When running as an MCP server (`--mcp`), the following tools are available:

| Tool | Description |
|------|-------------|
| `publish` | Publish HTML content to a live URL |
| `publish_file` | Publish a local HTML file to a live URL |
| `update` | Update an existing document |
| `read` | Read a document's content and regions |
| `comment` | Add a comment anchored to specific text |
| `list_comments` | List all comments on a document |
| `generate_video` | Generate, render, and insert an HTML-authored video |

## API docs

Full reference: [html-docs.com/developers](https://www.html-docs.com/developers)

## License

MIT
