import clsx from 'clsx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

import {
  APRS_SYMBOLS_ATTRIBUTION,
  SYMBOL_DISPLAY_PX,
  buildAprsSymbolMarkerHtml,
} from '../lib/aprsSymbols';
import {
  TRANSPORT_LABELS,
  describeSymbol,
  formatAge,
  formatRainInches,
  formatTemperature,
  formatWind,
  knotsToKmh,
  mphToKmh,
} from '../lib/format';
import type { StationPosition, StationWeather } from '../types';

/** Stations older than this are drawn faded: the position may be stale. */
const STALE_AFTER_MS = 60 * 60 * 1000;

interface MapViewProps {
  positions: StationPosition[];
  weather: StationWeather[];
  station: string;
  onSelectStation: (callsign: string) => void;
  onClearPositions: () => void;
}

function markerKey(position: StationPosition): string {
  return position.name ?? position.callsign;
}

/**
 * Official APRS symbol sprites (hessu/aprs-symbols) with a transport-colour
 * pip and a callsign label. Leaflet's default marker images are not used.
 */
function buildIcon(position: StationPosition, stale: boolean): L.DivIcon {
  const size = SYMBOL_DISPLAY_PX;
  const colour = position.transport === 'rf' ? '#34d399' : '#fbbf24';

  return L.divIcon({
    className: 'aprs-symbol-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: buildAprsSymbolMarkerHtml({
      symbolTable: position.symbolTable,
      symbolCode: position.symbolCode,
      label: markerKey(position),
      transportColour: colour,
      stale,
      size,
    }),
  });
}

/** Frames the map around everything currently plotted. */
function FitBounds({ positions, auto }: { positions: StationPosition[]; auto: boolean }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (positions.length === 0) return;
    // Fit once when the first positions arrive, then leave the view alone so
    // the operator's panning and zooming is never overridden.
    if (auto && hasFitted.current) return;
    hasFitted.current = true;

    const bounds = L.latLngBounds(positions.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [positions, auto, map]);

  return null;
}

