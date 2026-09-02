# Changelog

All notable changes to Ferrite for VS Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - Unreleased (planned)

### Changed

- Isolated configuration validation, command parsing, result formatting, language UI, and connection-profile tree responsibilities
- Removed the unused competing connection owner while preserving activation and command behavior
- Aligned completion metadata on the canonical `VECTOR.DEL` command
- Restored reproducible compile, lint, Electron test, packaging, and dependency-security gates
- Raised the minimum supported VS Code version to 1.96 to match the tested API surface
- Restored the marketplace and activity-bar icon assets required by VSIX packaging
- Bundle the extension and its `ioredis` runtime dependency into the published VSIX
- Align Marketplace links with the packaged `ferrite.ferrite` extension identity
- Require the exact canonical `v1.4.0` tag before Marketplace publication
- Use reachable GitHub project and documentation links until the hosted documentation endpoint is deployed and verified

## [1.3.1] - 2026-04-22

### Added

- TLS certificate-verification configuration

### Fixed

- Improved connection reliability and surfaced key-loading failures through the extension output channel

## [1.3.0] - 2026-04-20

### Added

- Snippet templates for all moonshot command families: `MEM.*`, `FN.*`, `CON.*`, `PNG.*`
- IntelliSense completions for Mnemo (MEM), Forge (FN), Concord (CON), and Pangea (PNG) commands
- FerriteQL grammar extended with moonshot command keywords and subcommands
- Dev container configuration for zero-setup contributor onboarding
- CodeQL security analysis workflow
- Prettier configuration for consistent code formatting

## [1.2.0] - 2026-03-09

### Added

- Key browser tree view filtering with glob patterns

### Fixed

- Fire disconnect event on connection close before auto-reconnect

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

[Unreleased]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ferritelabs/vscode-ferrite/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ferritelabs/vscode-ferrite/releases/tag/v1.0.0

### Troubleshooting

- **Connection timeout on large clusters**: The default connection timeout has been increased
  from 5s to 10s. Override with `ferrite.connectTimeout` in your VS Code settings.
- **Auto-reconnect not triggering**: Ensure `ferrite.autoReconnect` is set to `true` (default).
