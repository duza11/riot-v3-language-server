require('esbuild')
  .context({
    entryPoints: {
      index: './src/index.ts',
    },
    sourcemap: true,
    bundle: true,
    metafile: process.argv.includes('--metafile'),
    outdir: './dist',
    external: ['typescript/lib/typescript.js'],
    format: 'cjs',
    platform: 'node',
    tsconfig: './tsconfig.json',
    define: { 'process.env.NODE_ENV': '"production"' },
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
    console.log('building language server...');
    if (process.argv.includes('--watch')) {
      await ctx.watch();
      console.log('watching language server...');
    } else {
      await ctx.rebuild();
      await ctx.dispose();
      console.log('finished language server.');
    }
  });
