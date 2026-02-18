# Contributing to Ferrite for VS Code

Thank you for your interest in contributing! This repository contains the official VS Code extension for Ferrite.

## Getting Started

- Familiarize yourself with the [main Ferrite contributing guide](https://github.com/ferritelabs/ferrite/blob/main/CONTRIBUTING.md) for general project standards
- Read the [VS Code Extension API docs](https://code.visualstudio.com/api)

## Prerequisites

- **Node.js 18+** and **npm**
- **VS Code** (latest stable)

## Development Setup

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Run linter
npm run lint

# Package as .vsix
npm run package
```

To test, press `F5` in VS Code to launch an Extension Development Host.

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/ferritelabs/vscode-ferrite/issues)
- Include your VS Code version, OS, and extension version

### Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes
4. Run `npm run lint && npm run compile` to verify
5. Test in the Extension Development Host
6. Commit with a clear message and open a Pull Request

## Guidelines

- Follow existing TypeScript conventions and project structure
- Add TextMate grammar rules to `syntaxes/` for new language features
- Add snippets to `snippets/` following existing patterns
- Update `package.json` contributes section for new features

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

Types: feat, fix, docs, chore, refactor, test
```

## Code of Conduct

Please be respectful, inclusive, and constructive in all interactions. See the [main project Code of Conduct](https://github.com/ferritelabs/ferrite/blob/main/CONTRIBUTING.md#code-of-conduct).

## License

By contributing, you agree that your contributions will be licensed under Apache-2.0.
