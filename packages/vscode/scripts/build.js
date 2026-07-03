const fs = require('node:fs');
const path = require('node:path');

const enableVolarLabs =
  process.env.RIOT_V3_ENABLE_VOLAR_LABS === 'true' ||
  process.argv.includes('--volar-labs');

require('esbuild')
  .context({
    entryPoints: {
      client: './src/extension.ts',
    },
    sourcemap: true,
    bundle: true,
    metafile: process.argv.includes('--metafile'),
    outdir: './dist',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    tsconfig: './tsconfig.json',
    define: {
      'process.env.NODE_ENV': '"production"',
      __RIOT_V3_ENABLE_VOLAR_LABS__: JSON.stringify(enableVolarLabs),
    },
    minify: process.argv.includes('--minify'),
    plugins: [
      {
        name: 'umd2esm',
        setup(build) {
          build.onResolve(
            { filter: /^(vscode-.*-languageservice|jsonc-parser)/ },
            (args) => {
              const pathUmdMay = require.resolve(args.path, {
                paths: [args.resolveDir],
              });
              // Handle both POSIX and Windows path separators.
              const pathEsm = pathUmdMay
                .replace('/umd/', '/esm/')
                .replace('\\umd\\', '\\esm\\');
              return { path: pathEsm };
            },
          );
        },
      },
    ],
  })
  .then(async (ctx) => {
    console.log('building...');
    if (process.argv.includes('--watch')) {
      copyLanguageServer();
      await ctx.watch();
      console.log('watching...');
    } else {
      await ctx.rebuild();
      copyLanguageServer();
      await ctx.dispose();
      console.log('finished.');
    }
  });

function copyLanguageServer() {
  const source = path.resolve(__dirname, '../../language-server/dist/index.js');
  const sourceMap = path.resolve(
    __dirname,
    '../../language-server/dist/index.js.map',
  );
  const outDir = path.resolve(__dirname, '../server');
  const target = path.join(outDir, 'index.js');
  const targetMap = path.join(outDir, 'index.js.map');
  if (!fs.existsSync(source)) {
    throw new Error(
      'Language server output was not found. Run `pnpm --filter @duza11/riot-v3-language-server build` first.',
    );
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(source, target);
  if (fs.existsSync(sourceMap)) {
    fs.copyFileSync(sourceMap, targetMap);
  }
}
