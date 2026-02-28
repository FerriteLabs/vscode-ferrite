# Changelog

All notable changes to Ferrite for VS Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-02-28

### Added

- FerriteQL auto-completion with context-aware suggestions (columns, functions, sources)
- FerriteQL snippets: SELECT, COUNT, DELETE, top keys, expiring keys queries
- Vector search snippets (create index, similarity search)
- Semantic cache snippets (set, get)
- Time-travel history snippet
- Redis and Ferrite-specific command completions in FerriteQL provider

## [1.0.0] - 2025-01-23

### Added

- **FerriteQL**: Full syntax highlighting for FerriteQL query language
- **FerriteQL**: Code completion for commands, options, and keywords
- **FerriteQL**: Execute commands directly from editor with `Ctrl+Enter` / `Cmd+Enter`
- **Configuration**: Syntax highlighting and validation for `ferrite.toml` files
- **Connection Manager**: Multi-connection profile support with save/load/switch
- **Connection Manager**: Secure credential storage (VS Code machine-scoped settings)
- **Connection Manager**: Connection status indicator in status bar
- **Connection Manager**: Optional auto-connect on workspace open
- **Key Browser**: Browse keys with glob pattern matching
- **Key Browser**: View and inspect values for all data types (strings, hashes, lists, sets, sorted sets, streams)
- **Server Info**: Display server statistics, configuration, and connected clients
- **Output Formatting**: JSON, table, and raw output modes for query results
- **Snippets (JavaScript/TypeScript)**: Client setup, caching patterns, pub/sub, pipeline, transactions
- **Snippets (Python)**: Sync and async client patterns with decorators
- **Snippets (Rust)**: Client initialization and connection pool patterns
- **Snippets (FerriteQL)**: Common commands (GET, SET, HSET, ZADD, VECTOR.SEARCH, TS.ADD)
- **Diagnostics**: Real-time validation with error and typo detection

[Unreleased]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ferritelabs/vscode-ferrite/releases/tag/v1.0.0
