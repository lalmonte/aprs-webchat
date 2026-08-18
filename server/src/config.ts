import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PublicConfig, StationConfig, TransportId } from './types.js';
import { dataDir } from './runtime-paths.js';

/**
 * Runtime configuration. Values are read from environment variables on first
 * boot and can then be edited from the UI; edits are persisted so they survive
 * restarts.
 */

function configPath(): string {
  return process.env.APRS_CONFIG_PATH ?? resolve(dataDir(), 'config.json');
}

/** Application identity announced in the APRS-IS login line. */
export const APP_NAME = 'APRSWebChat';
export const APP_VERSION = '1.1.1';

/**
 * Experimental "tocall" used as the AX.25 destination of our packets. APZ***
 * is the range reserved for applications without a registered tocall.
 */
export const APRS_TOCALL = 'APZWCH';

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function defaults(): StationConfig {
  return {
    callsign: (process.env.APRS_CALLSIGN ?? 'N0CALL').toUpperCase(),
    ssid: intFromEnv('APRS_SSID', 10),
    passcode: process.env.APRS_PASSCODE ?? '-1',
    direwolfHost: process.env.DIREWOLF_HOST ?? '127.0.0.1',
    direwolfPort: intFromEnv('DIREWOLF_PORT', 8001),
    direwolfChannel: intFromEnv('DIREWOLF_CHANNEL', 0),
    aprsisHost: process.env.APRSIS_HOST ?? 'rotate.aprs2.net',
    aprsisPort: intFromEnv('APRSIS_PORT', 14580),
    aprsisFilter: process.env.APRSIS_FILTER ?? 'm/100',
    digipeaterPath: process.env.APRS_PATH ?? 'WIDE1-1,WIDE2-1',
    defaultTransport: (process.env.APRS_DEFAULT_TRANSPORT as TransportId) ?? 'rf',
    autoAck: boolFromEnv('APRS_AUTO_ACK', true),
    enableRf: boolFromEnv('APRS_ENABLE_RF', true),
    enableAprsIs: boolFromEnv('APRS_ENABLE_APRSIS', true),
    beaconEnabled: boolFromEnv('APRS_BEACON_ENABLED', false),
    beaconIntervalMinutes: intFromEnv('APRS_BEACON_INTERVAL', 10),
    beaconLatitude: Number.parseFloat(process.env.APRS_BEACON_LAT ?? '') || 0,
    beaconLongitude: Number.parseFloat(process.env.APRS_BEACON_LON ?? '') || 0,
    beaconComment: process.env.APRS_BEACON_COMMENT ?? '',
    beaconSymbolTable: process.env.APRS_BEACON_SYMBOL_TABLE ?? '/',
    beaconSymbolCode: process.env.APRS_BEACON_SYMBOL_CODE ?? '-',
    beaconTransport: (process.env.APRS_BEACON_TRANSPORT as TransportId) ?? 'rf',
  };
}

export class ConfigStore {
  private current: StationConfig;

  constructor() {
    this.current = { ...defaults(), ...this.readFromDisk() };
  }

  get(): StationConfig {
    return { ...this.current };
  }

  /** Full station identifier used on air, e.g. "K6KJZ-9". */
  get station(): string {
    const { callsign, ssid } = this.current;
    return ssid === 0 ? callsign : `${callsign}-${ssid}`;
  }

  toPublic(): PublicConfig {
    const { passcode, ...rest } = this.current;
    return { ...rest, hasPasscode: passcode.trim() !== '' && passcode.trim() !== '-1' };
  }

