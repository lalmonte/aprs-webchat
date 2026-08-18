#!/usr/bin/env node
/**
 * Bump the project version, commit, tag, and push.
 *
 * GitHub Actions (.github/workflows/release.yml) then builds the binaries
 * and publishes the GitHub Release. Do not upload Android APKs.
 *
 *   npm run release          # patch (1.0.0 → 1.0.1)
 *   npm run release minor    # 1.0.1 → 1.1.0
 *   npm run release major    # 1.1.0 → 2.0.0
 *   npm run release 1.2.3    # exact version
 */

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] ?? 'patch';

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts }).trim();
}

function parseVersion(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw);
  if (!match) throw new Error(`Not a semver X.Y.Z version: ${raw}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const v = parseVersion(current);
  if (bump === 'major') return `${v.major + 1}.0.0`;
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (bump === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  throw new Error(`Unknown bump "${bump}". Use patch, minor, major, or X.Y.Z`);
}

function writeJson(path, mutator) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  mutator(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const status = git(['status', '--porcelain']);
if (status) {
  console.error('Working tree is not clean. Commit or stash first:\n');
  console.error(status);
  process.exit(1);
}

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = nextVersion(pkg.version, arg);
const tag = `v${version}`;

if (git(['tag', '-l', tag])) {
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
}

console.log(`Releasing ${pkg.version} → ${version}`);

writeJson(pkgPath, (data) => {
  data.version = version;
});
writeJson(join(root, 'server/package.json'), (data) => {
  data.version = version;
});
writeJson(join(root, 'web/package.json'), (data) => {
  data.version = version;
});

const configPath = join(root, 'server/src/config.ts');
const config = readFileSync(configPath, 'utf8');
const updated = config.replace(
  /export const APP_VERSION = '[^']+'/,
  `export const APP_VERSION = '${version}'`,
);
if (updated === config) {
  console.error('Could not update APP_VERSION in server/src/config.ts');
  process.exit(1);
}
writeFileSync(configPath, updated);

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## ${version}`)) {
  console.warn(
    `\nWarning: CHANGELOG.md has no "## ${version}" section. Add one before tagging next time.\n`,
  );
}

git(['add', 'package.json', 'server/package.json', 'web/package.json', 'server/src/config.ts']);
git(['commit', '-m', `Release ${tag}`]);
git(['tag', '-a', tag, '-m', `APRS WebChat ${tag}`]);

console.log(`Pushing main and ${tag}…`);
execSync('git push origin HEAD', { cwd: root, stdio: 'inherit' });
execSync(`git push origin ${tag}`, { cwd: root, stdio: 'inherit' });

console.log(`
Tagged ${tag}. GitHub Actions will build the binaries and publish:

  https://github.com/lalmonte/aprs-webchat/releases/tag/${tag}
`);
