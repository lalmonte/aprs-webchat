import { useEffect, useState } from 'react';

import type { AppUpdateInfo } from '../types';

const DISMISS_KEY = 'aprs-webchat.dismissed-release';
const NOTIFIED_KEY = 'aprs-webchat.notified-release';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / storage full — the banner simply comes back next load.
  }
}

interface UpdateBannerProps {
  update: AppUpdateInfo | null;
}

/**
 * In-app notice when GitHub has a newer tagged release than this build.
 * Dismissing hides it until a still-newer version appears.
 */
export function UpdateBanner({ update }: UpdateBannerProps) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readStorage(DISMISS_KEY),
  );

  useEffect(() => {
    if (!update) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (readStorage(NOTIFIED_KEY) === update.latestVersion) return;
    writeStorage(NOTIFIED_KEY, update.latestVersion);
    try {
      new Notification('APRS WebChat update', {
        body: `Version ${update.latestVersion} is available (you are on ${update.currentVersion}).`,
        tag: `aprs-webchat-${update.latestVersion}`,
      });
    } catch {
      // Some WebViews expose Notification but reject construction.
    }
  }, [update]);

  if (!update || dismissedVersion === update.latestVersion) return null;

  return (
    <div className="flex flex-col gap-2 bg-sky-500/15 px-3 py-2 text-xs text-sky-100 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="min-w-0">
        <span className="font-semibold text-sky-50">New release {update.latestVersion}</span>
        <span className="text-sky-200/90">
          {' '}
          — this station is running {update.currentVersion}. Download the binary for your
          platform from GitHub.
        </span>
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a
          href={update.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-xs btn-info"
        >
          Open release
        </a>
        <button
          type="button"
          className="btn btn-xs btn-ghost text-sky-100"
          onClick={() => {
            writeStorage(DISMISS_KEY, update.latestVersion);
            setDismissedVersion(update.latestVersion);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
