# Riot.js v3 Language Features

Language support for Riot.js v3 single-file components in Visual Studio Code.

## Features

- Language features for `.tag` files
- Template expression support powered by Volar
- JavaScript and TypeScript support in Riot.js v3 script blocks
- CSS, HTML, and Emmet language services in embedded sections
- Completion, hover, diagnostics, rename, references, and document highlights for supported Riot.js v3 patterns

## Requirements

No project-local TypeScript installation is required. The extension uses the workspace TypeScript SDK when available and falls back to the bundled TypeScript SDK.

## Configuration

Riot-specific settings are disabled by default:

| Setting | Default | Description |
| --- | --- | --- |
| `riotV3.allowDynamicPropertiesFromAnyAssignments` | `false` | Allows dynamic child properties through inferred objects and arrays when the property also receives an inferred `any` value. |
| `riotV3.reportUnusedComponentMembers` | `false` | Reports component fields and methods that are not read within the same component. |

```json
{
  "riotV3.allowDynamicPropertiesFromAnyAssignments": true,
  "riotV3.reportUnusedComponentMembers": true
}
```

Reload VS Code after changing these settings.

### Setting behavior

`allowDynamicPropertiesFromAnyAssignments` preserves known inferred child types while treating other child properties as `any`. It applies when a component property or nested property is also assigned a value inferred as `any`. A `null` or `undefined` initializer remains nullable, so optional chaining may still be required. Properties without an inferred `any` assignment, primitive properties, and properties with explicit JSDoc types remain strict.

`reportUnusedComponentMembers` emits TypeScript-compatible 6133 hints for unused Riot component fields and methods. References from another component or file, including dynamic runtime access, are not considered. Keep the setting disabled when the project relies heavily on those patterns.

### TypeScript SDK

The extension follows the standard VS Code `typescript.tsdk` setting when selecting a workspace TypeScript SDK.

### Embedded languages

JavaScript, TypeScript, HTML, CSS, SCSS, Less, and Emmet features use their corresponding standard VS Code settings. For example, `javascript.validate.enable`, `typescript.preferences`, `html.format`, `css.*`, and `emmet.*` are handled by the embedded language services rather than Riot-specific settings.

## Supported Files

This extension activates for `.tag` files and targets Riot.js v3 syntax.

## Repository

Issues and source code are available at:

https://github.com/duza11/riot-v3-language-server
