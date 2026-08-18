# How to publish a new version

Releases are tagged Git commits. GitHub Actions builds the Windows, Linux,
macOS and Raspberry Pi binaries and attaches them to a GitHub Release.
**Android APKs are not published** (the companion app is not ready).

You do not run `npm run package` by hand unless you are testing locally.

## Prerequisites

- Clean `git status` on `main`
- Push access to <https://github.com/lalmonte/aprs-webchat>
- GitHub Actions enabled on the repository (default for a public repo)

## One command

```bash
npm run release          # 1.0.0 → 1.0.1  (patch)
npm run release minor    # 1.0.1 → 1.1.0
npm run release major    # 1.1.0 → 2.0.0
npm run release 1.2.3    # exact version
```

The script will:

1. Refuse to run if the working tree is dirty
2. Update the version in `package.json`, `server/package.json`, `web/package.json`
   and `server/src/config.ts`
3. Commit `Release vX.Y.Z`
4. Create git tag `vX.Y.Z`
5. Push `main` and the tag

GitHub then runs [`.github/workflows/release.yml`](../.github/workflows/release.yml).
Linux and Windows binaries are built on Ubuntu; **macOS binaries are built and
ad-hoc signed on a macOS runner** (Apple Silicon will SIGKILL an unsigned
download). When it finishes, the download page is:

<https://github.com/lalmonte/aprs-webchat/releases/latest>

## Before you tag

Add a `## X.Y.Z` section to [`CHANGELOG.md`](../CHANGELOG.md) describing what
changed for operators (messaging, map, RF, APRS-IS). The release notes on
GitHub are generated from the commits since the previous tag; the changelog
is what hams read.

## What gets attached

| Asset | Platform |
| --- | --- |
| `aprs-webchat-win-x64.exe` | Windows 64-bit |
| `aprs-webchat-linux-x64` | Linux x86_64 |
| `aprs-webchat-linux-arm64` | Linux ARM64 |
| `aprs-webchat-raspberry-pi-arm64` | Raspberry Pi (64-bit OS) |
| `aprs-webchat-macos-x64` | macOS Intel |
| `aprs-webchat-macos-arm64` | macOS Apple Silicon |
| `README.txt` | Short run instructions |
| `SHA256SUMS` | Checksums for the binaries |

## If the workflow fails

Open the failed run under **Actions**, fix the issue, delete the tag if needed,
and tag again (or bump to the next patch):

```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# fix, commit, then:
npm run release X.Y.Z
```

To package on your own machine (slow; downloads Node base images):

```bash
npm run package          # output in dist-bin/
```

Those local files are gitignored. Only CI uploads them to GitHub.
