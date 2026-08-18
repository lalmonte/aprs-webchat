/**
 * Backend URL used by the Android (Capacitor) shell and optional remote
 * browser sessions. An empty string means "same origin" (normal web deploy).
 */

const STORAGE_KEY = 'aprs-webchat.serverUrl';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

/** True when the UI is running inside the Capacitor Android/iOS shell. */
export function isNativeShell(): boolean {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Reads a previously saved server URL, or the Vite build-time default. */
export function loadServerUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored.trim().replace(/\/+$/, '');
  } catch {
    // Private browsing / storage blocked — fall through.
  }

  const fromEnv = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim() ?? '';
  return fromEnv.replace(/\/+$/, '');
}

export function saveServerUrl(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, '');
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    // Ignore quota / private-mode failures; the in-memory value still works.
  }
}

/**
 * Validates and normalizes a user-entered backend URL.
 * Accepts host:port and fills in http:// for LAN addresses.
 */
export function normalizeServerUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  let value = input.trim();
  if (value === '') {
    return { ok: false, error: 'Enter the address of the APRS WebChat backend.' };
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Use http:// or https://.' };
  }

  // Strip a trailing slash so Socket.io joins paths cleanly.
  const url = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
  return { ok: true, url };
}
