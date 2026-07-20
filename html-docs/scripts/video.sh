#!/usr/bin/env bash
set -euo pipefail

# Prefer a checked-out HTML Docs workspace so skill development and released
# renderer builds use the exact same open-source implementation. A custom
# checkout can be selected without editing this skill.
video_repo="${HTMLDOCS_VIDEO_REPO:-}"
if [[ -z "$video_repo" ]]; then
  current_dir="$PWD"
  while [[ "$current_dir" != "/" ]]; do
    if [[ -f "$current_dir/packages/html-video/package.json" ]]; then
      video_repo="$current_dir"
      break
    fi
    current_dir="$(dirname "$current_dir")"
  done
fi
if [[ -z "$video_repo" && -f "$HOME/projects/html-docs/packages/html-video/package.json" ]]; then
  video_repo="$HOME/projects/html-docs"
fi

if [[ -n "$video_repo" ]]; then
  exec pnpm --dir "$video_repo" --filter @html-docs/html-video cli "$@"
fi

# A scoped package whose executable has a different name must be selected
# explicitly; `npx @html-docs/html-video` cannot infer `html-docs-video`.
exec npx -y --package @html-docs/html-video html-docs-video "$@"
