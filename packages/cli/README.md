# `@html-docs/cli`

The root package remains `@html-docs/cli` so every existing install command,
MCP configuration, binary name, and publishing workflow stays compatible.

This workspace boundary documents the CLI package in the public monorepo while
the release entrypoint remains [`../../bin/cli.js`](../../bin/cli.js). The CLI
coordinates source projects and delegates deterministic media work to
`@html-docs/html-video`; it never invokes a hidden authoring model.
