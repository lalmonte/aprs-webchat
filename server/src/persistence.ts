import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ChatMessage, Conversation, StationPosition } from './types.js';
import { dataDir } from './runtime-paths.js';

/**
 * Chat history persisted to a JSON file so conversations, acknowledgement state
 * and the last known position of each station survive a restart.
 *
 * Writes are debounced and atomic: a busy APRS-IS feed would otherwise rewrite
 * the file on every packet, and a crash mid-write must not truncate it.
 */

const SAVE_DEBOUNCE_MS = 2_000;
/** Bumped when the on-disk shape changes; older files are then ignored. */
const FORMAT_VERSION = 1;

export interface PersistedState {
  version: number;
  savedAt: number;
  messages: ChatMessage[];
  conversations: Conversation[];
  positions: StationPosition[];
}

/** The part of the state a caller supplies; the rest is bookkeeping. */
export type DurableState = Omit<PersistedState, 'version' | 'savedAt'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class HistoryStore {
  private readonly path: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private pending: (() => DurableState) | null = null;

  constructor(path = process.env.APRS_HISTORY_PATH ?? resolve(dataDir(), 'history.json')) {
    this.path = resolve(path);
  }

  /** Reads the stored state, or null when there is nothing usable on disk. */
  load(): PersistedState | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch (error) {
      // A missing file is the normal first-run case.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Could not read the history file at ${this.path}:`, error);
      }
      return null;
    }

    if (!isRecord(parsed) || parsed.version !== FORMAT_VERSION) return null;

    return {
      version: FORMAT_VERSION,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      messages: Array.isArray(parsed.messages) ? (parsed.messages as ChatMessage[]) : [],
      conversations: Array.isArray(parsed.conversations)
        ? (parsed.conversations as Conversation[])
        : [],
      positions: Array.isArray(parsed.positions) ? (parsed.positions as StationPosition[]) : [],
    };
  }

  /** Queues a write; repeated calls inside the debounce window collapse into one. */
  scheduleSave(snapshot: () => DurableState): void {
    this.pending = snapshot;
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, SAVE_DEBOUNCE_MS);
    // A pending save must never hold the process open on shutdown.
    this.saveTimer.unref();
  }

  /** Writes any queued state immediately. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const snapshot = this.pending;
    this.pending = null;
    if (!snapshot) return;

    const state: PersistedState = { ...snapshot(), version: FORMAT_VERSION, savedAt: Date.now() };
    const temporaryPath = `${this.path}.tmp`;

    try {
      mkdirSync(dirname(this.path), { recursive: true });
      // Write then rename so a crash can never leave a half-written file.
      writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, 'utf8');
      renameSync(temporaryPath, this.path);
    } catch (error) {
      console.error(`Could not persist the history to ${this.path}:`, error);
    }
  }
}
