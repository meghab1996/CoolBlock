import type { FeatureCollection } from 'geojson';
import type { AreasFile } from '../../server/src/types';

// One source of truth: the server's types.
export type * from '../../server/src/types';

export type AreasResponse = AreasFile & { boundaries: FeatureCollection };

export interface Health {
  ok: boolean;
  hasData: boolean;
  ai: { configured: boolean; model: string };
  weatherYears: number[];
}

export interface WeatherSelection {
  mode: 'live' | 'history';
  year: number;
}

export interface Recommendation {
  headline: string;
  summary: string;
  findings: { finding: string; evidence: string }[];
  interventions: {
    title: string;
    description: string;
    rationale: string;
    timeframe: string;
    cost: 'Low' | 'Medium' | 'High';
  }[];
  dataGaps: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}