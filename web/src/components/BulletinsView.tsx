import { useMemo, useState } from 'react';

import { TRANSPORT_LABELS, formatAge } from '../lib/format';
import type { BulletinEntry } from '../types';

interface BulletinsViewProps {
  bulletins: BulletinEntry[];
  station: string;
  onSelectStation: (callsign: string) => void;
}

interface BulletinBoard {
  key: string;
  from: string;
  group: string;
  transport: BulletinEntry['transport'];
  updatedAt: number;
  lines: BulletinEntry[];
}

function lineSortKey(entry: BulletinEntry): string {
  if (entry.lineId === null) return entry.addressee;
  // Digits before letters, then natural order within each set.
  if (/^\d$/.test(entry.lineId)) return `0${entry.lineId}`;
  return `1${entry.lineId}`;
}

function groupBulletins(entries: BulletinEntry[]): BulletinBoard[] {
  const boards = new Map<string, BulletinBoard>();

  for (const entry of entries) {
    const key = `${entry.from}|${entry.group}`;
    const existing = boards.get(key);
    if (!existing) {
      boards.set(key, {
        key,
        from: entry.from,
        group: entry.group,
        transport: entry.transport,
        updatedAt: entry.timestamp,
        lines: [entry],
      });
      continue;
    }

    existing.lines.push(entry);
    if (entry.timestamp > existing.updatedAt) {
      existing.updatedAt = entry.timestamp;
      existing.transport = entry.transport;
    }
  }

  return [...boards.values()]
    .map((board) => ({
      ...board,
      lines: [...board.lines].sort((a, b) => lineSortKey(a).localeCompare(lineSortKey(b))),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function BulletinsView({ bulletins, station, onSelectStation }: BulletinsViewProps) {
  const boards = useMemo(() => groupBulletins(bulletins), [bulletins]);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const query = filter.trim().toUpperCase();
    if (query === '') return boards;
    return boards.filter(
      (board) =>
        board.from.includes(query) ||
        board.group.includes(query) ||
        board.lines.some((line) => line.text.toUpperCase().includes(query)),
    );
  }, [boards, filter]);

  if (boards.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="panel max-w-md rounded-2xl p-6 text-center sm:p-8">
          <h2 className="text-lg font-semibold text-slate-100">No bulletins yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Packet network bulletins and announcements addressed to{' '}
            <span className="font-mono">BLN…</span> appear here — general lines (
            <span className="font-mono">BLN0</span>–<span className="font-mono">BLNZ</span>) and
            group boards such as <span className="font-mono">BLNGATE</span>.
          </p>
          <p className="mt-4 font-mono text-xs text-slate-500">Operating as {station}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2 sm:px-4">
        <h2 className="text-sm font-semibold text-slate-200">Bulletins</h2>
        <span className="font-mono text-[11px] text-slate-500">
          {boards.length} board{boards.length === 1 ? '' : 's'} · {bulletins.length} line
          {bulletins.length === 1 ? '' : 's'}
        </span>
        <input
          type="search"
          className="input input-xs ml-auto w-full max-w-xs bg-black/30 font-mono uppercase placeholder:font-sans placeholder:normal-case sm:w-48"
          placeholder="Filter callsign / group…"
          value={filter}
          onChange={(event) => setFilter(event.target.value.toUpperCase())}
          aria-label="Filter bulletins"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {filtered.length === 0 ? (
          <p className="px-1 py-4 text-sm text-slate-500">No bulletins match the filter.</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {filtered.map((board) => (
              <article key={board.key} className="panel rounded-xl p-4">
                <header className="mb-3 flex flex-wrap items-baseline gap-2">
                  <button
                    type="button"
                    className="font-mono text-sm font-semibold text-sky-200 hover:underline"
                    onClick={() => onSelectStation(board.from)}
                  >
                    {board.from}
                  </button>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                    {board.group === 'GENERAL' ? 'General' : board.group}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {formatAge(board.updatedAt)} · {TRANSPORT_LABELS[board.transport]}
                  </span>
                </header>

                <ol className="flex flex-col gap-1.5">
                  {board.lines.map((line) => (
                    <li key={line.id} className="flex gap-2 text-sm">
                      <span className="w-10 shrink-0 font-mono text-[11px] text-slate-500">
                        {line.lineId ?? line.addressee.replace(/^BLN/, '')}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-200">
                        {line.text || (
                          <span className="italic text-slate-500">(empty line)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
