const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readPackageJson(packagePath) {
  return JSON.parse(fs.readFileSync(path.join(root, packagePath), 'utf8'));
}

const languageServer = readPackageJson('packages/language-server/package.json');
const vscode = readPackageJson('packages/vscode/package.json');

if (languageServer.version !== vscode.version) {
  console.error(
    `Package versions must match: ${languageServer.name}@${languageServer.version} !== ${vscode.name}@${vscode.version}`,
  );
  process.exit(1);
}

console.log(`Package versions are synchronized: ${languageServer.version}`);
