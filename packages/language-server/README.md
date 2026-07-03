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
