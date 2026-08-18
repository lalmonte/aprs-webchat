import type { ConfigStore } from './config.js';
import { buildPositionPayload } from './protocol/position.js';
import type { LogLevel, TransportId } from './types.js';

/** Delay before the first beacon after the scheduler starts. */
const FIRST_BEACON_MS = 2_000;

type TransmitFn = (transport: TransportId, info: string) => { ok: boolean; error?: string };
type LogFn = (level: LogLevel, source: string, text: string) => void;

/**
 * Periodically transmits an uncompressed position report with a free-form
 * comment. The schedule is rebuilt whenever the configuration changes.
 */
export class BeaconScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigStore,
    private readonly transmit: TransmitFn,
    private readonly onLog: LogFn,
  ) {}

  /** Stops any running schedule and starts a new one from the current config. */
  restart(): void {
    this.stop();

    const settings = this.config.get();
    if (!settings.beaconEnabled) return;

    if (settings.beaconLatitude === 0 && settings.beaconLongitude === 0) {
      this.onLog(
        'error',
        'Beacon',
        'Enabled but coordinates are unset; transmission is skipped until they are configured.',
      );
      return;
    }

    const intervalMs = settings.beaconIntervalMinutes * 60_000;
    this.onLog(
      'system',
      'Beacon',
      `Enabled: every ${settings.beaconIntervalMinutes} min via ${settings.beaconTransport.toUpperCase()} ` +
        `at ${settings.beaconLatitude.toFixed(5)}, ${settings.beaconLongitude.toFixed(5)}.`,
    );

    this.timer = setTimeout(() => this.tick(intervalMs), FIRST_BEACON_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Transmits one beacon immediately using the current settings. */
  sendNow(): boolean {
    const settings = this.config.get();
    if (!settings.beaconEnabled) return false;

    let info: string;
    try {
      info = buildPositionPayload({
        latitude: settings.beaconLatitude,
        longitude: settings.beaconLongitude,
        symbolTable: settings.beaconSymbolTable,
        symbolCode: settings.beaconSymbolCode,
        comment: settings.beaconComment,
        messaging: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid beacon configuration.';
      this.onLog('error', 'Beacon', message);
      return false;
    }

    const result = this.transmit(settings.beaconTransport, info);
    if (!result.ok) {
      this.onLog('error', 'Beacon', `Transmission failed: ${result.error}`);
      return false;
    }

    this.onLog('system', 'Beacon', `Transmitted ${info}`);
    return true;
  }

  private tick(intervalMs: number): void {
    this.sendNow();
    this.timer = setTimeout(() => this.tick(intervalMs), intervalMs);
    this.timer.unref();
  }
}
