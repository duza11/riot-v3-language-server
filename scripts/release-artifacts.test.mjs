import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { prepareArtifacts } = require('./release-artifacts');
const temporaryDirectories = [];
const tarball = 'duza11-riot-v3-language-server-1.0.0.tgz';
const vsix = 'riot-v3-language-features-1.0.0.vsix';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(legacy = false) {
  const root = mkdtempSync(join(tmpdir(), 'riot-release-'));
  temporaryDirectories.push(root);
  const input = join(root, 'input');
  const output = join(root, 'output');
  const vsixDirectory = legacy ? join(input, 'packages/vscode') : input;
  mkdirSync(vsixDirectory, { recursive: true });
  writeFileSync(join(input, tarball), 'npm bytes');
  writeFileSync(join(vsixDirectory, vsix), 'vsix bytes');
  return { input, output };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release artifact preparation', () => {
  test('creates a flat bundle with portable checksums', () => {
    // Arrange
    const { input, output } = fixture();

    // Act
    prepareArtifacts(input, output, 'v1.0.0');

    // Assert
    expect(readdirSync(output).sort()).toEqual(
      ['checksums.txt', tarball, vsix].sort(),
    );
    expect(readFileSync(join(output, 'checksums.txt'), 'utf8')).toBe(
      `${hash('npm bytes')}  ${tarball}\n${hash('vsix bytes')}  ${vsix}\n`,
    );
  });

  test('verifies legacy absolute checksum paths and preserves artifact bytes', () => {
    // Arrange
    const { input, output } = fixture(true);
    writeFileSync(
      join(input, 'checksums.txt'),
      `${hash('npm bytes')}  /home/runner/work/repo/${tarball}\n${hash('vsix bytes')}  /home/runner/work/repo/packages/vscode/${vsix}\n`,
    );

    // Act
    prepareArtifacts(input, output, 'v1.0.0', true);

    // Assert
    expect(readFileSync(join(output, tarball), 'utf8')).toBe('npm bytes');
    expect(readFileSync(join(output, vsix), 'utf8')).toBe('vsix bytes');
  });

  test('accepts a recovered bundle with relative checksums', () => {
    // Arrange
    const { input, output } = fixture();
    writeFileSync(
      join(input, 'checksums.txt'),
      `${hash('npm bytes')}  ${tarball}\n${hash('vsix bytes')}  ${vsix}\n`,
    );

    // Act
    prepareArtifacts(input, output, 'v1.0.0', true);

    // Assert
    expect(readFileSync(join(output, tarball), 'utf8')).toBe('npm bytes');
  });

  test('rejects tampered bytes before creating output', () => {
    // Arrange
    const { input, output } = fixture();
    writeFileSync(
      join(input, 'checksums.txt'),
      `${hash('original')}  ${tarball}\n${hash('vsix bytes')}  ${vsix}\n`,
    );

    // Act
    const prepare = () => prepareArtifacts(input, output, 'v1.0.0', true);

    // Assert
    expect(prepare).toThrow('Checksum mismatch');
  });

  test('requires checksums when recovering an existing bundle', () => {
    // Arrange
    const { input, output } = fixture();

    // Act
    const prepare = () => prepareArtifacts(input, output, 'v1.0.0', true);

    // Assert
    expect(prepare).toThrow();
  });

  test('rejects duplicate package files instead of selecting the first', () => {
    // Arrange
    const { input, output } = fixture(true);
    writeFileSync(join(input, vsix), 'duplicate');

    // Act
    const prepare = () => prepareArtifacts(input, output, 'v1.0.0');

    // Assert
    expect(prepare).toThrow('Expected exactly one');
  });

  test('rejects artifacts for a different release version', () => {
    // Arrange
    const { input, output } = fixture();

    // Act
    const prepare = () => prepareArtifacts(input, output, 'v2.0.0');

    // Assert
    expect(prepare).toThrow('Unexpected artifact name');
  });
});
