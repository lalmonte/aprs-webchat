import { useMemo, useState } from 'react';

import { TRANSPORT_LABELS, formatAge } from '../lib/format';
import type { StationTelemetry, TelemetryEquations } from '../types';

interface TelemetryViewProps {
  telemetry: StationTelemetry[];
  station: string;
  onSelectStation: (callsign: string) => void;
}

function scale(raw: number, eq: TelemetryEquations): number {
  return eq.a * raw * raw + eq.b * raw + eq.c;
}

function Sparkline({ values, stroke = '#38bdf8' }: { values: number[]; stroke?: string }) {
  if (values.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center text-[11px] text-slate-500">
        Waiting for more samples…
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 280;
  const height = 64;
  const pad = 4;

  const points = values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function formatScaled(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function TelemetryView({ telemetry, station, onSelectStation }: TelemetryViewProps) {
  const sorted = useMemo(
    () => [...telemetry].sort((a, b) => b.updatedAt - a.updatedAt),
    [telemetry],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const activeCallsign = selected ?? sorted[0]?.callsign ?? null;
  const active = sorted.find((entry) => entry.callsign === activeCallsign) ?? null;

  if (sorted.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="panel max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-100">No telemetry yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Stations that emit <span className="font-mono">T#…</span> packets appear here. Channel
            names and units arrive via <span className="font-mono">PARM</span> /{' '}
            <span className="font-mono">UNIT</span> / <span className="font-mono">EQNS</span> when
            the station publishes them.
          </p>
          <p className="mt-4 font-mono text-xs text-slate-500">Operating as {station}</p>
        </div>
      </section>
    );
  }

  const channelCount = active
    ? Math.max(...active.samples.map((sample) => sample.analog.length), 0)
    : 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="shrink-0 overflow-y-auto border-b border-white/5 md:w-56 md:border-b-0 md:border-r">
        <ul className="p-2">
          {sorted.map((entry) => {
            const isActive = entry.callsign === activeCallsign;
            return (
              <li key={entry.callsign}>
                <button
                  type="button"
                  onClick={() => setSelected(entry.callsign)}
                  className={
                    isActive
                      ? 'w-full rounded-lg bg-sky-500/15 px-3 py-2 text-left ring-1 ring-sky-400/30'
                      : 'w-full rounded-lg px-3 py-2 text-left hover:bg-white/5'
                  }
                >
                  <p className="font-mono text-xs font-semibold text-slate-100">{entry.callsign}</p>
                  <p className="text-[10px] text-slate-500">
                    {entry.samples.length} sample{entry.samples.length === 1 ? '' : 's'} ·{' '}
                    {formatAge(entry.updatedAt)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {active ? (
          <>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <button
                  type="button"
                  className="font-mono text-base font-semibold text-sky-200 hover:underline"
                  onClick={() => onSelectStation(active.callsign)}
                >
                  {active.callsign}
                </button>
                <p className="text-[11px] text-slate-500">
                  {TRANSPORT_LABELS[active.transport]} · {formatAge(active.updatedAt)}
                  {active.definitions.projectTitle
                    ? ` · ${active.definitions.projectTitle}`
                    : ''}
                </p>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                seq {active.samples.at(-1)?.sequence ?? '—'}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: channelCount }, (_, channel) => {
                const name = active.definitions.names[channel] ?? `A${channel + 1}`;
                const unit = active.definitions.units[channel] ?? '';
                const eq = active.definitions.equations[channel] ?? { a: 0, b: 1, c: 0 };
                const values = active.samples
                  .map((sample) => sample.analog[channel])
                  .filter((value): value is number => value !== undefined)
                  .map((raw) => scale(raw, eq));
                const latest = values.at(-1);

                return (
                  <article key={channel} className="panel rounded-xl p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-200">
                        {name}
                        {unit ? (
                          <span className="ml-1 font-normal text-slate-500">({unit})</span>
                        ) : null}
                      </h3>
                      {latest !== undefined ? (
                        <span className="font-mono text-sm tabular-nums text-slate-100">
                          {formatScaled(latest)}
                          {unit ? ` ${unit}` : ''}
                        </span>
                      ) : null}
                    </div>
                    <Sparkline values={values} />
                  </article>
                );
              })}
            </div>

            {active.samples.at(-1)?.digital ? (
              <div className="panel mt-3 rounded-xl p-3">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">Digital bits</h3>
                <div className="flex flex-wrap gap-2">
                  {active.samples.at(-1)!.digital!.map((bit, index) => {
                    const name = active.definitions.names[5 + index] ?? `B${index + 1}`;
                    const sense = active.definitions.bitSense[index] !== false;
                    const activeBit = sense ? bit : !bit;
                    return (
                      <span
                        key={index}
                        className={
                          activeBit
                            ? 'rounded-md bg-emerald-500/20 px-2 py-1 font-mono text-[11px] text-emerald-200'
                            : 'rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-500'
                        }
                        title={name}
                      >
                        {name}: {bit ? '1' : '0'}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
