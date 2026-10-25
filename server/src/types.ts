// Shared shapes for the data files written by scripts/build-data.ts
// and served by the API. client/src/types.ts mirrors these.

export type PointKind = 'green' | 'facility' | 'fountain';

export interface CoolingPoint {
  id: string;
  kind: PointKind;
  name: string;
  type: string;
  lat: number;
  lng: number;
  /** Arrondissement number 1–20, or null if the point falls outside Paris. */
  code: number | null;
  /** Green spaces only: open at night (all year, summer, or during heat alerts). */
  nightOpen?: boolean;
}

export type ComponentKey = 'coolingDensity' | 'fountainDensity' | 'greenShare' | 'treeDensity';

export interface Area {
  code: number;
  /** "1er", "2e", … "20e" */
  name: string;
  /** Official name, e.g. "Popincourt" */
  label: string;
  areaKm2: number;
  greenSpaces: number;
  nightOpenGreenSpaces: number | null;
  facilities: number;
  fountains: number;
  trees: number | null;
  /** Hectares of listed cool green space (null if the dataset had no shapes). */
  coolGreenHa: number | null;
  coolGreenSharePct: number | null;
  perKm2: {
    coolingSpots: number;
    fountains: number;
    trees: number | null;
  };
  index: {
    /** 0–100, relative to the other arrondissements. Higher = better cooling access. */
    score: number;
    /** 1 = weakest cooling access of the 20. */
    gapRank: number;
    /** Each component as a percentile rank 0–100 across arrondissements (null if data missing). */
    components: Record<ComponentKey, number | null>;
  };
}

export interface Source {
  id: string;
  title: string;
  url: string;
  records: number | null;
  note?: string;
}

export interface AreasFile {
  generatedAt: string;
  method: string;
  caveats: string[];
  sources: Source[];
  areas: Area[];
}

export interface DailyWeather {
  date: string;
  max: number;
  min: number;
  feelsMax: number | null;
}

export type HeatLevel = 'normal' | 'hot' | 'heatwave';

export type WeatherMode = 'live' | 'history';

export interface HeatEpisode {
  start: string;
  end: string;
  days: number;
  peak: number;
}

export interface Weather {
  mode: WeatherMode;
  /** "Next 7 days" or "May–June 2026" */
  periodLabel: string;
  source: string;
  /** Only in live mode. */
  current: {
    time: string;
    temp: number;
    feelsLike: number;
    humidity: number;
    windKmh: number;
  } | null;
  daily: DailyWeather[];
  stats: {
    /** Days with a max of 30 °C or more. */
    hotDays: number;
    /** Nights that stayed at 20 °C or above ("nuits tropicales"). */
    tropicalNights: number;
    hottestDay: { date: string; max: number };
    warmestNight: { date: string; min: number };
    /** Runs of 3+ days at or above the Paris heatwave thresholds. */
    episodes: HeatEpisode[];
  };
  heat: {
    level: HeatLevel;
    label: string;
    detail: string;
  };
}