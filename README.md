# Riot.js v3 Language Server

Language tooling for Riot.js v3 single-file components.

This repository contains a Volar-based language server for Riot.js v3 `.tag` files and a Visual Studio Code extension that packages the server for VS Code users.

## Packages

- `packages/language-server` - the standalone Riot.js v3 language server
- `packages/vscode` - the Visual Studio Code extension

## Features

- Language features for Riot.js v3 `.tag` files
- Template expression support
- Riot.js v3 script semantics, including instance properties, methods, multiple script blocks, open syntax, `each`, and class shorthand expressions
- Embedded HTML, CSS, Emmet, JavaScript, and TypeScript language services
- Rename, references, document highlights, diagnostics, completion, and hover for supported patterns

## Configuration

Inferred object properties are strict by default. VS Code users can enable dynamic child properties for component properties that also receive an inferred `any` value:

```json
{
  "riotV3.allowDynamicObjectProperties": true
}
```

Standalone LSP clients can use `initializationOptions.riotV3.allowDynamicObjectProperties`. See the package READMEs for configuration details and embedded language settings.

## Development

This project uses pnpm workspaces. The recommended development environment is the Nix flake in this repository.

```sh
nix develop
pnpm install
```

Build all packages:

```sh
pnpm run build
```

Run tests:

```sh
pnpm test
```

Watch both the language server and VS Code extension:

```sh
pnpm run watch
```

Build the VS Code extension package:

```sh
pnpm run pack
```

Build a VSIX package with Volar Labs support:

```sh
pnpm run pack:labs
```

Use this package when you want to inspect the extension with the Volar Labs VS Code extension. The regular `pnpm run pack` command builds the release package without Volar Labs integration.

## Nix

The flake exposes the standalone language server as the default package:

```sh
nix build
./result/bin/riot-v3-language-server --version
```

The Nix package uses a slim Node.js runtime and bundles the fallback TypeScript SDK needed by Volar.

## Repository

https://github.com/duza11/riot-v3-language-server
