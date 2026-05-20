#!/usr/bin/env node

/**
 * html-docs CLI — instant web hosting for AI agents.
 *
 * Usage:
 *   npx html-docs publish <file-or-dir> [--slug <slug>] [--api-key <key>]
 *   npx html-docs auth
 *   npx html-docs update <id> <file-or-dir> [--token <token>]
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = 'https://www.html-docs.com';
const CREDENTIALS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.htmldocs',
  'credentials'
);

const [, , command, ...args] = process.argv;

function getApiKey() {
  // 1. Environment variable
  if (process.env.HTMLDOCS_API_KEY) return process.env.HTMLDOCS_API_KEY;
  // 2. Credentials file
  try {
    return fs.readFileSync(CREDENTIALS_FILE, 'utf8').trim();
  } catch { }
  return null;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

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

function showHelp() {
  console.log(`html-docs — instant web hosting for AI agents

Usage:
  html-docs publish <file-or-dir>    Publish to a live URL
    --slug <slug>                    Custom slug for the URL
    --api-key <key>                  API key (or set $HTMLDOCS_API_KEY)
    --title <text>                   Document title
    --client <name>                  Agent name for attribution

  html-docs auth                     Save your API key

  html-docs update <id> <file>       Update an existing document
    --token <token>                  Doc token for anonymous updates
    --api-key <key>                  API key for authenticated updates

Examples:
  npx html-docs publish page.html
  npx html-docs publish ./site/ --slug my-dashboard
  npx html-docs auth
  npx html-docs update abc-123 page.html --token xyz

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
