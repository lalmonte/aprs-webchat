import { useEffect, useState } from 'react';

import type { ConfigUpdateResult, PublicConfig, StationConfig, TransportId } from '../types';

interface ConfigModalProps {
  open: boolean;
  config: PublicConfig | null;
  onClose: () => void;
  onSave: (patch: Partial<StationConfig>) => Promise<ConfigUpdateResult>;
}

/** Form model: every field is a string so inputs stay controlled. */
interface FormState {
  callsign: string;
  ssid: string;
  passcode: string;
  direwolfHost: string;
  direwolfPort: string;
  direwolfChannel: string;
  aprsisHost: string;
  aprsisPort: string;
  aprsisFilter: string;
  digipeaterPath: string;
  defaultTransport: TransportId;
  autoAck: boolean;
  enableRf: boolean;
  enableAprsIs: boolean;
  beaconEnabled: boolean;
  beaconIntervalMinutes: string;
  beaconLatitude: string;
  beaconLongitude: string;
  beaconComment: string;
  beaconSymbolCode: string;
  beaconTransport: TransportId;
}

const SYMBOL_OPTIONS: { code: string; label: string }[] = [
  { code: '-', label: 'Home station (-)' },
  { code: '>', label: 'Car (>)' },
  { code: '[', label: 'Person ([)' },
  { code: 'k', label: 'Truck (k)' },
  { code: 's', label: 'Boat (s)' },
  { code: 'b', label: 'Bicycle (b)' },
  { code: 'r', label: 'Antenna (r)' },
  { code: '#', label: 'Digipeater (#)' },
  { code: '&', label: 'Gateway (&)' },
  { code: '_', label: 'Weather (_)' },
];

function toFormState(config: PublicConfig): FormState {
  return {
    callsign: config.callsign,
    ssid: String(config.ssid),
    passcode: '',
    direwolfHost: config.direwolfHost,
    direwolfPort: String(config.direwolfPort),
    direwolfChannel: String(config.direwolfChannel),
    aprsisHost: config.aprsisHost,
    aprsisPort: String(config.aprsisPort),
    aprsisFilter: config.aprsisFilter,
    digipeaterPath: config.digipeaterPath,
    defaultTransport: config.defaultTransport,
    autoAck: config.autoAck,
    enableRf: config.enableRf,
    enableAprsIs: config.enableAprsIs,
    beaconEnabled: config.beaconEnabled ?? false,
    beaconIntervalMinutes: String(config.beaconIntervalMinutes ?? 10),
    beaconLatitude:
      config.beaconLatitude === 0 && config.beaconLongitude === 0
        ? ''
        : String(config.beaconLatitude ?? ''),
    beaconLongitude:
      config.beaconLatitude === 0 && config.beaconLongitude === 0
        ? ''
        : String(config.beaconLongitude ?? ''),
    beaconComment: config.beaconComment ?? '',
    beaconSymbolCode: config.beaconSymbolCode ?? '-',
    beaconTransport: config.beaconTransport ?? 'rf',
  };
}

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-slate-400';
const FIELD_INPUT = 'input input-sm input-bordered w-full bg-black/30';
const SECTION_TITLE =
  'mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-sky-300';

