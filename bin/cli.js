#!/usr/bin/env node

/**
 * html-docs CLI — instant web hosting for AI agents.
 *
 * Usage:
 *   npx @html-docs/cli install [client]   Auto-configure MCP into your agent
 *   npx @html-docs/cli publish <file-or-dir> [--slug <slug>] [--api-key <key>]
 *   npx @html-docs/cli auth
 *   npx @html-docs/cli update <id> <file-or-dir> [--token <token>]
 *   npx @html-docs/cli video <id> --prompt <brief>
 *   npx @html-docs/cli --mcp    Start MCP (Model Context Protocol) server
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const http = require('http');

const BASE_URL = (process.env.HTMLDOCS_BASE_URL || 'https://www.html-docs.com').replace(/\/$/, '');
const CREDENTIALS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.htmldocs',
  'credentials'
);

function getApiKey() {
  if (process.env.HTMLDOCS_API_KEY) return process.env.HTMLDOCS_API_KEY;
  try {
    return fs.readFileSync(CREDENTIALS_FILE, 'utf8').trim();
  } catch { }
  return null;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ── HTTP helper (zero deps, used by MCP) ──────────────────────────

function httpRequest(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { ...headers },
    };
    if (body) {
      const buf = Buffer.from(body, 'utf8');
      opts.headers['content-length'] = buf.length;
    }
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ _raw: raw, _status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── MCP Server ────────────────────────────────────────────────────

const MCP_SERVER_INFO = {
  name: 'html-docs',
  version: '0.4.0',
};

const MCP_TOOLS = [
  {
    name: 'publish',
    description: 'Publish HTML content to a live URL on html-docs.com. Returns the hosted URL, edit URL, doc ID, and token.',
    inputSchema: {
      type: 'object',
      properties: {
        html:    { type: 'string', description: 'HTML content to publish' },
        slug:    { type: 'string', description: 'Optional custom slug for the URL (e.g. "my-dashboard" → html-docs.com/site/my-dashboard)' },
        title:   { type: 'string', description: 'Optional document title' },
        api_key: { type: 'string', description: 'Optional API key (hdk_...). Falls back to HTMLDOCS_API_KEY env var or ~/.htmldocs/credentials' },
      },
      required: ['html'],
    },
  },
  {
    name: 'publish_file',
    description: 'Publish a local HTML file to a live URL on html-docs.com. Reads the file and publishes its contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path to the HTML file to publish' },
        slug:    { type: 'string', description: 'Optional custom slug for the URL' },
        title:   { type: 'string', description: 'Optional document title' },
        api_key: { type: 'string', description: 'Optional API key' },
      },
      required: ['path'],
    },
  },
  {
    name: 'update',
    description: 'Update an existing document with new HTML content.',
    inputSchema: {
      type: 'object',
      properties: {
        id:      { type: 'string', description: 'Document ID to update' },
        html:    { type: 'string', description: 'New HTML content' },
        token:   { type: 'string', description: 'Document token for anonymous auth' },
        api_key: { type: 'string', description: 'Optional API key for authenticated auth' },
      },
      required: ['id', 'html'],
    },
  },
  {
    name: 'read',
    description: 'Read a document\'s content and regions from html-docs.com.',
    inputSchema: {
      type: 'object',
      properties: {
        id:      { type: 'string', description: 'Document ID to read' },
        token:   { type: 'string', description: 'Document token for anonymous auth' },
        api_key: { type: 'string', description: 'Optional API key for authenticated auth' },
      },
      required: ['id'],
    },
  },
  {
    name: 'comment',
    description: 'Add a comment to a document, anchored to a specific text selection in a region.',
    inputSchema: {
      type: 'object',
      properties: {
        id:            { type: 'string', description: 'Document ID' },
        content:       { type: 'string', description: 'Comment text' },
        region_key:    { type: 'string', description: 'Region key to attach the comment to (e.g. "region-abc123")' },
        selected_text: { type: 'string', description: 'Exact short plain-text snippet from the region to highlight' },
        agent_name:    { type: 'string', description: 'Display name for the comment author (e.g. "Claude")' },
        parent_id:     { type: 'string', description: 'Optional parent comment ID for threaded replies' },
        token:         { type: 'string', description: 'Document token for anonymous auth' },
        api_key:       { type: 'string', description: 'Optional API key for authenticated auth' },
      },
      required: ['id', 'content', 'region_key', 'selected_text'],
    },
  },
  {
    name: 'list_comments',
    description: 'List all comments on a document.',
    inputSchema: {
      type: 'object',
      properties: {
        id:      { type: 'string', description: 'Document ID' },
        token:   { type: 'string', description: 'Document token for anonymous auth' },
        api_key: { type: 'string', description: 'Optional API key for authenticated auth' },
      },
      required: ['id'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate deterministic HTML motion for an owned document, render it to MP4, and insert it as a video block. Requires an account API key.',
    inputSchema: {
      type: 'object',
      properties: {
        id:               { type: 'string', description: 'Owned document ID' },
        prompt:           { type: 'string', description: 'What the video should communicate and how it should feel' },
        title:            { type: 'string', description: 'Optional video title' },
        after_region_key: { type: 'string', description: 'Optional region after which to insert the video' },
        aspect_ratio:     { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Output aspect ratio' },
        duration_seconds: { type: 'number', minimum: 3, maximum: 15, description: 'Duration in seconds' },
        quality:          { type: 'string', enum: ['draft', 'standard', 'high'], description: 'Encoding quality' },
        api_key:          { type: 'string', description: 'Optional account API key; falls back to configured credentials' },
      },
      required: ['id', 'prompt'],
    },
  },
];

function mcpAuthHeaders(args) {
  const headers = {};
  const key = args.api_key || getApiKey();
  if (key) {
    headers['authorization'] = `Bearer ${key}`;
  } else if (args.token) {
    headers['x-doc-token'] = args.token;
  }
  return headers;
}

async function mcpCallTool(name, args) {
  switch (name) {
    case 'publish': {
      if (!args.html) throw new Error('html is required');
      let url = `${BASE_URL}/api/v1/docs`;
      if (args.slug) url += `?slug=${encodeURIComponent(args.slug)}`;
      const headers = { 'content-type': 'text/html', ...mcpAuthHeaders(args) };
      if (args.title) headers['x-doc-title'] = args.title;
      const res = await httpRequest('POST', url, headers, args.html);
      if (res.error) throw new Error(res.error);
      return { url: res.url, slug: res.slug, editUrl: res.editUrl, token: res.token, id: res.id };
    }
    case 'publish_file': {
      if (!args.path) throw new Error('path is required');
      const filePath = path.resolve(args.path);
      if (!fs.existsSync(filePath)) throw new Error(`file not found: ${args.path}`);
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) throw new Error('file is empty');
      return mcpCallTool('publish', { ...args, html: content });
    }
    case 'update': {
      if (!args.id || !args.html) throw new Error('id and html are required');
      const url = `${BASE_URL}/api/v1/docs/${args.id}`;
      const headers = { 'content-type': 'text/html', ...mcpAuthHeaders(args) };
      const res = await httpRequest('PUT', url, headers, args.html);
      if (res.error) throw new Error(res.error);
      return { url: res.url, siteUrl: res.siteUrl, slug: res.slug, id: res.id };
    }
    case 'read': {
      if (!args.id) throw new Error('id is required');
      const url = `${BASE_URL}/api/v1/docs/${args.id}`;
      const headers = mcpAuthHeaders(args);
      const res = await httpRequest('GET', url, headers);
      if (res.error) throw new Error(res.error);
      return { title: res.title, html_content: res.html_content, regions: res.regions };
    }
    case 'comment': {
      if (!args.id || !args.content || !args.region_key || !args.selected_text)
        throw new Error('id, content, region_key, and selected_text are required');
      const url = `${BASE_URL}/api/v1/docs/${args.id}/comments`;
      const headers = { 'content-type': 'application/json', ...mcpAuthHeaders(args) };
      if (args.agent_name) headers['x-agent-name'] = args.agent_name;
      const body = JSON.stringify({
        content: args.content,
        region_key: args.region_key,
        selected_text: args.selected_text,
        ...(args.parent_id ? { parent_id: args.parent_id } : {}),
      });
      const res = await httpRequest('POST', url, headers, body);
      if (res.error) throw new Error(res.error);
      return res;
    }
    case 'list_comments': {
      if (!args.id) throw new Error('id is required');
      const url = `${BASE_URL}/api/v1/docs/${args.id}/comments`;
      const headers = mcpAuthHeaders(args);
      const res = await httpRequest('GET', url, headers);
      if (res.error) throw new Error(res.error);
      return res;
    }
    case 'generate_video': {
      if (!args.id || !args.prompt) throw new Error('id and prompt are required');
      const key = args.api_key || getApiKey();
      if (!key) throw new Error('Video generation requires an account API key. Run html-docs auth first.');
      const url = `${BASE_URL}/api/v1/docs/${args.id}/videos`;
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
      const body = JSON.stringify({
        prompt: args.prompt,
        ...(args.title ? { title: args.title } : {}),
        ...(args.after_region_key ? { after_region_key: args.after_region_key } : {}),
        ...(args.aspect_ratio ? { aspect_ratio: args.aspect_ratio } : {}),
        ...(args.duration_seconds ? { duration_seconds: args.duration_seconds } : {}),
        ...(args.quality ? { quality: args.quality } : {}),
      });
      const res = await httpRequest('POST', url, headers, body);
      if (res.error) throw new Error(res.error);
      return res;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function startMcpServer() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let pending = 0;
  let stdinClosed = false;

  function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  function sendResult(id, result) {
    send({ jsonrpc: '2.0', id, result });
  }

  function sendError(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
  }

  function maybeExit() {
    if (stdinClosed && pending === 0) {
      process.stderr.write('[html-docs] all done, shutting down\n');
      process.exit(0);
    }
  }

  process.stderr.write('[html-docs] MCP server started\n');

  rl.on('line', async (line) => {
    line = line.trim();
    if (!line) return;

    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stderr.write(`[html-docs] invalid JSON: ${line}\n`);
      return;
    }

    const { id, method, params } = msg;

    // Notifications (no id) — don't respond
    if (id === undefined || id === null) {
      if (method === 'initialized') {
        process.stderr.write('[html-docs] client initialized\n');
      } else if (method === 'notifications/cancelled') {
        // ignore cancellation notifications
      } else {
        process.stderr.write(`[html-docs] notification: ${method}\n`);
      }
      return;
    }

    try {
      switch (method) {
        case 'initialize':
          sendResult(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: MCP_SERVER_INFO,
          });
          break;

        case 'tools/list':
          sendResult(id, { tools: MCP_TOOLS });
          break;

        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          pending++;
          try {
            const result = await mcpCallTool(toolName, toolArgs);
            sendResult(id, {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            });
          } catch (err) {
            sendResult(id, {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              isError: true,
            });
          }
          pending--;
          maybeExit();
          break;
        }

        case 'ping':
          sendResult(id, {});
          break;

        default:
          sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      sendError(id, -32603, err.message);
    }
  });

  rl.on('close', () => {
    stdinClosed = true;
    process.stderr.write('[html-docs] stdin closed\n');
    maybeExit();
  });
}

// ── CLI commands ──────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

// Intercept --mcp before CLI routing
if (process.argv.includes('--mcp')) {
  startMcpServer();
} else {

async function publish() {
  const target = args.find(a => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: html-docs publish <file-or-dir> [--slug <slug>] [--api-key <key>]');
    process.exit(1);
  }

  if (!fs.existsSync(target)) die(`path does not exist: ${target}`);

  // Parse options
  let slug = '', apiKeyFlag = '', title = '', client = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug' && args[i + 1]) { slug = args[++i]; }
    else if (args[i] === '--api-key' && args[i + 1]) { apiKeyFlag = args[++i]; }
    else if (args[i] === '--title' && args[i + 1]) { title = args[++i]; }
    else if (args[i] === '--client' && args[i + 1]) { client = args[++i]; }
  }

  // Determine content
  let content, contentType = 'text/html';
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    content = fs.readFileSync(target, 'utf8');
    if (target.endsWith('.md') || target.endsWith('.markdown')) {
      contentType = 'text/markdown';
    }
  } else if (stat.isDirectory()) {
    const indexPaths = ['index.html', 'index.htm', 'index.md'];
    let found = null;
    for (const name of indexPaths) {
      const full = path.join(target, name);
      if (fs.existsSync(full)) { found = full; break; }
    }
    if (!found) die(`no index.html or index.md found in ${target}`);
    content = fs.readFileSync(found, 'utf8');
    if (found.endsWith('.md')) contentType = 'text/markdown';
  } else {
    die(`not a file or directory: ${target}`);
  }

  if (!content.trim()) die('empty file');

  // Build API key
  const apiKey = apiKeyFlag || getApiKey();

  // Build URL with slug query param
  let url = `${BASE_URL}/api/v1/docs`;
  if (slug) url += `?slug=${encodeURIComponent(slug)}`;

  // Build headers
  const headers = ['-H', `content-type: ${contentType}`];
  if (apiKey) headers.push('-H', `authorization: Bearer ${apiKey}`);
  if (client) headers.push('-H', `x-agent-name: ${client}`);
  if (title) headers.push('-H', `x-doc-title: ${title}`);

  // Make request
  try {
    const result = execSync(
      `curl -sS -X POST ${JSON.stringify(url)} ${headers.map(h => JSON.stringify(h)).join(' ')} --data-binary @-`,
      { input: content, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(result);

    if (response.error) die(response.error);

    // Primary output: the hosted URL
    console.log(response.url);

    // Metadata
    console.error('');
    console.error(`slug:    ${response.slug || 'n/a'}`);
    console.error(`editUrl: ${response.editUrl || 'n/a'}`);
    console.error(`token:   ${response.token || 'n/a'}`);
    console.error(`id:      ${response.id || 'n/a'}`);
    if (response.owned) console.error('mode:    authenticated (permanent)');
    else console.error('mode:    anonymous');
  } catch (err) {
    die(`publish failed: ${err.message}`);
  }
}

async function auth() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.error('html-docs.com — authenticate your agent\n');
  console.error('1. Sign up or log in at https://www.html-docs.com/auth/login');
  console.error('2. Go to https://www.html-docs.com/settings/api-keys');
  console.error('3. Create a new key (starts with hdk_)\n');

  const key = await ask('Paste your API key: ');
  rl.close();

  if (!key.trim()) die('no key provided');
  if (!key.trim().startsWith('hdk_')) {
    console.error('warning: key does not start with hdk_ — saving anyway');
  }

  const dir = path.dirname(CREDENTIALS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, key.trim(), { mode: 0o600 });
  console.error(`\nSaved to ${CREDENTIALS_FILE}`);
  console.error('You can now publish permanent pages with: html-docs publish <file>');
}

async function update() {
  const docId = args[0];
  const target = args[1];
  if (!docId || !target) {
    console.error('Usage: html-docs update <doc-id> <file-or-dir> [--token <token>] [--api-key <key>]');
    process.exit(1);
  }

  if (!fs.existsSync(target)) die(`path does not exist: ${target}`);

  let token = '', apiKeyFlag = '';
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) { token = args[++i]; }
    else if (args[i] === '--api-key' && args[i + 1]) { apiKeyFlag = args[++i]; }
  }

  const apiKey = apiKeyFlag || getApiKey();
  let content, contentType = 'text/html';

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    content = fs.readFileSync(target, 'utf8');
    if (target.endsWith('.md')) contentType = 'text/markdown';
  } else if (stat.isDirectory()) {
    const idx = path.join(target, 'index.html');
    if (!fs.existsSync(idx)) die('no index.html found');
    content = fs.readFileSync(idx, 'utf8');
  } else {
    die('not a file or directory');
  }

  const url = `${BASE_URL}/api/v1/docs/${docId}`;
  const headers = ['-H', `content-type: ${contentType}`];
  if (apiKey) headers.push('-H', `authorization: Bearer ${apiKey}`);
  else if (token) headers.push('-H', `x-doc-token: ${token}`);

  try {
    const result = execSync(
      `curl -sS -X PUT ${JSON.stringify(url)} ${headers.map(h => JSON.stringify(h)).join(' ')} --data-binary @-`,
      { input: content, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(result);
    if (response.error) die(response.error);

    console.log('Updated successfully');
    if (response.url) console.log(response.url);
  } catch (err) {
    die(`update failed: ${err.message}`);
  }
}

async function video() {
  const docId = args[0];
  let prompt = '', title = '', afterRegionKey = '', aspectRatio = 'landscape';
  let quality = 'standard', apiKeyFlag = '', durationSeconds = 8;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--prompt' && args[i + 1]) prompt = args[++i];
    else if (args[i] === '--title' && args[i + 1]) title = args[++i];
    else if (args[i] === '--after-region' && args[i + 1]) afterRegionKey = args[++i];
    else if (args[i] === '--aspect' && args[i + 1]) aspectRatio = args[++i];
    else if (args[i] === '--duration' && args[i + 1]) durationSeconds = Number(args[++i]);
    else if (args[i] === '--quality' && args[i + 1]) quality = args[++i];
    else if (args[i] === '--api-key' && args[i + 1]) apiKeyFlag = args[++i];
  }
  if (!docId || !prompt.trim()) {
    console.error('Usage: html-docs video <doc-id> --prompt <brief> [--aspect landscape|portrait|square] [--duration 3-15]');
    process.exit(1);
  }
  const apiKey = apiKeyFlag || getApiKey();
  if (!apiKey) die('video generation requires an account API key; run html-docs auth first');
  if (!['landscape', 'portrait', 'square'].includes(aspectRatio)) die('invalid --aspect');
  if (!['draft', 'standard', 'high'].includes(quality)) die('invalid --quality');
  if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 15) die('--duration must be from 3 to 15');

  const response = await httpRequest(
    'POST',
    `${BASE_URL}/api/v1/docs/${docId}/videos`,
    { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    JSON.stringify({
      prompt: prompt.trim(), title: title || undefined,
      after_region_key: afterRegionKey || undefined,
      aspect_ratio: aspectRatio, duration_seconds: durationSeconds, quality,
    }),
  );
  if (response.error) die(response.error);

  console.log(response.video_url);
  console.error('');
  console.error(`poster:      ${response.poster_url}`);
  console.error(`composition: ${response.composition_id}`);
  console.error(`render:      ${response.render_id}`);
  console.error(`region:      ${response.inserted_region_key}`);
}

// ── install: auto-configure the MCP server into agent clients ──────

const MCP_ENTRY = { command: 'npx', args: ['-y', '@html-docs/cli', '--mcp'] };

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || '';
}

// Known agent clients and where their MCP config lives.
function clientTargets() {
  const home = homeDir();
  return {
    'claude-code': {
      label: 'Claude Code',
      kind: 'json',
      file: path.join(home, '.claude.json'),
      // also "installed" if the `claude` binary is on PATH
      detectCmd: 'claude',
    },
    cursor: {
      label: 'Cursor',
      kind: 'json',
      file: path.join(home, '.cursor', 'mcp.json'),
      detectDir: path.join(home, '.cursor'),
    },
    windsurf: {
      label: 'Windsurf',
      kind: 'json',
      file: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      detectDir: path.join(home, '.codeium', 'windsurf'),
    },
    cline: {
      label: 'Cline',
      kind: 'json',
      file: path.join(
        home,
        '.config',
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json'
      ),
      detectDir: path.join(
        home,
        '.config',
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev'
      ),
    },
    codex: {
      label: 'Codex',
      kind: 'toml',
      file: path.join(home, '.codex', 'config.toml'),
      detectDir: path.join(home, '.codex'),
      detectCmd: 'codex',
    },
  };
}

function onPath(bin) {
  if (!bin) return false;
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isClientPresent(t) {
  if (t.detectCmd && onPath(t.detectCmd)) return true;
  if (t.file && fs.existsSync(t.file)) return true;
  if (t.detectDir && fs.existsSync(t.detectDir)) return true;
  return false;
}

// Merge our server into a JSON MCP config, preserving everything else.
function installJson(t, apiKey) {
  let config = {};
  if (fs.existsSync(t.file)) {
    const raw = fs.readFileSync(t.file, 'utf8').trim();
    if (raw) {
      try {
        config = JSON.parse(raw);
      } catch {
        die(`could not parse existing config at ${t.file} (invalid JSON) — fix or remove it, then retry`);
      }
    }
  }
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }
  const existed = Boolean(config.mcpServers['html-docs']);
  const entry = { ...MCP_ENTRY };
  if (apiKey) entry.env = { HTMLDOCS_API_KEY: apiKey };
  config.mcpServers['html-docs'] = entry;

  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  fs.writeFileSync(t.file, JSON.stringify(config, null, 2) + '\n');
  return existed ? 'updated' : 'added';
}

// Append/replace a [mcp_servers.html-docs] block in a TOML config.
function installToml(t, apiKey) {
  let text = '';
  if (fs.existsSync(t.file)) text = fs.readFileSync(t.file, 'utf8');

  const lines = [];
  lines.push('[mcp_servers.html-docs]');
  lines.push('command = "npx"');
  lines.push('args = ["-y", "@html-docs/cli", "--mcp"]');
  if (apiKey) {
    lines.push('');
    lines.push('[mcp_servers.html-docs.env]');
    lines.push(`HTMLDOCS_API_KEY = "${apiKey}"`);
  }
  const block = lines.join('\n');

  const header = '[mcp_servers.html-docs]';
  let existed = false;
  if (text.includes(header)) {
    existed = true;
    // Replace the existing block: from its header up to the next top-level
    // [section] header (one that is not a sub-table of html-docs) or EOF.
    const allLines = text.split('\n');
    const out = [];
    let skipping = false;
    for (const line of allLines) {
      const trimmed = line.trim();
      if (trimmed === header || trimmed.startsWith('[mcp_servers.html-docs.')) {
        skipping = true;
        continue;
      }
      if (skipping && /^\[/.test(trimmed) && !trimmed.startsWith('[mcp_servers.html-docs')) {
        skipping = false;
      }
      if (!skipping) out.push(line);
    }
    text = out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  fs.mkdirSync(path.dirname(t.file), { recursive: true });
  const sep = text && !text.endsWith('\n') ? '\n\n' : text ? '\n' : '';
  fs.writeFileSync(t.file, text + sep + block + '\n');
  return existed ? 'updated' : 'added';
}

async function install() {
  const targets = clientTargets();

  // Parse args: optional client name(s) + flags.
  let apiKey = '';
  const requested = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-key' && args[i + 1]) { apiKey = args[++i]; }
    else if (args[i] === '--all') { requested.push('--all'); }
    else if (!args[i].startsWith('--')) { requested.push(args[i].toLowerCase()); }
  }
  if (!apiKey) apiKey = getApiKey() || '';

  // Aliases so "claude" → "claude-code".
  const alias = { claude: 'claude-code', 'claude-code': 'claude-code', windsurf: 'windsurf', cursor: 'cursor', cline: 'cline', codex: 'codex' };

  let chosen;
  const explicit = requested.filter(r => r !== '--all');
  if (explicit.length) {
    chosen = [];
    for (const r of explicit) {
      const key = alias[r];
      if (!key || !targets[key]) die(`unknown client: ${r}\nsupported: claude-code, cursor, windsurf, cline, codex`);
      chosen.push(key);
    }
  } else {
    // No client named: auto-detect installed ones.
    chosen = Object.keys(targets).filter(k => isClientPresent(targets[k]));
    if (!chosen.length) {
      console.error('No supported agent clients detected on this machine.');
      console.error('Install for a specific one with, e.g.:');
      console.error('  npx @html-docs/cli install claude-code');
      console.error('  npx @html-docs/cli install cursor');
      console.error('Supported: claude-code, cursor, windsurf, cline, codex');
      process.exit(1);
    }
    console.error(`Detected: ${chosen.map(k => targets[k].label).join(', ')}\n`);
  }

  for (const key of chosen) {
    const t = targets[key];
    try {
      const result = t.kind === 'toml' ? installToml(t, apiKey) : installJson(t, apiKey);
      console.error(`✓ ${t.label}: html-docs MCP server ${result}`);
      console.error(`  ${t.file}`);
    } catch (err) {
      console.error(`✗ ${t.label}: ${err.message}`);
    }
  }

  console.error('');
  if (apiKey) {
    console.error('API key wired in — your published pages will be permanent and owned by your account.');
  } else {
    console.error('No API key set, so publishes will be anonymous. To publish permanent, owned pages:');
    console.error('  npx @html-docs/cli auth      (then re-run install to bake the key in)');
  }
  console.error('Restart your agent client to load the new tools.');
}

function showHelp() {
  console.log(`html-docs — instant web hosting for AI agents

Usage:
  html-docs install [client]         Auto-configure the MCP server into your agent
    [client]                         claude-code | cursor | windsurf | cline | codex
                                     (omit to auto-detect installed clients)
    --api-key <key>                  Bake an API key in (or set $HTMLDOCS_API_KEY)

  html-docs publish <file-or-dir>    Publish to a live URL
    --slug <slug>                    Custom slug for the URL
    --api-key <key>                  API key (or set $HTMLDOCS_API_KEY)
    --title <text>                   Document title
    --client <name>                  Agent name for attribution

  html-docs auth                     Save your API key

  html-docs update <id> <file>       Update an existing document
    --token <token>                  Doc token for anonymous updates
    --api-key <key>                  API key for authenticated updates

  html-docs video <id> --prompt <brief>
                                      Generate, render, and embed an HTML video
    --title <text>                    Optional video title
    --after-region <key>              Insert after a specific region
    --aspect <ratio>                  landscape, portrait, or square
    --duration <seconds>              3-15 seconds (default: 8)
    --quality <level>                 draft, standard, or high
    --api-key <key>                   Account API key (required)

  html-docs --mcp                    Start MCP server (JSON-RPC over stdio)

Examples:
  npx @html-docs/cli install                     # detect & configure your agent
  npx @html-docs/cli install claude-code
  npx @html-docs/cli publish page.html
  npx @html-docs/cli publish ./site/ --slug my-dashboard
  npx @html-docs/cli auth
  npx @html-docs/cli update abc-123 page.html --token xyz
  npx @html-docs/cli video abc-123 --prompt "Animate the three key ideas"

Docs: https://www.html-docs.com/developers
`);
}

// ── Route command ─────────────────────────────────────────────────

switch (command) {
  case 'publish':
    publish().catch(e => die(e.message));
    break;
  case 'auth':
    auth().catch(e => die(e.message));
    break;
  case 'update':
    update().catch(e => die(e.message));
    break;
  case 'video':
    video().catch(e => die(e.message));
    break;
  case 'install':
    install().catch(e => die(e.message));
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}

} // end of else (non-MCP)
