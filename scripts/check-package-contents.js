const { execFileSync } = require('node:child_process');

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

function assertSet(name, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((file) => !actualSet.has(file));
  const unexpected = actual.filter((file) => !expectedSet.has(file));

  if (missing.length || unexpected.length) {
    console.error(`${name} contents are not valid.`);
    if (missing.length) {
      console.error(
        `Missing files:\n${missing.map((file) => `  - ${file}`).join('\n')}`,
      );
    }
    if (unexpected.length) {
      console.error(
        `Unexpected files:\n${unexpected.map((file) => `  - ${file}`).join('\n')}`,
      );
    }
    process.exit(1);
  }

  console.log(`${name} contents are valid.`);
}

const npmPack = JSON.parse(
  run('npm', ['pack', '--dry-run', '--json'], {
    cwd: 'packages/language-server',
  }),
);

assertSet('npm package', npmPack[0].files.map((file) => file.path).sort(), [
  'LICENSE',
  'README.md',
  'bin/riot-v3-language-server.js',
  'dist/index.js',
  'package.json',
]);

const vsixFiles = run('pnpm', [
  '--filter',
  'riot-v3-language-features',
  'exec',
  'vsce',
  'ls',
  '--no-dependencies',
])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .sort();

assertSet('VSIX package', vsixFiles, [
  'LICENSE',
  'README.md',
  'dist/client.js',
  'package.json',
  'server/index.js',
]);
