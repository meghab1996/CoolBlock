import type { Area, PointKind } from '../types';

/** Cooling access score bins, weakest (dark orange) to strongest (pale). One hue, light→dark. */
export const SCORE_RAMP = ['#a8431a', '#d65a2a', '#ee8c5f', '#f6b998', '#fbe1d2'] as const;
export const SCORE_BINS = ['0–19', '20–39', '40–59', '60–79', '80–100'] as const;

export function scoreColor(score: number) {
  return SCORE_RAMP[Math.min(4, Math.floor(score / 20))];
}

export const POINT_STYLE: Record<PointKind, { color: string; label: string; radius: number }> = {
  green: { color: '#1baf7a', label: 'Cool green spaces', radius: 6 },
  facility: { color: '#eda100', label: 'Cool facilities', radius: 6 },
  fountain: { color: '#2a78d6', label: 'Drinking fountains', radius: 4 },
};

/** Two-series compare chart: categorical slots 1 and 2. */
export const SERIES = ['#2a78d6', '#eb6834'] as const;

const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
export const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v);

export function median(values: (number | null)[]): number | null {
  const s = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export interface Indicator {
  key: string;
  label: string;
  unit: string;
  value: (a: Area) => number | null;
}

/** The four indicators behind the cooling access score, in display order. */
export const INDICATORS: Indicator[] = [
  { key: 'coolingDensity', label: 'Cool spots', unit: 'per km²', value: (a) => a.perKm2.coolingSpots },
  { key: 'fountainDensity', label: 'Drinking fountains', unit: 'per km²', value: (a) => a.perKm2.fountains },
  { key: 'greenShare', label: 'Cool green space', unit: '% of land', value: (a) => a.coolGreenSharePct },
  { key: 'treeDensity', label: 'City trees', unit: 'per km²', value: (a) => a.perKm2.trees },
];

export const areaTitle = (a: Area) => `${a.name} arrondissement`;