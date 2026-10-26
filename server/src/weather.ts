/**
 * Weather from Open-Meteo (free, no API key):
 *   live    → forecast for the next 7 days
 *   history → observed daily weather for 1 May – 30 June of a given year
 *
 * History results are saved to data/weather/ so they load instantly
 * (and offline) after the first request.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './data.js';
import type { DailyWeather, HeatEpisode, HeatLevel, Weather } from './types.js';

// Central Paris (Hôtel de Ville)
const LAT = 48.8566;
const LNG = 2.3522;

// Simplified version of Météo-France's heatwave criteria for Paris:
// 3 consecutive days with a max ≥ 31 °C and a min ≥ 21 °C.
const HEATWAVE_MAX = 31;
const HEATWAVE_MIN = 21;
const HOT_DAY = 30;
const TROPICAL_NIGHT = 20;

const WEATHER_DIR = path.join(DATA_DIR, 'weather');
const TEN_MINUTES = 10 * 60 * 1000;
let liveCache: { at: number; data: Weather } | null = null;
const historyCache = new Map<number, Weather>();

// ---------- analysis ----------

const round1 = (v: number) => Math.round(v * 10) / 10;

function findEpisodes(daily: DailyWeather[]): HeatEpisode[] {
  const episodes: HeatEpisode[] = [];
  let run: DailyWeather[] = [];
  const close = () => {
    if (run.length >= 3) {
      episodes.push({ start: run[0].date, end: run.at(-1)!.date, days: run.length, peak: Math.max(...run.map((d) => d.max)) });
    }
    run = [];
  };
  for (const d of daily) {
    if (d.max >= HEATWAVE_MAX && d.min >= HEATWAVE_MIN) run.push(d);
    else close();
  }
  close();
  return episodes;
}

function analyse(daily: DailyWeather[], mode: Weather['mode']): Pick<Weather, 'stats' | 'heat'> {
  const hottest = daily.reduce((a, b) => (b.max > a.max ? b : a));
  const warmest = daily.reduce((a, b) => (b.min > a.min ? b : a));
  const episodes = findEpisodes(daily);
  const hotDays = daily.filter((d) => d.max >= HOT_DAY).length;
  const tropicalNights = daily.filter((d) => d.min >= TROPICAL_NIGHT).length;

  let level: HeatLevel = 'normal';
  if (episodes.length) level = 'heatwave';
  else if (hotDays > 0) level = 'hot';

  const past = mode === 'history';
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const labels: Record<HeatLevel, string> = past
    ? { heatwave: 'Heatwave recorded', hot: 'Hot days, no heatwave', normal: 'No heat days' }
    : { heatwave: 'Heatwave conditions', hot: 'Hot days ahead', normal: 'No heat risk' };

  let detail: string;
  if (episodes.length) {
    detail =
      episodes.map((e) => `${fmt(e.start)}–${fmt(e.end)} (${e.days} days, peak ${Math.round(e.peak)} °C)`).join('; ') +
      ` met the Paris heatwave thresholds (≥ ${HEATWAVE_MAX} °C by day, ≥ ${HEATWAVE_MIN} °C at night).`;
  } else {
    detail = `Hottest day ${fmt(hottest.date)} at ${Math.round(hottest.max)} °C; heatwave thresholds were ${past ? 'never' : 'not'} met.`;
  }

  return {
    stats: {
      hotDays,
      tropicalNights,
      hottestDay: { date: hottest.date, max: hottest.max },
      warmestNight: { date: warmest.date, min: warmest.min },
      episodes,
    },
    heat: { level, label: labels[level], detail },
  };
}

// ---------- live forecast ----------

export async function getLiveWeather(): Promise<Weather> {
  if (liveCache && Date.now() - liveCache.at < TEN_MINUTES) return liveCache.data;

  const qs = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LNG),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max',
    timezone: 'Europe/Paris',
    forecast_days: '7',
  });
  const j = (await fetchOpenMeteo(`https://api.open-meteo.com/v1/forecast?${qs}`, 15_000)) as {
    current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number };
    daily: DailyResponse;
  };

  const daily = toDaily(j.daily);
  const data: Weather = {
    mode: 'live',
    periodLabel: 'Next 7 days',
    source: 'Open-Meteo forecast for central Paris',
    current: {
      time: j.current.time,
      temp: j.current.temperature_2m,
      feelsLike: j.current.apparent_temperature,
      humidity: j.current.relative_humidity_2m,
      windKmh: j.current.wind_speed_10m,
    },
    daily,
    ...analyse(daily, 'live'),
  };
  liveCache = { at: Date.now(), data };
  return data;
}

// ---------- May–June history ----------

interface DailyResponse {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  apparent_temperature_max?: (number | null)[];
}

function toDaily(d: DailyResponse): DailyWeather[] {
  return d.time
    .map((date, i) => ({
      date,
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      feelsMax: d.apparent_temperature_max?.[i] ?? null,
    }))
    .filter((x): x is DailyWeather => typeof x.max === 'number' && typeof x.min === 'number')
    .map((x) => ({ ...x, max: round1(x.max), min: round1(x.min), feelsMax: x.feelsMax === null ? null : round1(x.feelsMax) }));
}

export class WeatherRangeError extends Error {}

async function fetchOpenMeteo(url: string, timeoutMs: number) {
  let res: globalThis.Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error("couldn't reach Open-Meteo. Check your internet connection.");
  }
  if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
  return res.json();
}

export function historyYears(): number[] {
  // The archive lags a few days behind, so this year's May–June is
  // available from early July.
  const now = new Date();
  const latest = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 6 }, (_, i) => latest - i);
}

export async function getMayJuneWeather(year: number): Promise<Weather> {
  const latest = historyYears()[0];
  if (!Number.isInteger(year) || year < 1990 || year > latest) {
    throw new WeatherRangeError(`May–June ${year} isn't available. Pick a year between 1990 and ${latest}.`);
  }
  const memo = historyCache.get(year);
  if (memo) return memo;

  const file = path.join(WEATHER_DIR, `may-june-${year}.json`);
  let daily: DailyWeather[];
  if (existsSync(file)) {
    daily = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const qs = new URLSearchParams({
      latitude: String(LAT),
      longitude: String(LNG),
      start_date: `${year}-05-01`,
      end_date: `${year}-06-30`,
      daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max',
      timezone: 'Europe/Paris',
    });
    const j = (await fetchOpenMeteo(`https://archive-api.open-meteo.com/v1/archive?${qs}`, 20_000)) as { daily: DailyResponse };
    daily = toDaily(j.daily);
    if (daily.length < 50) throw new Error(`Open-Meteo returned only ${daily.length} days for May–June ${year}.`);
    try {
      mkdirSync(WEATHER_DIR, { recursive: true });
      await writeFile(file, JSON.stringify(daily));
    } catch {
      // Read-only file system (e.g. on Vercel): carry on without saving a copy.
    }
  }

  const data: Weather = {
    mode: 'history',
    periodLabel: `May–June ${year}`,
    source: `Open-Meteo historical weather (observed), central Paris, 1 May – 30 June ${year}`,
    current: null,
    daily,
    ...analyse(daily, 'history'),
  };
  historyCache.set(year, data);
  return data;
}

export interface WeatherRequest {
  mode: Weather['mode'];
  year: number;
}

export function parseWeatherRequest(input: { mode?: unknown; year?: unknown } | undefined): WeatherRequest {
  const mode = input?.mode === 'live' ? 'live' : 'history';
  const year = Number(input?.year) || historyYears()[0];
  return { mode, year };
}

export async function getWeather(req: WeatherRequest): Promise<Weather> {
  return req.mode === 'live' ? getLiveWeather() : getMayJuneWeather(req.year);
}