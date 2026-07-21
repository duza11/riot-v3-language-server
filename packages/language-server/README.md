# @duza11/riot-v3-language-server

A standalone language server for Riot.js v3 single-file components.

The server is built on Volar and targets Riot.js v3 `.tag` files. It can be used by editors that support the Language Server Protocol, including Neovim, Helix, Zed, and other LSP clients.

## Installation

Install the package with your preferred package manager:

```sh
npm install -g @duza11/riot-v3-language-server
```

Or run it from this repository:

```sh
pnpm --filter @duza11/riot-v3-language-server build
pnpm --filter @duza11/riot-v3-language-server exec riot-v3-language-server
```

With Nix:

```sh
nix build github:duza11/riot-v3-language-server
./result/bin/riot-v3-language-server
```

## Command

```sh
riot-v3-language-server
```

The server communicates over stdio.

## TypeScript SDK

Volar requires a TypeScript SDK. This language server resolves it in the following order:

1. `initializationOptions.typescript.tsdk`
2. the bundled TypeScript SDK

Riot.js projects do not need to install TypeScript locally unless they want the language server to use a project-specific TypeScript version.

## Configuration

### Dynamic properties from any assignments

The language server keeps inferred object properties strict by default. Set `initializationOptions.riotV3.allowDynamicPropertiesFromAnyAssignments` to `true` to allow dynamic child properties when a component property or nested property is also assigned a value inferred as `any`.

```lua
init_options = {
  riotV3 = {
    allowDynamicPropertiesFromAnyAssignments = true,
  },
}
```

Known child properties keep their inferred types. A `null` or `undefined` initializer is preserved as a nullable dynamic object, so optional chaining may still be required. Properties without an inferred `any` assignment, primitive properties, and root or nested properties with explicit JSDoc types remain strict. Restart the language server after changing initialization options.

### Embedded languages

The JavaScript, TypeScript, HTML, CSS, SCSS, Less, and Emmet services read their standard configuration sections through `workspace/configuration` when the LSP client supports it. These settings are provided by the embedded language services and are not Riot-specific options.

## Neovim Example

Using Neovim's built-in LSP client:

```lua
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
  pattern = "*.tag",
  callback = function()
    vim.bo.filetype = "riot_v3"
  end,
})

vim.lsp.config("riot_v3", {
  cmd = { "riot-v3-language-server", "--stdio" },
  filetypes = { "riot_v3" },
  root_markers = { "package.json", ".git" },
  init_options = {
    typescript = {
      -- Optional. When omitted, the bundled TypeScript SDK is used.
      -- tsdk = "/path/to/node_modules/typescript/lib",
    },
    riotV3 = {
      -- Optional. Defaults to false.
      -- allowDynamicPropertiesFromAnyAssignments = true,
    },
  },
})

vim.lsp.enable("riot_v3")
```

If your LSP client starts servers without `--stdio`, use:

```lua
cmd = { "riot-v3-language-server" }
```

## VS Code

VS Code users should usually install the `Riot.js v3 Language Features` extension instead of configuring this package directly.

## Supported Files

This server targets Riot.js v3 `.tag` files.
