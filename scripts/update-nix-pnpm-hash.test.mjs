import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { readGotHash, replacePnpmDepsHash } = require('./update-nix-pnpm-hash');

describe('replacePnpmDepsHash', () => {
  test('replaces only the fetchPnpmDeps hash', () => {
    // Arrange
    const flake = `
      pnpmDeps = pkgs.fetchPnpmDeps {
        hash = "sha256-old=";
      };
      otherHash = "sha256-unchanged=";
    `;

    // Act
    const updated = replacePnpmDepsHash(flake, 'pkgs.lib.fakeHash');

    // Assert
    expect(updated).toContain('hash = pkgs.lib.fakeHash;');
    expect(updated).toContain('otherHash = "sha256-unchanged=";');
  });

  test('rejects a flake without exactly one pnpm dependency hash', () => {
    // Arrange
    const flake = 'otherHash = "sha256-unchanged=";';

    // Act
    const replace = () => replacePnpmDepsHash(flake, 'pkgs.lib.fakeHash');

    // Assert
    expect(replace).toThrow('Expected exactly one fetchPnpmDeps hash');
  });
});

describe('readGotHash', () => {
  test('reads the actual hash from Nix mismatch output', () => {
    // Arrange
    const output = `
      specified: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
         got:    sha256-xi275lyNAgOcT5JiypKN2KO/YsKZamD9Jdjy/8bF0WY=
    `;

    // Act
    const hash = readGotHash(output);

    // Assert
    expect(hash).toBe('sha256-xi275lyNAgOcT5JiypKN2KO/YsKZamD9Jdjy/8bF0WY=');
  });
});
