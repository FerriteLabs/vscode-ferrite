# Clean-Code and Single-Responsibility Audit

## Summary

- BASE-001 restores deterministic compile, lint, and VS Code Electron test execution.
- The highest-leverage split is SRP-01: moving Ferrite configuration schema validation out of `extension.ts` removes the server-config actor from extension activation and command orchestration.
- SRP-02 isolates the pure command tokenizer and result formatter so protocol presentation can be tested without loading extension lifecycle code.
- SRP-03 deletes the unused `ConnectionManager`, which duplicated connection ownership while the extension continued to use separate global connection state.
- Language UI extraction is safe, but Pub/Sub and key-edit orchestration remain deferred until dedicated stateful characterization tests exist.

## Findings

| ID | location | category | severity P0/P1/P2 | actors-in-conflict | cost | size S/M/L | behavior risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BASE-001 | commit `99de499` | resolved verification blocker | P0 | test infrastructure, TypeScript contracts, and command parsing | Resolved: compiler and Electron suites now run against a compatible pinned VS Code release | S | Low |
| SRP-01 | `src/extension.ts:886-1092` | configuration validation | P1 | Ferrite configuration-schema owners and VS Code extension lifecycle owners | Every server config key/default change requires editing the activation module; validation tests load unrelated command/UI code | M | Low |
| SRP-02 | `src/extension.ts:654-746` | parsing and presentation | P1 | RESP/FerriteQL command grammar, output presentation, and command execution orchestration | Pure behavior is coupled to VS Code activation and global client state | S | Low |
| SRP-03 | `src/connectionManager.ts`; `src/extension.ts:23,123` | dead duplicated connection ownership | P1 | connection lifecycle/retry owners and extension command owners | TLS, heartbeat, reconnect, and disconnect behavior can diverge between an unused manager and the live global-client implementation | M | Low |
| SRP-04 | `src/extension.ts:1094-1220` | language and connection-tree UI | P2 | language tooling owners, connection-profile UI owners, and activation owners | Completion, hover, and tree changes enlarge the activation module and its review surface | M | Low |
| SRP-05 | `src/extension.ts:266-422` | Pub/Sub lifecycle | P2 | subscription lifecycle owners and general command/UI owners | Subscriber connection state, pattern dispatch, output, and prompts are difficult to test independently | M | Medium |
| SRP-06 | `src/extension.ts:1094-1168`; `src/ferriteql-completions.ts` | duplicated command catalog | P2 | command-product owners and two language-provider implementations | Catalog entries already diverge and can suggest different command names | M | High |

## Ordered Refactor Sequence

1. Keep BASE-001 as the characterization baseline.
2. Delete the unused `ConnectionManager` and its lifecycle hooks (SRP-03).
3. Move `parseCommand` and `formatResult` unchanged into a pure command-formatting module, preserving exports from `extension.ts` (SRP-02).
4. Move `validateConfigFile` and its schema tables unchanged into a configuration-validation module, preserving exports from `extension.ts` (SRP-01).
5. Move completion, hover, and connection-tree classes into cohesive UI modules while preserving exported class names (SRP-04).
6. Defer Pub/Sub extraction until subscription lifecycle tests exist (SRP-05).
7. Report command-catalog divergence at the organization level rather than coupling repositories or changing commands (SRP-06).

## Out of Scope

- The live command handlers in `extension.ts` remain together for this pass because they share the active client, output channels, tree providers, and VS Code prompt lifecycle; splitting them without dependency seams would create pass-through wrappers.
- Pub/Sub extraction is deferred because there is no independent coverage for subscriber connection reuse, pattern subscriptions, unsubscribe cleanup, and error reporting.
- The two command catalogs are not merged or rewritten because command metadata is a cross-repository public contract requiring a release-governance decision.
- Existing lint warnings are not swept globally; unrelated warning cleanup would obscure the structural changes.
