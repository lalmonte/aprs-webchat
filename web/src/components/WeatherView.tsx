import { useMemo } from 'react';

import {
  TRANSPORT_LABELS,
  formatAge,
  formatRainInches,
  formatTemperature,
  formatWind,
  mphToKmh,
} from '../lib/format';
import type { StationWeather } from '../types';

interface WeatherViewProps {
  weather: StationWeather[];
  station: string;
  onSelectStation: (callsign: string) => void;
}

function WeatherCard({
  report,
  onSelectStation,
}: {
  report: StationWeather;
  onSelectStation: (callsign: string) => void;
}) {
  const wind = formatWind(report.windDirection, report.windSpeedMph);
  const gust =
    report.windGustMph !== undefined
      ? `${Math.round(mphToKmh(report.windGustMph))} km/h`
      : null;

  return (
    <article className="panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            className="font-mono text-sm font-semibold text-sky-200 hover:underline"
            onClick={() => onSelectStation(report.callsign)}
          >
            {report.callsign}
          </button>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {formatAge(report.timestamp)} · {TRANSPORT_LABELS[report.transport]} · {report.format}
          </p>
        </div>
        {report.temperatureF !== undefined ? (
          <p className="text-right text-lg font-semibold tabular-nums text-slate-100">
            {fahrenheitShort(report.temperatureF)}
          </p>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {report.temperatureF !== undefined ? (
          <Field label="Temperature" value={formatTemperature(report.temperatureF)} />
        ) : null}
        {wind ? <Field label="Wind" value={wind} /> : null}
        {gust ? <Field label="Gust" value={gust} /> : null}
        {report.humidity !== undefined ? (
          <Field label="Humidity" value={`${report.humidity} %`} />
        ) : null}
        {report.pressureMb !== undefined ? (
          <Field label="Pressure" value={`${report.pressureMb.toFixed(1)} hPa`} />
        ) : null}
        {report.rainHourIn !== undefined ? (
          <Field label="Rain 1h" value={formatRainInches(report.rainHourIn)} />
        ) : null}
        {report.rain24hIn !== undefined ? (
          <Field label="Rain 24h" value={formatRainInches(report.rain24hIn)} />
        ) : null}
        {report.rainMidnightIn !== undefined ? (
          <Field label="Rain today" value={formatRainInches(report.rainMidnightIn)} />
        ) : null}
        {report.snow24hIn !== undefined ? (
          <Field label="Snow 24h" value={`${report.snow24hIn} in`} />
        ) : null}
        {report.luminosity !== undefined ? (
          <Field label="Luminosity" value={`${report.luminosity} W/m²`} />
        ) : null}
      </dl>

      {report.comment ? (
        <p className="mt-3 border-l-2 border-white/10 pl-2 text-xs italic text-slate-400">
          {report.comment}
        </p>
      ) : null}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}

function fahrenheitShort(f: number): string {
  return `${(((f - 32) * 5) / 9).toFixed(0)}°`;
}

export function WeatherView({ weather, station, onSelectStation }: WeatherViewProps) {
  const sorted = useMemo(
    () => [...weather].sort((a, b) => b.timestamp - a.timestamp),
    [weather],
  );

  if (sorted.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="panel max-w-md rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-100">No weather reports yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Temperature, wind, rain and pressure appear here when stations send APRS weather
            packets (symbol <span className="font-mono">_</span>, data type{' '}
            <span className="font-mono">_</span> or <span className="font-mono">*</span>).
          </p>
          <p className="mt-4 font-mono text-xs text-slate-500">Operating as {station}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Weather stations</h2>
        <span className="font-mono text-[11px] text-slate-500">
          {sorted.length} report{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sorted.map((report) => (
          <WeatherCard key={report.callsign} report={report} onSelectStation={onSelectStation} />
        ))}
      </div>
    </section>
  );
}
