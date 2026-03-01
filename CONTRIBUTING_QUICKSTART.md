# Contributing Quickstart — vscode-ferrite

Get up and running in 5 minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [VS Code](https://code.visualstudio.com/) (for testing the extension)
- A running Ferrite or Redis instance (for integration testing)

## Fork & Clone

```bash
gh repo fork ferritelabs/vscode-ferrite --clone
cd vscode-ferrite
```

## Build & Run

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch
```

## Test in VS Code

1. Open the project in VS Code: `code .`
2. Press `F5` to launch the Extension Development Host
3. In the new VS Code window, open a `.fql` file or use the Ferrite sidebar

## Lint

```bash
npm run lint
```

## Package

```bash
npm run package
# Creates a .vsix file you can install locally
```

## What to Work On

- Look for [good first issues](https://github.com/ferritelabs/vscode-ferrite/labels/good%20first%20issue)
- Add FerriteQL completions in `src/ferriteql-completions.ts`
- Add new snippets in `snippets/`
- Improve syntax highlighting in `syntaxes/`
- Enhance the key browser tree view in `src/providers/`

## Submitting Changes

1. Create a feature branch: `git checkout -b my-change`
2. Make your changes
3. Test with `F5` in VS Code + `npm run lint`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
5. Push and open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.
