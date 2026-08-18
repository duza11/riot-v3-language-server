const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const flakePath = path.join(root, 'flake.nix');
const pnpmDepsHashPattern =
  /(pnpmDeps\s*=\s*pkgs\.fetchPnpmDeps\s*\{[\s\S]*?\n\s*hash\s*=\s*)(?:"sha256-[A-Za-z0-9+/=]+"|pkgs\.lib\.fakeHash)(;)/g;

function replacePnpmDepsHash(flake, hashExpression) {
  const matches = [...flake.matchAll(pnpmDepsHashPattern)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one fetchPnpmDeps hash, found ${matches.length}.`,
    );
  }

  return flake.replace(
    pnpmDepsHashPattern,
    (_, prefix, suffix) => `${prefix}${hashExpression}${suffix}`,
  );
}

function readGotHash(output) {
  return output.match(/got:\s+(sha256-[A-Za-z0-9+/=]+)/)?.[1];
}

function updateNixPnpmHash() {
  const originalFlake = fs.readFileSync(flakePath, 'utf8');

  try {
    const fakeHashFlake = replacePnpmDepsHash(
      originalFlake,
      'pkgs.lib.fakeHash',
    );
    fs.writeFileSync(flakePath, fakeHashFlake);

    const prefetch = spawnSync(
      'nix',
      ['build', '.#riot-v3-language-server', '--no-link'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const output = `${prefetch.stdout ?? ''}\n${prefetch.stderr ?? ''}`;
    const hash = readGotHash(output);
    if (!hash) {
      throw new Error(
        `Nix did not report the pnpm dependency hash.\n${output.trim()}`,
      );
    }

    fs.writeFileSync(
      flakePath,
      replacePnpmDepsHash(fakeHashFlake, JSON.stringify(hash)),
    );
    execFileSync('nix', ['build', '.#riot-v3-language-server', '--no-link'], {
      cwd: root,
      stdio: 'inherit',
    });
    console.log(`Updated pnpm dependency hash: ${hash}`);
  } catch (error) {
    fs.writeFileSync(flakePath, originalFlake);
    throw error;
  }
}

if (require.main === module) {
  updateNixPnpmHash();
}

module.exports = {
  readGotHash,
  replacePnpmDepsHash,
  updateNixPnpmHash,
};
