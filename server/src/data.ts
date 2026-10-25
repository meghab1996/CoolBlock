import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FeatureCollection } from 'geojson';
import type { AreasFile, CoolingPoint } from './types.js';

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

const files = {
  areas: path.join(DATA_DIR, 'areas.json'),
  boundaries: path.join(DATA_DIR, 'boundaries.geojson'),
  points: path.join(DATA_DIR, 'points.json'),
};

export interface Dataset {
  areas: AreasFile;
  boundaries: FeatureCollection;
  points: CoolingPoint[];
}

let cache: { mtime: number; data: Dataset } | null = null;

export class MissingDataError extends Error {
  constructor() {
    super('No data yet. Run `npm run data` in the project folder, then refresh the page.');
  }
}

/** Loads the generated files, reloading automatically after `npm run data`. */
export function getDataset(): Dataset {
  if (!Object.values(files).every((f) => existsSync(f))) throw new MissingDataError();
  const mtime = statSync(files.areas).mtimeMs;
  if (cache && cache.mtime === mtime) return cache.data;
  const data: Dataset = {
    areas: JSON.parse(readFileSync(files.areas, 'utf8')),
    boundaries: JSON.parse(readFileSync(files.boundaries, 'utf8')),
    points: JSON.parse(readFileSync(files.points, 'utf8')),
  };
  cache = { mtime, data };
  return data;
}

export function hasData() {
  return Object.values(files).every((f) => existsSync(f));
}