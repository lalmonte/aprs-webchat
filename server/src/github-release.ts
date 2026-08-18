import { APP_NAME, APP_VERSION } from './config.js';
import type { AppUpdateInfo } from './types.js';

/** Public GitHub repo that publishes tagged binary releases. */
export const GITHUB_RELEASE_REPO =
  process.env.APRS_GITHUB_REPO?.trim() || 'lalmonte/aprs-webchat';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 8_000;
const FETCH_TIMEOUT_MS = 12_000;

export function parseSemver(raw: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative if `a < b`, zero if equal, positive if `a > b`. */
export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i]! - right[i]!;
  }
  return 0;
}

export function isNewerRelease(latest: string, current: string): boolean {
  const delta = compareSemver(latest, current);
  return delta !== null && delta > 0;
}

interface GithubReleasePayload {
  tag_name?: unknown;
  html_url?: unknown;
  name?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

export function updateFromGithubRelease(
  payload: GithubReleasePayload,
  currentVersion: string,
): AppUpdateInfo | null {
  if (payload.draft === true || payload.prerelease === true) return null;
  if (typeof payload.tag_name !== 'string' || typeof payload.html_url !== 'string') return null;

  const latestVersion = payload.tag_name.replace(/^v/i, '');
  if (!isNewerRelease(latestVersion, currentVersion)) return null;

  return {
    currentVersion,
    latestVersion,
    releaseUrl: payload.html_url,
    releaseName: typeof payload.name === 'string' ? payload.name : undefined,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : undefined,
  };
}

export async function fetchLatestGithubRelease(
  repo = GITHUB_RELEASE_REPO,
): Promise<GithubReleasePayload> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${APP_NAME}/${APP_VERSION}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub releases HTTP ${response.status}`);
  }
  return (await response.json()) as GithubReleasePayload;
}

export function updateChecksEnabled(): boolean {
  const value = process.env.APRS_UPDATE_CHECK;
  if (value === undefined) return true;
  return /^(1|true|yes|on)$/i.test(value);
}

/**
 * Polls GitHub for a newer tagged release. Failures are swallowed so a Pi
 * without outbound HTTPS still runs the radio stack.
 */
export function startUpdateChecker(options: {
  currentVersion: string;
  onResult: (update: AppUpdateInfo | null) => void;
  log?: (message: string) => void;
}): { stop: () => void } {
  if (!updateChecksEnabled()) {
    options.log?.('GitHub update checks are disabled.');
    return { stop() {} };
  }

  let stopped = false;
  let timeout: NodeJS.Timeout | null = null;
  let interval: NodeJS.Timeout | null = null;

  const run = async () => {
    if (stopped) return;
    try {
      const payload = await fetchLatestGithubRelease();
      if (stopped) return;
      const update = updateFromGithubRelease(payload, options.currentVersion);
      options.onResult(update);
      if (update) {
        options.log?.(
          `Newer release available: ${update.latestVersion} (running ${update.currentVersion}).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log?.(`Update check skipped: ${message}`);
    }
  };

  timeout = setTimeout(() => {
    void run();
    interval = setInterval(() => {
      void run();
    }, CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);

  return {
    stop() {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
    },
  };
}