  /**
   * Applies a partial update after validation and persists it.
   * Returns the list of connectors whose settings changed so the caller can
   * restart only what is needed.
   */
  update(patch: Partial<StationConfig>): { config: StationConfig; restart: TransportId[] } {
    const next: StationConfig = { ...this.current };

    if (patch.callsign !== undefined) {
      const callsign = patch.callsign.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,6}$/.test(callsign)) {
        throw new Error('Callsign must be 3 to 6 alphanumeric characters, without SSID.');
      }
      next.callsign = callsign;
    }

    if (patch.ssid !== undefined) {
      const ssid = Number(patch.ssid);
      if (!Number.isInteger(ssid) || ssid < 0 || ssid > 15) {
        throw new Error('SSID must be an integer between 0 and 15.');
      }
      next.ssid = ssid;
    }

    if (patch.passcode !== undefined) {
      const passcode = patch.passcode.trim();
      if (passcode !== '' && passcode !== '-1' && !/^\d{1,6}$/.test(passcode)) {
        throw new Error('Passcode must be numeric, or -1 for a receive-only login.');
      }
      next.passcode = passcode === '' ? '-1' : passcode;
    }

    if (patch.direwolfHost !== undefined) {
      const host = patch.direwolfHost.trim();
      if (host === '') throw new Error('Direwolf host cannot be empty.');
      next.direwolfHost = host;
    }

    if (patch.aprsisHost !== undefined) {
      const host = patch.aprsisHost.trim();
      if (host === '') throw new Error('APRS-IS host cannot be empty.');
      next.aprsisHost = host;
    }

    for (const key of ['direwolfPort', 'aprsisPort'] as const) {
      if (patch[key] === undefined) continue;
      const port = Number(patch[key]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Ports must be integers between 1 and 65535.');
      }
      next[key] = port;
    }

    if (patch.direwolfChannel !== undefined) {
      const channel = Number(patch.direwolfChannel);
      if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
        throw new Error('Direwolf channel must be between 0 and 15.');
      }
      next.direwolfChannel = channel;
    }

    if (patch.aprsisFilter !== undefined) next.aprsisFilter = patch.aprsisFilter.trim();

    if (patch.digipeaterPath !== undefined) {
      next.digipeaterPath = patch.digipeaterPath.trim().toUpperCase();
      if (next.digipeaterPath.split(',').filter(Boolean).length > 8) {
        throw new Error('The digipeater path cannot exceed 8 hops.');
      }
    }

    if (patch.defaultTransport !== undefined) next.defaultTransport = patch.defaultTransport;
    if (patch.autoAck !== undefined) next.autoAck = Boolean(patch.autoAck);
    if (patch.enableRf !== undefined) next.enableRf = Boolean(patch.enableRf);
    if (patch.enableAprsIs !== undefined) next.enableAprsIs = Boolean(patch.enableAprsIs);

    if (patch.beaconEnabled !== undefined) next.beaconEnabled = Boolean(patch.beaconEnabled);

    if (patch.beaconIntervalMinutes !== undefined) {
      const minutes = Number(patch.beaconIntervalMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
        throw new Error('Beacon interval must be an integer between 1 and 120 minutes.');
      }
      next.beaconIntervalMinutes = minutes;
    }

    if (patch.beaconLatitude !== undefined) {
      const latitude = Number(patch.beaconLatitude);
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
        throw new Error('Beacon latitude must be between -90 and 90.');
      }
      next.beaconLatitude = latitude;
    }

    if (patch.beaconLongitude !== undefined) {
      const longitude = Number(patch.beaconLongitude);
      if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        throw new Error('Beacon longitude must be between -180 and 180.');
      }
      next.beaconLongitude = longitude;
    }

    if (patch.beaconComment !== undefined) {
      next.beaconComment = patch.beaconComment.replace(/[\r\n]+/g, ' ').slice(0, 43);
    }

    if (patch.beaconSymbolTable !== undefined) {
      const table = patch.beaconSymbolTable.trim();
      if (table !== '/' && table !== '\\') {
        throw new Error("Beacon symbol table must be '/' or '\\'.");
      }
      next.beaconSymbolTable = table;
    }

    if (patch.beaconSymbolCode !== undefined) {
      const code = patch.beaconSymbolCode.trim().slice(0, 1);
      if (!code || code === ' ') {
        throw new Error('Beacon symbol code must be a single non-space character.');
      }
      next.beaconSymbolCode = code;
    }

    if (patch.beaconTransport !== undefined) {
      if (patch.beaconTransport !== 'rf' && patch.beaconTransport !== 'aprsis') {
        throw new Error('Beacon transport must be rf or aprsis.');
      }
      next.beaconTransport = patch.beaconTransport;
    }

    if (next.beaconEnabled) {
      if (next.beaconLatitude === 0 && next.beaconLongitude === 0) {
        throw new Error('Set a real latitude and longitude before enabling the beacon.');
      }
    }

    const restart: TransportId[] = [];
    if (
      next.direwolfHost !== this.current.direwolfHost ||
      next.direwolfPort !== this.current.direwolfPort ||
      next.enableRf !== this.current.enableRf
    ) {
      restart.push('rf');
    }
    if (
      next.aprsisHost !== this.current.aprsisHost ||
      next.aprsisPort !== this.current.aprsisPort ||
      next.aprsisFilter !== this.current.aprsisFilter ||
      next.callsign !== this.current.callsign ||
      next.ssid !== this.current.ssid ||
      next.passcode !== this.current.passcode ||
      next.enableAprsIs !== this.current.enableAprsIs
    ) {
      restart.push('aprsis');
    }

    this.current = next;
    this.writeToDisk();
    return { config: this.get(), restart };
  }

  private readFromDisk(): Partial<StationConfig> {
    try {
      return JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<StationConfig>;
    } catch {
      return {};
    }
  }

  private writeToDisk(): void {
    try {
      const path = configPath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(this.current, null, 2)}\n`, 'utf8');
    } catch (error) {
      console.error('Unable to persist configuration:', error);
    }
  }
}