export function ConfigModal({ open, config, onClose, onSave }: ConfigModalProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Reload the form from the server state every time the modal is opened.
  useEffect(() => {
    if (open && config) {
      setForm(toFormState(config));
      setError(null);
    }
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Without a live backend there is no PublicConfig yet — tapping Configuration
  // used to open the modal and immediately render nothing (form stayed null).
  if (!form || !config) {
    return (
      <div
        className="modal modal-open z-[2000]"
        role="dialog"
        aria-modal="true"
        aria-label="Configuration unavailable"
      >
        <div className="modal-box max-w-md border border-white/10 bg-slate-900/95 p-4 backdrop-blur sm:p-6">
          <h3 className="text-base font-bold text-slate-100">Configuration unavailable</h3>
          <p className="mt-2 text-sm text-slate-400">
            Station settings (callsign, Direwolf, APRS-IS) live on the backend. Connect the phone to
            the PC or Raspberry Pi first, then open Configuration again.
          </p>
          <div className="modal-action mt-4">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
      </div>
    );
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    const patch: Partial<StationConfig> = {
      callsign: form.callsign,
      ssid: Number(form.ssid),
      direwolfHost: form.direwolfHost,
      direwolfPort: Number(form.direwolfPort),
      direwolfChannel: Number(form.direwolfChannel),
      aprsisHost: form.aprsisHost,
      aprsisPort: Number(form.aprsisPort),
      aprsisFilter: form.aprsisFilter,
      digipeaterPath: form.digipeaterPath,
      defaultTransport: form.defaultTransport,
      autoAck: form.autoAck,
      enableRf: form.enableRf,
      enableAprsIs: form.enableAprsIs,
      beaconEnabled: form.beaconEnabled,
      beaconIntervalMinutes: Number(form.beaconIntervalMinutes),
      beaconLatitude: Number(form.beaconLatitude),
      beaconLongitude: Number(form.beaconLongitude),
      beaconComment: form.beaconComment,
      beaconSymbolTable: '/',
      beaconSymbolCode: form.beaconSymbolCode,
      beaconTransport: form.beaconTransport,
    };

    // An empty passcode field means "keep the stored value".
    if (form.passcode.trim() !== '') patch.passcode = form.passcode.trim();

    const result = await onSave(patch);
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? 'The configuration could not be saved.');
      return;
    }
    onClose();
  }

  return (
    // The z-index clears Leaflet's map controls, which sit at 1000.
    <div
      className="modal modal-open z-[2000]"
      role="dialog"
      aria-modal="true"
      aria-label="Configuration"
    >
      <div className="modal-box max-h-[min(92dvh,56rem)] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto border border-white/10 bg-slate-900/95 p-4 backdrop-blur sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">Station Configuration</h3>
            <p className="text-xs text-slate-400">
              Changes are saved on the server and the affected connectors reconnect automatically.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
            aria-label="Close configuration"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-5">
          <fieldset>
            <legend className={SECTION_TITLE}>Station Identity</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Callsign</span>
                <input
                  className={`${FIELD_INPUT} font-mono uppercase`}
                  value={form.callsign}
                  maxLength={6}
                  required
                  onChange={(event) => update('callsign', event.target.value.toUpperCase())}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>SSID</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  min={0}
                  max={15}
                  value={form.ssid}
                  required
                  onChange={(event) => update('ssid', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>APRS-IS Passcode</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="password"
                  autoComplete="off"
                  placeholder={config?.hasPasscode ? '•••• (stored)' : '-1 (receive only)'}
                  value={form.passcode}
                  onChange={(event) => update('passcode', event.target.value)}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              The passcode is derived from your callsign and is required to transmit through
              APRS-IS. Leave the field empty to keep the stored value.
            </p>
          </fieldset>

          <fieldset>
            <legend className={SECTION_TITLE}>Direwolf TNC (KISS over TCP)</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={FIELD_LABEL}>Host</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  value={form.direwolfHost}
                  required
                  onChange={(event) => update('direwolfHost', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Port</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  min={1}
                  max={65535}
                  value={form.direwolfPort}
                  required
                  onChange={(event) => update('direwolfPort', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Channel</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  min={0}
                  max={15}
                  value={form.direwolfChannel}
                  required
                  onChange={(event) => update('direwolfChannel', event.target.value)}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              The channel must be one that Direwolf actually has: a single-radio setup only has
              channel 0. Direwolf silently discards packets sent to a channel it does not have.
            </p>
            <label className="mt-3 flex flex-col gap-1">
              <span className={FIELD_LABEL}>Digipeater Path</span>
              <input
                className={`${FIELD_INPUT} font-mono uppercase`}
                value={form.digipeaterPath}
                placeholder="WIDE1-1,WIDE2-1"
                onChange={(event) => update('digipeaterPath', event.target.value.toUpperCase())}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend className={SECTION_TITLE}>APRS-IS Server</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={FIELD_LABEL}>Server</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  value={form.aprsisHost}
                  required
                  onChange={(event) => update('aprsisHost', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Port</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  min={1}
                  max={65535}
                  value={form.aprsisPort}
                  required
                  onChange={(event) => update('aprsisPort', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Server Filter</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  value={form.aprsisFilter}
                  placeholder="m/100"
                  onChange={(event) => update('aprsisFilter', event.target.value)}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Port 14580 accepts server-side filters. "m/100" requests traffic from stations within
              100 km of your last known position.
            </p>
          </fieldset>

          <fieldset>
            <legend className={SECTION_TITLE}>Behaviour</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Default Transmission Mode</span>
                <select
                  className="select select-sm select-bordered w-full bg-black/30"
                  value={form.defaultTransport}
                  onChange={(event) => update('defaultTransport', event.target.value as TransportId)}
                >
                  <option value="rf">RF (Direwolf)</option>
                  <option value="aprsis">Internet (APRS-IS)</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={form.autoAck}
                    onChange={(event) => update('autoAck', event.target.checked)}
                  />
                  Automatically acknowledge received messages
                </label>
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-success"
                      checked={form.enableRf}
                      onChange={(event) => update('enableRf', event.target.checked)}
                    />
                    Enable RF
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-warning"
                      checked={form.enableAprsIs}
                      onChange={(event) => update('enableAprsIs', event.target.checked)}
                    />
                    Enable APRS-IS
                  </label>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className={SECTION_TITLE}>Position Beacon</legend>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-accent"
                checked={form.beaconEnabled}
                onChange={(event) => update('beaconEnabled', event.target.checked)}
              />
              Transmit a position beacon on a schedule
            </label>

            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Interval (minutes)</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  min={1}
                  max={120}
                  value={form.beaconIntervalMinutes}
                  disabled={!form.beaconEnabled}
                  onChange={(event) => update('beaconIntervalMinutes', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Transport</span>
                <select
                  className="select select-sm select-bordered w-full bg-black/30"
                  value={form.beaconTransport}
                  disabled={!form.beaconEnabled}
                  onChange={(event) => update('beaconTransport', event.target.value as TransportId)}
                >
                  <option value="rf">RF (Direwolf)</option>
                  <option value="aprsis">Internet (APRS-IS)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className={FIELD_LABEL}>Symbol</span>
                <select
                  className="select select-sm select-bordered w-full bg-black/30"
                  value={form.beaconSymbolCode}
                  disabled={!form.beaconEnabled}
                  onChange={(event) => update('beaconSymbolCode', event.target.value)}
                >
                  {SYMBOL_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Latitude</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  step="0.00001"
                  min={-90}
                  max={90}
                  placeholder="19.47400"
                  value={form.beaconLatitude}
                  disabled={!form.beaconEnabled}
                  onChange={(event) => update('beaconLatitude', event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={FIELD_LABEL}>Longitude</span>
                <input
                  className={`${FIELD_INPUT} font-mono`}
                  type="number"
                  step="0.00001"
                  min={-180}
                  max={180}
                  placeholder="-70.66367"
                  value={form.beaconLongitude}
                  disabled={!form.beaconEnabled}
                  onChange={(event) => update('beaconLongitude', event.target.value)}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={!form.beaconEnabled || locating}
                  onClick={() => {
                    if (!navigator.geolocation) {
                      setError('Geolocation is not available in this browser.');
                      return;
                    }
                    setLocating(true);
                    setError(null);
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        update('beaconLatitude', position.coords.latitude.toFixed(5));
                        update('beaconLongitude', position.coords.longitude.toFixed(5));
                        setLocating(false);
                      },
                      () => {
                        setError('Could not read the browser location.');
                        setLocating(false);
                      },
                      { enableHighAccuracy: true, timeout: 10_000 },
                    );
                  }}
                >
                  {locating ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    'Use my location'
                  )}
                </button>
              </div>
            </div>

            <label className="mt-3 flex flex-col gap-1">
              <span className={FIELD_LABEL}>
                Comment{' '}
                <span className="font-mono normal-case tracking-normal text-slate-500">
                  {form.beaconComment.length}/43
                </span>
              </span>
              <input
                className={FIELD_INPUT}
                maxLength={43}
                placeholder="QTH Santiago"
                value={form.beaconComment}
                disabled={!form.beaconEnabled}
                onChange={(event) => update('beaconComment', event.target.value)}
              />
            </label>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Sends an uncompressed position with messaging enabled (`=`). Fixed stations should
              usually stay at 10 minutes or more; the first beacon goes out a few seconds after
              saving.
            </p>
          </fieldset>

          {error ? (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal-action mt-0">
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : null}
              Save and reconnect
            </button>
          </div>
        </form>
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close" />
    </div>
  );
}
