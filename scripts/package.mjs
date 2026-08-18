#!/usr/bin/env node
/**
 * Builds standalone executables for Windows, Linux, macOS and Raspberry Pi.
 *
 * Pipeline:
 *   1. Compile TypeScript + Vite frontend
 *   2. Stage a self-contained Node app (server dist + production deps + UI)
 *   3. Package with @yao-pkg/pkg (--sea) for each target
 *
 * Dependencies are NOT esbuild-bundled: Fastify/Socket.IO use dynamic
 * requires that break under an ESM mega-bundle. pkg's SEA VFS ships them
 * as files instead.
 *
 * Output lands in dist-bin/.
 */

import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  chmodSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, 'packaging');
const outDir = join(root, 'dist-bin');

/**
 * `copyFrom` reuses another finished binary under a friendlier name (e.g. the
 * Raspberry Pi build is the same linux-arm64 artifact).
 *
 * `APRS_PACKAGE_OS` (all | macos | linux) lets CI split macOS signing onto a
 * macOS runner. Apple Silicon kills unsigned Mach-O binaries with SIGKILL.
 */
const ALL_TARGETS = [
  { pkg: 'node22-macos-arm64', name: 'aprs-webchat-macos-arm64' },
  { pkg: 'node22-macos-x64', name: 'aprs-webchat-macos-x64' },
  { pkg: 'node22-linux-x64', name: 'aprs-webchat-linux-x64' },
  { pkg: 'node22-linux-arm64', name: 'aprs-webchat-linux-arm64' },
  {
    pkg: 'node22-linux-arm64',
    name: 'aprs-webchat-raspberry-pi-arm64',
    copyFrom: 'aprs-webchat-linux-arm64',
  },
  { pkg: 'node22-win-x64', name: 'aprs-webchat-win-x64.exe' },
];

function selectTargets() {
  const os = (process.env.APRS_PACKAGE_OS ?? 'all').toLowerCase();
  if (os === 'all') return ALL_TARGETS;
  if (os === 'macos') return ALL_TARGETS.filter((target) => target.pkg.includes('macos'));
  if (os === 'linux') {
    return ALL_TARGETS.filter(
      (target) => target.pkg.includes('linux') || target.pkg.includes('win'),
    );
  }
  throw new Error(`Unknown APRS_PACKAGE_OS="${os}". Use all, macos or linux.`);
}

const TARGETS = selectTargets();
const PKG_TARGETS = [...new Set(TARGETS.map((target) => target.pkg))];

function isMacBinary(name) {
  return name.includes('macos');
}

/** Ad-hoc codesign so Apple Silicon will actually execute the file. */
function adHocSignMac(filePath, name) {
  if (!isMacBinary(name)) return;
  if (process.platform !== 'darwin') {
    console.warn(`  ! ${name} is unsigned (codesign is only available on macOS).`);
    return;
  }
  try {
    execFileSync('codesign', ['--remove-signature', filePath], { stdio: 'pipe' });
  } catch {
    // Already unsigned.
  }
  execFileSync(
    'codesign',
    ['--force', '--sign', '-', '--timestamp=none', filePath],
    { stdio: 'inherit' },
  );
  execFileSync('codesign', ['--verify', filePath], { stdio: 'inherit' });
  console.log(`  ✓ ad-hoc signed ${name}`);
}

function step(label) {
  console.log(`\n▸ ${label}`);
}

function run(command, opts = {}) {
  execSync(command, { cwd: root, stdio: 'inherit', ...opts });
}

step('Building server and web');
run('npm run build');

step('Preparing packaging staging area');
rmSync(staging, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(staging, 'server'), { recursive: true });
mkdirSync(join(staging, 'public'), { recursive: true });
mkdirSync(outDir, { recursive: true });

const webDist = join(root, 'web/dist');
const serverDist = join(root, 'server/dist');
if (!existsSync(webDist) || !existsSync(serverDist)) {
  console.error('Build outputs are missing.');
  process.exit(1);
}

cpSync(webDist, join(staging, 'public'), { recursive: true });
cpSync(serverDist, join(staging, 'server'), { recursive: true });

