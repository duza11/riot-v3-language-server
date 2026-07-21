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

### Dynamic properties from any assignments

The language server keeps inferred object properties strict by default. Enable the following setting to allow dynamic child properties when a component property or nested property is also assigned a value inferred as `any`:

```json
{
  "riotV3.allowDynamicPropertiesFromAnyAssignments": true
}
```

For example, if `this.data` is first assigned an object literal and is also assigned `this.opts.data`, known child properties keep their inferred types while other child properties are treated as `any`. A `null` or `undefined` initializer is preserved as a nullable dynamic object, so optional chaining may still be required. Properties without an inferred `any` assignment, primitive properties, and properties with explicit JSDoc types remain strict.

Reload VS Code after changing this setting.

### TypeScript SDK

The extension follows the standard VS Code `typescript.tsdk` setting when selecting a workspace TypeScript SDK.

### Embedded languages

JavaScript, TypeScript, HTML, CSS, SCSS, Less, and Emmet features use their corresponding standard VS Code settings. For example, `javascript.validate.enable`, `typescript.preferences`, `html.format`, `css.*`, and `emmet.*` are handled by the embedded language services rather than Riot-specific settings.

## Supported Files

This extension activates for `.tag` files and targets Riot.js v3 syntax.

## Repository

Issues and source code are available at:

https://github.com/duza11/riot-v3-language-server
