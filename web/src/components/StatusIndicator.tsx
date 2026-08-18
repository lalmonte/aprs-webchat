import clsx from 'clsx';
import type { ConnectionState, ConnectorStatus } from '../types';

const STATE_STYLES: Record<ConnectionState, { dot: string; label: string; text: string }> = {
  connected: { dot: 'bg-emerald-400 text-emerald-400', label: 'Connected', text: 'text-emerald-300' },
  connecting: { dot: 'bg-amber-400 text-amber-400', label: 'Connecting', text: 'text-amber-300' },
  disconnected: { dot: 'bg-slate-500 text-slate-500', label: 'Disconnected', text: 'text-slate-400' },
  error: { dot: 'bg-rose-500 text-rose-500', label: 'Error', text: 'text-rose-300' },
};

interface StatusIndicatorProps {
  name: string;
  status: ConnectorStatus;
  onReconnect: () => void;
}

/** Sidebar row showing the live state of one connector plus a retry action. */
export function StatusIndicator({ name, status, onReconnect }: StatusIndicatorProps) {
  const style = STATE_STYLES[status.state];

  return (
    <div className="panel rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'size-2 shrink-0 rounded-full',
            style.dot,
            status.state === 'connecting' && 'signal-pulse',
          )}
          aria-hidden
        />
        <span className="flex-1 truncate text-xs font-semibold tracking-wide text-slate-200">
          {name}
        </span>
        <span className={clsx('text-[11px] font-medium', style.text)}>{style.label}</span>
        <button
          type="button"
          className="btn btn-ghost btn-xs px-1 text-slate-400 hover:text-slate-100"
          onClick={onReconnect}
          title={`Reconnect ${name}`}
          aria-label={`Reconnect ${name}`}
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-3-6.7" strokeLinecap="round" />
            <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="mt-1 truncate pl-4 text-[11px] text-slate-500" title={status.detail}>
        {status.endpoint ? `${status.endpoint} — ` : ''}
        {status.detail}
      </p>
    </div>
  );
}
