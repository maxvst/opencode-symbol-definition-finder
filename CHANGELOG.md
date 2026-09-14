# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-14

### Added

- Initial release of the `opencode-semantic-lsp` OpenCode plugin.
- `semantic-lsp` plugin that overrides the built-in `lsp` tool interface: replaces `line`/`character`
  parameters with `symbol`/`fragment` and resolves exact coordinates before invoking the LSP server.
- npm packaging for distribution through an internal registry: `exports["./server"]` entrypoint,
  `engines.opencode`, controlled `files`, and `pack` / `pack:dir` build scripts.
