import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatPreciseClock } from '../lib/format';
import type { LogEntry, LogLevel } from '../types';

/**
 * Colour code required for fast scanning:
 * green = RF transmit, cyan = RF receive, yellow = APRS-IS, red = errors.
 */
const LEVEL_STYLES: Record<LogLevel, { text: string; chip: string; label: string }> = {
  'rf-tx': { text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300', label: 'RF Tx' },
  'rf-rx': { text: 'text-cyan-300', chip: 'bg-cyan-500/15 text-cyan-300', label: 'RF Rx' },
  aprsis: { text: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-300', label: 'APRS-IS' },
  error: { text: 'text-rose-400', chip: 'bg-rose-500/15 text-rose-300', label: 'Errors' },
  system: { text: 'text-slate-400', chip: 'bg-slate-500/15 text-slate-300', label: 'System' },
};

const LEVEL_ORDER: LogLevel[] = ['rf-tx', 'rf-rx', 'aprsis', 'error', 'system'];

interface LogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogConsole({ logs, onClear }: LogConsoleProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
  );
  const [hidden, setHidden] = useState<Set<LogLevel>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const visibleLogs = useMemo(
    () => logs.filter((entry) => !hidden.has(entry.level)),
    [logs, hidden],
  );

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !autoScroll || collapsed) return;
    body.scrollTop = body.scrollHeight;
  }, [visibleLogs, autoScroll, collapsed]);

  function toggleLevel(level: LogLevel) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  return (
    <section
      className={clsx(
        'flex shrink-0 flex-col border-t border-white/10 bg-[#0a0e14]/95 transition-[height] duration-200',
        collapsed ? 'h-10' : 'h-40 sm:h-52 lg:h-64',
      )}
      aria-label="System logs"
    >
      <header className="flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto px-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          className="btn btn-ghost btn-xs gap-1 px-1 text-slate-300"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
        >
          <svg
            viewBox="0 0 24 24"
            className={clsx('size-3.5 transition-transform', !collapsed && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] font-semibold uppercase tracking-widest">
            <span className="sm:hidden">Logs</span>
            <span className="hidden sm:inline">System Logs</span>
          </span>
        </button>

        <span className="font-mono text-[11px] text-slate-500">{visibleLogs.length}</span>

        <div className="flex flex-nowrap items-center gap-1">
          {LEVEL_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              className={clsx(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-opacity',
                LEVEL_STYLES[level].chip,
                hidden.has(level) && 'opacity-30',
              )}
              aria-pressed={!hidden.has(level)}
              title={`Toggle ${LEVEL_STYLES[level].label} lines`}
            >
              {LEVEL_STYLES[level].label}
            </button>
          ))}
        </div>

        <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
          <input
            type="checkbox"
            className="toggle toggle-xs"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
          />
          <span className="hidden sm:inline">Follow</span>
        </label>

        <button type="button" className="btn btn-ghost btn-xs shrink-0 text-slate-400" onClick={onClear}>
          Clear
        </button>
      </header>

      {collapsed ? null : (
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 font-mono text-[11px] leading-[1.45] sm:px-3 sm:text-[11.5px]"
        >
          {visibleLogs.length === 0 ? (
            <p className="py-3 text-slate-600">No log entries to display.</p>
          ) : (
            visibleLogs.map((entry) => (
              <div key={entry.id} className="flex gap-2 whitespace-pre-wrap break-all">
                <span className="shrink-0 text-slate-600">{formatPreciseClock(entry.timestamp)}</span>
                <span className={clsx('w-14 shrink-0 truncate sm:w-20', LEVEL_STYLES[entry.level].text)}>
                  [{entry.source}]
                </span>
                <span className={LEVEL_STYLES[entry.level].text}>{entry.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
