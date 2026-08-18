import { useState } from 'react';

import { isNativeShell, normalizeServerUrl } from '../lib/serverUrl';

interface ServerSetupProps {
  initialUrl: string;
  /** When true the operator may skip and use same-origin (browser only). */
  allowSkip?: boolean;
  /** Shown when editing an existing URL — returns to the dashboard without saving. */
  onCancel?: () => void;
  onSave: (url: string) => void;
}

/**
 * First-run / reconnect screen for the Android shell: the WebView is not served
 * by the Node backend, so the operator must point at the PC or Pi running it.
 *
 * This is NOT the station Configuration modal (callsign, Direwolf, APRS-IS) —
 * that lives in the dashboard sidebar once you are connected.
 */
export function ServerSetup({
  initialUrl,
  allowSkip = false,
  onCancel,
  onSave,
}: ServerSetupProps) {
  const [value, setValue] = useState(initialUrl || 'http://192.168.1.10:3001');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = normalizeServerUrl(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.url);
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4 sm:p-8">
      <form
        onSubmit={handleSubmit}
        className="panel w-full max-w-md rounded-2xl p-6 sm:p-8"
        aria-label="Backend server setup"
      >
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-400 text-slate-950 shadow-lg shadow-sky-500/20">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 21V9" strokeLinecap="round" />
            <circle cx="12" cy="6" r="2.2" />
            <path d="M7.5 13.5a6 6 0 0 1 0-8.5M16.5 5a6 6 0 0 1 0 8.5" strokeLinecap="round" />
            <path d="M9 21h6" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-slate-100">Connect to backend</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isNativeShell()
            ? 'The phone app only shows the dashboard. Direwolf, callsign and APRS-IS are configured on the PC or Raspberry Pi — enter that machine’s address here.'
            : 'Point the dashboard at a remote APRS WebChat backend.'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          After connecting, open the menu (☰) and tap <span className="font-semibold text-slate-300">Configuration</span> for
          callsign, Direwolf (TNC) and APRS-IS settings.
        </p>

        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Backend URL
          </span>
          <input
            className="input input-bordered w-full bg-black/30 font-mono text-sm"
            value={value}
            placeholder="http://192.168.1.10:3001"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
          />
        </label>

        {error ? (
          <p className="mt-2 text-xs text-rose-400" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Example: <span className="font-mono">http://192.168.1.20:3001</span> — same Wi‑Fi as the
            phone, backend started with <span className="font-mono">HOST=0.0.0.0</span>.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button type="submit" className="btn btn-primary">
            Connect
          </button>
          {onCancel ? (
            <button type="button" className="btn btn-ghost btn-sm text-slate-400" onClick={onCancel}>
              Cancel — back to dashboard
            </button>
          ) : null}
          {allowSkip ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-slate-400"
              onClick={() => onSave('')}
            >
              Use this origin instead
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
