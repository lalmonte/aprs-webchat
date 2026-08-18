import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Path helpers that work the same way under `tsx`, a normal `node dist/…`
 * start and a packaged single-file executable (`pkg` / SEA).
 */

type PackagedProcess = NodeJS.Process & { pkg?: unknown };

export function isPackaged(): boolean {
  return (
    process.env.APRS_PACKAGED === '1' ||
    typeof (process as PackagedProcess).pkg !== 'undefined'
  );
}

/** Directory that contains this module (snapshot path when packaged). */
export function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Writable directory for config and chat history.
 * Next to the executable when packaged; otherwise `server/data`.
 */
export function dataDir(): string {
  if (process.env.APRS_DATA_DIR) return resolve(process.env.APRS_DATA_DIR);
  if (isPackaged()) return resolve(dirname(process.execPath), 'data');
  // Dist lives in server/dist, sources in server/src — both sit beside data/.
  return resolve(moduleDir(), '../data');
}

/** Built React assets served by Fastify. */
export function webRoot(): string {
  if (process.env.APRS_WEB_ROOT) return resolve(process.env.APRS_WEB_ROOT);
  if (isPackaged()) return resolve(moduleDir(), 'public');
  return resolve(moduleDir(), '../../web/dist');
}
