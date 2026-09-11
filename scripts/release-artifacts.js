const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(file);
    if (!entry.isFile()) throw new Error(`Unsupported artifact entry: ${file}`);
    return [file];
  });
}

function prepareArtifacts(input, output, tag, verifyExisting = false) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error('Expected a stable vX.Y.Z tag');
  const version = tag.slice(1);
  const names = [
    `duza11-riot-v3-language-server-${version}.tgz`,
    `riot-v3-language-features-${version}.vsix`,
  ];
  const files = listFiles(input);
  const artifacts = ['.tgz', '.vsix'].map((extension, index) => {
    const matches = files.filter((file) => file.endsWith(extension));
    if (matches.length !== 1)
      throw new Error(`Expected exactly one ${extension} artifact`);
    if (path.basename(matches[0]) !== names[index])
      throw new Error('Unexpected artifact name');
    const bytes = fs.readFileSync(matches[0]);
    return {
      name: names[index],
      bytes,
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
  });

  if (
    files.some(
      (file) => ![...names, 'checksums.txt'].includes(path.basename(file)),
    )
  ) {
    throw new Error('Unexpected file in release artifacts');
  }
  if (verifyExisting) {
    const manifests = files.filter(
      (file) => path.basename(file) === 'checksums.txt',
    );
    if (manifests.length !== 1)
      throw new Error('Expected exactly one checksum manifest');
    const lines = fs.readFileSync(manifests[0], 'utf8').trim().split(/\r?\n/);
    const checksums = new Map();
    for (const line of lines) {
      const match = /^([a-f0-9]{64}) [ *](.+)$/.exec(line);
      if (!match) throw new Error('Invalid checksum entry');
      // Old artifacts contain absolute runner paths. Use only the basename;
      // never read a path supplied by the downloaded checksum manifest.
      const name = path.basename(match[2]);
      if (!names.includes(name) || checksums.has(name))
        throw new Error('Unexpected checksum entry');
      checksums.set(name, match[1]);
    }
    for (const artifact of artifacts) {
      if (checksums.get(artifact.name) !== artifact.hash)
        throw new Error(`Checksum mismatch: ${artifact.name}`);
    }
  }

  fs.mkdirSync(output);
  for (const artifact of artifacts)
    fs.writeFileSync(path.join(output, artifact.name), artifact.bytes);
  fs.writeFileSync(
    path.join(output, 'checksums.txt'),
    artifacts.map(({ name, hash }) => `${hash}  ${name}\n`).join(''),
  );
  return artifacts.map(({ name }) => path.resolve(output, name));
}

function verifyPackageVersions(tarball, vsix, tag) {
  const npmPackage = JSON.parse(
    execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );
  const extension = JSON.parse(
    execFileSync('unzip', ['-p', vsix, 'extension/package.json'], {
      encoding: 'utf8',
    }),
  );
  if (
    npmPackage.name !== '@duza11/riot-v3-language-server' ||
    extension.name !== 'riot-v3-language-features' ||
    extension.publisher !== 'duza11'
  ) {
    throw new Error('Unexpected package identity');
  }
  if (
    npmPackage.version !== tag.slice(1) ||
    extension.version !== tag.slice(1)
  ) {
    throw new Error('Package versions do not match the release tag');
  }
}

if (require.main === module) {
  const [input, output, tag, mode] = process.argv.slice(2);
  const [tarball, vsix] = prepareArtifacts(
    input,
    output,
    tag,
    mode === '--recover',
  );
  verifyPackageVersions(tarball, vsix, tag);
  console.log(`Verified release artifacts for ${tag}`);
}

module.exports = { prepareArtifacts, verifyPackageVersions };
