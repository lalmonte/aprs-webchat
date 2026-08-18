/**
 * APRS weather decoding.
 *
 * Two common shapes appear on the air:
 *
 *   1. Position + weather symbol `_`:
 *        @091842z4256.20N/07049.42W_310/004g015t081r000p033P002h54b10001
 *      Wind sits in the fixed CSE/SPD slot; the rest uses lettered fields.
 *
 *   2. Positionless weather (data type `_`):
 *        _123456c000s000g000t069r000p000P000h00b10130
 *
 * Units follow the APRS 1.0.1 / WX.TXT conventions (mph, °F, hundredths of
 * an inch, tenths of a millibar). Display helpers convert to metric.
 */

export interface WeatherReport {
  /** Wind direction, degrees true. */
  windDirection?: number;
  /** Sustained wind speed, mph. */
  windSpeedMph?: number;
  /** Peak gust in the last 5 minutes, mph. */
  windGustMph?: number;
  /** Temperature, degrees Fahrenheit. */
  temperatureF?: number;
  /** Rain in the last hour, inches. */
  rainHourIn?: number;
  /** Rain in the last 24 hours, inches. */
  rain24hIn?: number;
  /** Rain since midnight, inches. */
  rainMidnightIn?: number;
  /** Snow in the last 24 hours, inches. */
  snow24hIn?: number;
  /** Relative humidity, 0–100 %. */
  humidity?: number;
  /** Barometric pressure, millibars (hPa). */
  pressureMb?: number;
  /** Luminosity, W/m². */
  luminosity?: number;
  /** Free-form comment left after the weather fields. */
  comment: string;
  /** How the packet was encoded. */
  format: 'position' | 'positionless' | 'peet';
}

const HUNDREDTHS = 0.01;

/** Parses a signed/unsigned integer field that may be filled with dots or spaces. */
function parseWeatherNumber(raw: string): number | undefined {
  const trimmed = raw.replace(/[ .]/g, '');
  if (trimmed === '' || /^[.\-]+$/.test(raw.trim())) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Extracts lettered weather fields (g/t/r/p/P/h/b/s/L/l/#) from a string.
 * Fields may appear in any order; unknown letters are left in the comment.
 */
export function parseWeatherDataFields(text: string): {
  weather: Omit<WeatherReport, 'format' | 'comment' | 'windDirection' | 'windSpeedMph'>;
  comment: string;
} {
  const weather: Omit<WeatherReport, 'format' | 'comment' | 'windDirection' | 'windSpeedMph'> = {};
  let rest = text;

  const take = (pattern: RegExp, apply: (value: string) => void): void => {
    const match = pattern.exec(rest);
    if (!match) return;
    apply(match[1]!);
    rest = rest.replace(match[0], '');
  };

  take(/g(\d{3}|\.{3})/, (value) => {
    weather.windGustMph = parseWeatherNumber(value);
  });
  // Temperature is a 3-character field; negatives look like `t-05`.
  take(/t(-?\d{2,3}|\.{3})/, (value) => {
    weather.temperatureF = parseWeatherNumber(value);
  });
  take(/r(\d{3}|\.{3})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.rainHourIn = n * HUNDREDTHS;
  });
  take(/p(\d{3}|\.{3})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.rain24hIn = n * HUNDREDTHS;
  });
  take(/P(\d{3}|\.{3})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.rainMidnightIn = n * HUNDREDTHS;
  });
  take(/h(\d{2}|\.{2})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n === undefined) return;
    weather.humidity = n === 0 ? 100 : n;
  });
  take(/b(\d{4,5}|\.{4,5})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.pressureMb = n / 10;
  });
  take(/s(\d{3}|\.{3})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.snow24hIn = n;
  });
  take(/L(\d{3}|\.{3})/, (value) => {
    weather.luminosity = parseWeatherNumber(value);
  });
  take(/l(\d{3}|\.{3})/, (value) => {
    const n = parseWeatherNumber(value);
    if (n !== undefined) weather.luminosity = 1000 + n;
  });
  // Raw rain counter — recorded only so the comment stays clean.
  take(/#(\d{3}|\.{3})/, () => undefined);

  // Software/unit identifiers (e.g. "dU2k", "wDvs") are not weather.
  rest = rest.replace(/^[dDwWmMxXsS][A-Za-z0-9+\-]{0,6}/, '').trim();
  // Leading separators left by field removal.
  rest = rest.replace(/^[\/\-\s]+/, '').trim();

  return { weather, comment: rest };
}

