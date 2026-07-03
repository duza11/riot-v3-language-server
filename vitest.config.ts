import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.direnv/**', '**/dist/**', '**/out/**'],
    server: {
      deps: {
        external: [/[/\\]node_modules[/\\]/],
      },
    },
  },
});