const serverPkg = JSON.parse(readFileSync(join(root, 'server/package.json'), 'utf8'));
writeFileSync(
  join(staging, 'package.json'),
  `${JSON.stringify(
    {
      name: 'aprs-webchat',
      version: serverPkg.version ?? '1.0.0',
      type: 'module',
      bin: 'entry.js',
      dependencies: serverPkg.dependencies,
      pkg: {
        assets: ['public/**/*', 'server/**/*'],
        scripts: ['entry.js', 'server/**/*.js'],
        outputPath: '../dist-bin',
        targets: PKG_TARGETS,
        sea: true,
      },
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(staging, 'entry.js'),
  `/**
 * Packaged entry point. Sets paths so config/history land next to the
 * executable and the embedded UI is served from the snapshot VFS.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.APRS_PACKAGED = '1';
process.env.APRS_WEB_ROOT ??= join(dirname(fileURLToPath(import.meta.url)), 'public');

await import('./server/server.js');
`,
);

step('Installing production dependencies into staging');
// Use a project-local cache so a broken or root-owned ~/.npm cache cannot
// abort the release build (EACCES / EEXIST on mkdir inside _cacache).
const localNpmCache = join(root, '.npm-cache');
mkdirSync(localNpmCache, { recursive: true });
run(
  `npm install --omit=dev --no-package-lock --no-audit --no-fund --cache "${localNpmCache}"`,
  { cwd: staging },
);

writeFileSync(
  join(outDir, 'README.txt'),
  `APRS WebChat — standalone builds
================================

Download page: https://github.com/lalmonte/aprs-webchat/releases

Run the binary for your platform. It starts the local server and opens the
dashboard in your browser. Configuration and chat history are stored in a
"data" folder created next to the executable.

Environment overrides (optional):
  PORT=3001
  HOST=127.0.0.1
  APRS_OPEN_BROWSER=0     # do not open the browser automatically
  APRS_DATA_DIR=/path     # store config/history somewhere else

Direwolf still needs to be running separately if you want RF.

Raspberry Pi: use aprs-webchat-raspberry-pi-arm64 on a 64-bit Raspberry Pi OS
(Pi 3 / 4 / 5 / Zero 2 W). 32-bit Raspberry Pi OS is not supported.

macOS: Apple Silicon requires a code signature. GitHub builds are ad-hoc
signed on a Mac runner. If Safari/Chrome quarantines the download, right-click
→ Open the first time, or:
  xattr -d com.apple.quarantine ./aprs-webchat-macos-arm64

Android is not included in these builds.

Binaries:
${ALL_TARGETS.map((t) => `  - ${t.name}`).join('\n')}
`,
);

step('Packaging selected targets');
console.log(`  APRS_PACKAGE_OS=${process.env.APRS_PACKAGE_OS ?? 'all'}`);
console.log(`  ${TARGETS.map((target) => target.name).join(', ')}`);
const pkgCli = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');
const targetList = PKG_TARGETS.join(',');

execFileSync(
  process.execPath,
  [
    pkgCli,
    '.',
    '--sea',
    '--targets',
    targetList,
    '--out-path',
    outDir,
  ],
  { cwd: staging, stdio: 'inherit' },
);

step('Renaming outputs');
const produced = readdirSync(outDir).filter((name) => name.startsWith('aprs-webchat'));
console.log('  produced:', produced.join(', ') || '(none)');

for (const target of TARGETS) {
  const dest = join(outDir, target.name);

  if (target.copyFrom) {
    const source = join(outDir, target.copyFrom);
    if (!existsSync(source)) {
      console.warn(`  ! missing ${target.copyFrom}; cannot create ${target.name}`);
      continue;
    }
    cpSync(source, dest);
    try {
      chmodSync(dest, 0o755);
    } catch {
      // ignore
    }
    adHocSignMac(dest, target.name);
    console.log(`  ✓ ${target.name} (from ${target.copyFrom})`);
    continue;
  }

  const platform = target.pkg.replace(/^node22-/, '');
  const arch = platform.split('-').pop();
  const candidates = [
    dest,
    join(outDir, `aprs-webchat-${platform}`),
    join(outDir, `aprs-webchat-${arch}`),
    join(outDir, `aprs-webchat-${platform}.exe`),
    join(outDir, `aprs-webchat-${arch}.exe`),
    join(outDir, 'aprs-webchat'),
    join(outDir, 'aprs-webchat.exe'),
    join(outDir, `entry-${platform}`),
    join(outDir, `entry-${platform}.exe`),
    join(outDir, `entry-${arch}`),
    join(outDir, `entry-${arch}.exe`),
  ];

  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    console.warn(`  ! could not find binary for ${target.pkg}`);
    continue;
  }

  if (found !== dest) {
    cpSync(found, dest);
    // Only delete the source if it is not another target's final name.
    if (!TARGETS.some((t) => join(outDir, t.name) === found)) {
      rmSync(found, { force: true });
    }
  }

  if (!target.name.endsWith('.exe')) {
    try {
      chmodSync(dest, 0o755);
    } catch {
      // ignore
    }
  }
  adHocSignMac(dest, target.name);
  console.log(`  ✓ ${target.name}`);
}

const missing = TARGETS.filter((target) => !existsSync(join(outDir, target.name)));
if (missing.length > 0) {
  console.error(`Missing binaries: ${missing.map((t) => t.name).join(', ')}`);
  process.exit(1);
}

step('Writing SHA256SUMS');
const hashLines = TARGETS.map((target) => {
  const digest = createHash('sha256').update(readFileSync(join(outDir, target.name))).digest('hex');
  return `${digest}  ${target.name}`;
});
writeFileSync(join(outDir, 'SHA256SUMS'), `${hashLines.join('\n')}\n`);

console.log(`\nDone. Binaries are in ${outDir}`);