/** Wind direction/speed in the fixed `ddd/sss` slot used by weather reports. */
function parseWindSlot(text: string): {
  windDirection?: number;
  windSpeedMph?: number;
  rest: string;
} {
  const match = /^(\d{3}|\.{3})\/(\d{3}|\.{3})/.exec(text);
  if (!match) return { rest: text };

  return {
    windDirection: parseWeatherNumber(match[1]!),
    windSpeedMph: parseWeatherNumber(match[2]!),
    rest: text.slice(7),
  };
}

/**
 * Weather attached to a position whose symbol code is `_`.
 * `comment` is the free-form field after the lat/long/symbol (may start with
 * the wind slot).
 */
export function parseWeatherFromPositionComment(comment: string): WeatherReport | null {
  if (!comment) return null;

  const wind = parseWindSlot(comment);
  const { weather, comment: leftover } = parseWeatherDataFields(wind.rest);

  const hasData =
    wind.windDirection !== undefined ||
    wind.windSpeedMph !== undefined ||
    Object.values(weather).some((value) => value !== undefined);

  if (!hasData) return null;

  return {
    ...weather,
    windDirection: wind.windDirection,
    windSpeedMph: wind.windSpeedMph,
    comment: leftover,
    format: 'position',
  };
}

/**
 * Extracts a weather report from a full APRS information field.
 * Returns null when the packet carries no weather data.
 */
export function parseAprsWeather(info: string): WeatherReport | null {
  if (info.length < 2) return null;

  const dataType = info[0]!;

  // Positionless weather report.
  if (dataType === '_') {
    // Optional MDHM timestamp: `_DDHHMMz`, `_DDHHMM/`, or bare `_DDHHMM`
    // immediately followed by wind (`c…` or `ddd/sss`).
    let body = info.slice(1);
    if (/^\d{6}[z\/h]/.test(body)) body = body.slice(7);
    else if (/^\d{6}(?=c|\d{3}\/)/.test(body)) body = body.slice(6);

    // Some stations use `c000s000` instead of `000/000`.
    const verbose = /^c(\d{3}|\.{3})s(\d{3}|\.{3})/.exec(body);
    let windDirection: number | undefined;
    let windSpeedMph: number | undefined;
    let rest = body;

    if (verbose) {
      windDirection = parseWeatherNumber(verbose[1]!);
      windSpeedMph = parseWeatherNumber(verbose[2]!);
      rest = body.slice(8);
    } else {
      const wind = parseWindSlot(body);
      windDirection = wind.windDirection;
      windSpeedMph = wind.windSpeedMph;
      rest = wind.rest;
    }

    const { weather, comment } = parseWeatherDataFields(rest);
    return {
      ...weather,
      windDirection,
      windSpeedMph,
      comment,
      format: 'positionless',
    };
  }

  // Peet Bros complete weather (*…): treat the payload after the type byte
  // as a wind slot + lettered fields when it looks like one.
  if (dataType === '*') {
    const body = info.slice(1);
    const wind = parseWindSlot(body);
    const { weather, comment } = parseWeatherDataFields(wind.rest);
    if (
      wind.windDirection === undefined &&
      wind.windSpeedMph === undefined &&
      Object.values(weather).every((value) => value === undefined)
    ) {
      return null;
    }
    return {
      ...weather,
      windDirection: wind.windDirection,
      windSpeedMph: wind.windSpeedMph,
      comment,
      format: 'peet',
    };
  }

  // Complete weather: any position report whose symbol is `_`.
  // Uncompressed: …N/…W_ddd/sss…
  const uncompressed = /[NS].[0-9 .]{8}[EW]_/.exec(info);
  if (uncompressed) {
    const after = info.slice(uncompressed.index! + uncompressed[0]!.length);
    return parseWeatherFromPositionComment(after);
  }

  // Compressed weather: table + 8 base91 chars + `_` + type/cs + fields.
  // Simpler path: look for `_` followed by a wind slot somewhere after the
  // data-type byte when the packet already parsed as a weather symbol.
  const compressedWeather = /^[!/=@][^_]{0,20}_(\d{3}\/\d{3}.*)$/.exec(info);
  if (compressedWeather) {
    return parseWeatherFromPositionComment(compressedWeather[1]!);
  }

  return null;
}

/** °F → °C. */
export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

/** mph → km/h. */
export function mphToKmh(mph: number): number {
  return mph * 1.609344;
}

/** Inches → millimetres. */
export function inchesToMm(inches: number): number {
  return inches * 25.4;
}