export function MapView({ positions, weather, station, onSelectStation, onClearPositions }: MapViewProps) {
  const [fitRequest, setFitRequest] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const now = Date.now();

  const plotted = useMemo(
    () => positions.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)),
    [positions],
  );

  useEffect(() => {
    if (plotted.length === 0) setConfirmingClear(false);
  }, [plotted.length]);

  const weatherByCall = useMemo(() => {
    const map = new Map<string, StationWeather>();
    for (const report of weather) map.set(report.callsign.toUpperCase(), report);
    return map;
  }, [weather]);

  if (plotted.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="panel max-w-md rounded-2xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">No positions received yet</h2>
          <p className="mt-2 text-sm text-slate-400">
            Stations appear here as soon as they send a position report over RF or APRS-IS.
            Position, Mic-E, compressed, object and item packets are all decoded.
          </p>
          <p className="mt-4 font-mono text-xs text-slate-500">Operating as {station}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      {/* Kept on the right: Leaflet puts its zoom control in the top-left corner. */}
      <div className="pointer-events-none absolute right-0 top-0 z-[1000] flex max-w-full flex-wrap items-start justify-end gap-2 p-2 sm:p-3">
        <span className="panel pointer-events-auto rounded-lg px-2.5 py-1 text-[11px] text-slate-300">
          <span className="font-mono font-semibold text-slate-100">{plotted.length}</span> station
          {plotted.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="btn btn-xs pointer-events-auto"
          onClick={() => setFitRequest((value) => value + 1)}
        >
          Fit all
        </button>
        {confirmingClear ? (
          <div className="panel pointer-events-auto flex items-center gap-1.5 rounded-lg px-2 py-1">
            <span className="text-[11px] text-slate-300">Clear map?</span>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setConfirmingClear(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-xs btn-error"
              onClick={() => {
                setConfirmingClear(false);
                onClearPositions();
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-xs btn-ghost pointer-events-auto text-slate-400"
            onClick={() => setConfirmingClear(true)}
          >
            Clear map
          </button>
        )}
      </div>

      <MapContainer
        center={[plotted[0]!.latitude, plotted[0]!.longitude]}
        zoom={9}
        className="min-h-0 flex-1"
        style={{ background: '#0b1120' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | ${APRS_SYMBOLS_ATTRIBUTION}`}
          maxZoom={19}
        />

        <FitBounds positions={plotted} auto={fitRequest === 0} key={fitRequest} />

        {plotted.map((position) => {
          const stale = now - position.timestamp > STALE_AFTER_MS;
          const wx = weatherByCall.get(position.callsign.toUpperCase());
          const isWeatherSymbol = position.symbolCode === '_';
          const wind = wx ? formatWind(wx.windDirection, wx.windSpeedMph) : null;
          return (
            <Marker
              key={markerKey(position)}
              position={[position.latitude, position.longitude]}
              icon={buildIcon(position, stale)}
            >
              <Popup>
                <div className="min-w-52 text-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block shrink-0"
                      // Official glyph preview next to the callsign.
                      dangerouslySetInnerHTML={{
                        __html: buildAprsSymbolMarkerHtml({
                          symbolTable: position.symbolTable,
                          symbolCode: position.symbolCode,
                          label: '',
                          transportColour:
                            position.transport === 'rf' ? '#34d399' : '#fbbf24',
                          size: 24,
                        }),
                      }}
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold">{markerKey(position)}</p>
                      {position.name ? (
                        <p className="text-[11px] text-slate-500">
                          {position.format === 'object' ? 'Object' : 'Item'} reported by{' '}
                          <span className="font-mono">{position.callsign}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-1 text-xs">{describeSymbol(position.symbolTable, position.symbolCode)}</p>

                  {wx?.comment || (!wx && position.comment) ? (
                    <p className="mt-1 border-l-2 border-slate-300 pl-2 text-xs italic">
                      {wx?.comment || position.comment}
                    </p>
                  ) : null}

                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <dt className="text-slate-500">Latitude</dt>
                    <dd className="text-right font-mono">{position.latitude.toFixed(5)}</dd>
                    <dt className="text-slate-500">Longitude</dt>
                    <dd className="text-right font-mono">{position.longitude.toFixed(5)}</dd>
                    {wx?.temperatureF !== undefined ? (
                      <>
                        <dt className="text-slate-500">Temperature</dt>
                        <dd className="text-right font-mono">
                          {formatTemperature(wx.temperatureF)}
                        </dd>
                      </>
                    ) : null}
                    {wind ? (
                      <>
                        <dt className="text-slate-500">Wind</dt>
                        <dd className="text-right font-mono">{wind}</dd>
                      </>
                    ) : null}
                    {wx?.windGustMph !== undefined ? (
                      <>
                        <dt className="text-slate-500">Gust</dt>
                        <dd className="text-right font-mono">
                          {Math.round(mphToKmh(wx.windGustMph))} km/h
                        </dd>
                      </>
                    ) : null}
                    {wx?.humidity !== undefined ? (
                      <>
                        <dt className="text-slate-500">Humidity</dt>
                        <dd className="text-right font-mono">{wx.humidity} %</dd>
                      </>
                    ) : null}
                    {wx?.pressureMb !== undefined ? (
                      <>
                        <dt className="text-slate-500">Pressure</dt>
                        <dd className="text-right font-mono">{wx.pressureMb.toFixed(1)} hPa</dd>
                      </>
                    ) : null}
                    {wx?.rainHourIn !== undefined ? (
                      <>
                        <dt className="text-slate-500">Rain 1h</dt>
                        <dd className="text-right font-mono">{formatRainInches(wx.rainHourIn)}</dd>
                      </>
                    ) : null}
                    {!isWeatherSymbol && position.speed !== undefined ? (
                      <>
                        <dt className="text-slate-500">Speed</dt>
                        <dd className="text-right font-mono">
                          {Math.round(knotsToKmh(position.speed))} km/h
                        </dd>
                      </>
                    ) : null}
                    {!isWeatherSymbol && position.course !== undefined ? (
                      <>
                        <dt className="text-slate-500">Course</dt>
                        <dd className="text-right font-mono">{position.course}&deg;</dd>
                      </>
                    ) : null}
                    {position.altitude !== undefined ? (
                      <>
                        <dt className="text-slate-500">Altitude</dt>
                        <dd className="text-right font-mono">{Math.round(position.altitude)} m</dd>
                      </>
                    ) : null}
                    <dt className="text-slate-500">Heard</dt>
                    <dd className="text-right">
                      {formatAge(position.timestamp)} via {TRANSPORT_LABELS[position.transport]}
                    </dd>
                  </dl>

                  <button
                    type="button"
                    className={clsx(
                      'mt-2 w-full rounded-md px-2 py-1 text-xs font-semibold',
                      'bg-slate-800 text-slate-100 hover:bg-slate-700',
                    )}
                    onClick={() => onSelectStation(position.callsign)}
                  >
                    Message {position.callsign}
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </section>
  );
}
