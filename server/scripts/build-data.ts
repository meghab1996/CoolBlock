/**
 * Downloads Paris open data and builds the three files the app serves:
 *   data/boundaries.geojson  – the 20 arrondissements
 *   data/points.json         – cooling spots (cool green spaces, cool facilities, drinking fountains)
 *   data/areas.json          – per-arrondissement metrics and the cooling access index
 *
 * Run from the project root:   npm run data
 * Force fresh downloads:        npm run data -- --refresh
 *
 * Raw downloads are cached in data/raw/ so re-running is instant.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { area as turfArea } from '@turf/area';
import { centroid } from '@turf/centroid';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { Area, AreasFile, ComponentKey, CoolingPoint, PointKind, Source } from '../src/types.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const BASE = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets';
const REFRESH = process.argv.includes('--refresh');

type Props = Record<string, unknown>;
type AnyFeature = Feature<Geometry | null, Props>;

const DATASETS = {
  boundaries: { id: 'arrondissements', title: 'Arrondissements' },
  green: { id: 'ilots-de-fraicheur-espaces-verts-frais', title: 'Îlots de fraîcheur: espaces verts frais' },
  facility: { id: 'ilots-de-fraicheur-equipements-activites', title: 'Îlots de fraîcheur: équipements et activités' },
  fountain: { id: 'fontaines-a-boire', title: 'Fontaines à boire' },
  trees: { id: 'les-arbres', title: 'Les arbres (count per arrondissement)' },
} as const;

// ---------- download helpers ----------

async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.warn(`  retry ${i}/${attempts - 1} for ${url}`);
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }
  throw new Error(`Could not download ${url}: ${String(lastErr)}`);
}

async function cached<T>(name: string, url: string): Promise<T> {
  const file = path.join(RAW_DIR, `${name}.json`);
  if (!REFRESH && existsSync(file)) {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  }
  console.log(`  downloading ${name} …`);
  const data = await fetchJson<T>(url);
  await writeFile(file, JSON.stringify(data));
  return data;
}

function geojsonExport(id: string) {
  return cached<FeatureCollection<Geometry | null, Props>>(id, `${BASE}/${id}/exports/geojson?lang=fr`);
}

// ---------- small utilities ----------

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

function firstString(p: Props, keys: string[]): string {
  for (const k of keys) {
    const v = str(p[k]);
    if (v) return v;
  }
  return '';
}

/** True if any field whose name mentions night/24h/heat-plan opening says "Oui". */
function isNightOpen(p: Props): boolean | undefined {
  const keys = Object.keys(p).filter((k) => /24h|nocturne|nuit|canicule/i.test(k));
  if (keys.length === 0) return undefined;
  return keys.some((k) => /^oui$/i.test(str(p[k])));
}

function ordinalName(n: number) {
  return n === 1 ? '1er' : `${n}e`;
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- main ----------

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  console.log('Building CoolBlock data from opendata.paris.fr');

  // 1. Arrondissement boundaries
  const boundariesRaw = await geojsonExport(DATASETS.boundaries.id);
  const polygons = boundariesRaw.features
    .filter((f): f is Feature<Polygon | MultiPolygon, Props> => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
    .map((f) => {
      const p = f.properties ?? {};
      const code =
        Number(p.c_ar) ||
        (Number(p.c_arinsee) ? Number(p.c_arinsee) - 75100 : 0) ||
        Number.parseInt(firstString(p, ['l_ar']), 10);
      if (!code || code < 1 || code > 20) throw new Error(`Could not read arrondissement number from ${JSON.stringify(p)}`);
      return {
        code,
        label: firstString(p, ['l_aroff']) || `Paris ${ordinalName(code)}`,
        areaKm2: turfArea(f) / 1e6,
        feature: f,
      };
    })
    .sort((a, b) => a.code - b.code);

  if (polygons.length !== 20) console.warn(`  ⚠ expected 20 arrondissements, got ${polygons.length}`);

  const findCode = (lng: number, lat: number): number | null => {
    for (const poly of polygons) {
      if (booleanPointInPolygon([lng, lat], poly.feature)) return poly.code;
    }
    return null;
  };

  // 2. Cooling spots
  const points: CoolingPoint[] = [];
  const greenHaByCode = new Map<number, number>();
  const sources: Source[] = [];

  const layers: { kind: PointKind; id: string; title: string }[] = [
    { kind: 'green', ...DATASETS.green },
    { kind: 'facility', ...DATASETS.facility },
    { kind: 'fountain', ...DATASETS.fountain },
  ];

  for (const layer of layers) {
    const fc = await geojsonExport(layer.id);
    let kept = 0;
    let skipped = 0;
    fc.features.forEach((f: AnyFeature, i) => {
      const p = f.properties ?? {};
      if (!f.geometry) return void skipped++;

      // Fountains marked as unavailable are left out.
      if (layer.kind === 'fountain' && /^non$/i.test(str(p.dispo))) return void skipped++;

      const c = f.geometry.type === 'Point' ? f.geometry.coordinates : centroid(f as Feature<Geometry, Props>).geometry.coordinates;
      const [lng, lat] = c;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return void skipped++;
      const code = findCode(lng, lat);

      let name = firstString(p, ['nom', 'name', 'libelle']);
      if (layer.kind === 'fountain' && !name) {
        const street = firstString(p, ['voie', 'adresse']);
        name = street ? `Fountain, ${street}` : 'Drinking fountain';
      }

      const point: CoolingPoint = {
        id: `${layer.kind}-${firstString(p, ['identifiant', 'gid', 'id']) || i}`,
        kind: layer.kind,
        name: name || layer.title,
        type: firstString(p, ['type', 'type_objet', 'modele']) || layer.title,
        lat: round(lat, 6),
        lng: round(lng, 6),
        code,
      };
      if (layer.kind === 'green') {
        const night = isNightOpen(p);
        if (night !== undefined) point.nightOpen = night;
        if (code && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) {
          greenHaByCode.set(code, (greenHaByCode.get(code) ?? 0) + turfArea(f as Feature<Polygon | MultiPolygon>) / 1e4);
        }
      }
      points.push(point);
      kept++;
    });
    console.log(`  ${layer.title}: ${kept} kept, ${skipped} skipped`);
    sources.push({ id: layer.id, title: layer.title, url: `https://opendata.paris.fr/explore/dataset/${layer.id}/`, records: kept });
  }

  // 3. Trees: one aggregate query instead of downloading ~200k points
  const treesByCode = new Map<number, number>();
  try {
    const qs = new URLSearchParams({ select: 'arrondissement, count(*) as n', group_by: 'arrondissement', limit: '100' });
    const agg = await cached<{ results: { arrondissement: string; n: number }[] }>('trees-by-arrondissement', `${BASE}/${DATASETS.trees.id}/records?${qs}`);
    for (const row of agg.results) {
      const m = /PARIS\s*(\d{1,2})/i.exec(str(row.arrondissement));
      if (m) treesByCode.set(Number(m[1]), (treesByCode.get(Number(m[1])) ?? 0) + Number(row.n));
    }
    if (treesByCode.size === 0) throw new Error('no rows matched "PARIS <n>"');
    sources.push({
      id: DATASETS.trees.id,
      title: DATASETS.trees.title,
      url: `https://opendata.paris.fr/explore/dataset/${DATASETS.trees.id}/`,
      records: [...treesByCode.values()].reduce((a, b) => a + b, 0),
      note: 'Trees in the Bois de Boulogne and Bois de Vincennes are listed separately and not counted.',
    });
    console.log(`  Trees: matched ${treesByCode.size} arrondissements`);
  } catch (err) {
    console.warn(`  ⚠ Tree counts skipped (${String(err)}). The index will use the other indicators.`);
  }

  sources.unshift({
    id: DATASETS.boundaries.id,
    title: DATASETS.boundaries.title,
    url: `https://opendata.paris.fr/explore/dataset/${DATASETS.boundaries.id}/`,
    records: polygons.length,
  });

  // 4. Metrics per arrondissement
  const count = (code: number, kind: PointKind) => points.filter((p) => p.code === code && p.kind === kind).length;
  const hasNightData = points.some((p) => p.kind === 'green' && p.nightOpen !== undefined);

  const base = polygons.map((poly) => {
    const greenSpaces = count(poly.code, 'green');
    const facilities = count(poly.code, 'facility');
    const fountains = count(poly.code, 'fountain');
    const trees = treesByCode.size ? (treesByCode.get(poly.code) ?? 0) : null;
    const coolGreenHa = greenHaByCode.size ? (greenHaByCode.get(poly.code) ?? 0) : null;
    return {
      code: poly.code,
      name: ordinalName(poly.code),
      label: poly.label,
      areaKm2: round(poly.areaKm2, 2),
      greenSpaces,
      nightOpenGreenSpaces: hasNightData ? points.filter((p) => p.code === poly.code && p.kind === 'green' && p.nightOpen).length : null,
      facilities,
      fountains,
      trees,
      coolGreenHa: coolGreenHa === null ? null : round(coolGreenHa, 1),
      coolGreenSharePct: coolGreenHa === null ? null : round((coolGreenHa / 100 / poly.areaKm2) * 100, 1),
      perKm2: {
        coolingSpots: round((greenSpaces + facilities) / poly.areaKm2, 1),
        fountains: round(fountains / poly.areaKm2, 1),
        trees: trees === null ? null : round(trees / poly.areaKm2, 0),
      },
    };
  });

  // 5. Cooling access index: mean of percentile ranks (0–100), so one extreme
  //    arrondissement can't squash everyone else's score.
  const raw: Record<ComponentKey, (a: (typeof base)[number]) => number | null> = {
    coolingDensity: (a) => a.perKm2.coolingSpots,
    fountainDensity: (a) => a.perKm2.fountains,
    greenShare: (a) => a.coolGreenSharePct,
    treeDensity: (a) => a.perKm2.trees,
  };
  const normalised = new Map<number, Record<ComponentKey, number | null>>();
  base.forEach((a) => normalised.set(a.code, { coolingDensity: null, fountainDensity: null, greenShare: null, treeDensity: null }));
  for (const key of Object.keys(raw) as ComponentKey[]) {
    const vals = base.map((a) => raw[key](a));
    if (vals.some((v) => v === null)) continue;
    const nums = vals as number[];
    const n = nums.length;
    base.forEach((a, i) => {
      const below = nums.filter((v) => v < nums[i]).length;
      const equal = nums.filter((v) => v === nums[i]).length - 1;
      normalised.get(a.code)![key] = n > 1 ? round(((below + equal / 2) / (n - 1)) * 100, 0) : 50;
    });
  }

  const areas: Area[] = base.map((a) => {
    const components = normalised.get(a.code)!;
    const used = Object.values(components).filter((v): v is number => v !== null);
    const score = used.length ? round(used.reduce((s, v) => s + v, 0) / used.length, 0) : 0;
    return { ...a, index: { score, gapRank: 0, components } };
  });
  [...areas].sort((a, b) => a.index.score - b.index.score).forEach((a, i) => (a.index.gapRank = i + 1));

  const out: AreasFile = {
    generatedAt: new Date().toISOString(),
    method:
      'Cooling access score (0–100): average of four indicators, each converted to a percentile rank among the 20 arrondissements (0 = lowest in Paris, 100 = highest): ' +
      'cool spots per km² (cool green spaces + cool facilities), drinking fountains per km², share of land that is a listed cool green space, and city-managed trees per km². ' +
      'Higher means better cooling access relative to other arrondissements. Gap rank 1 = weakest.',
    caveats: [
      'The index is relative: a low score means weaker than other arrondissements, not necessarily inadequate.',
      'Only cooling spots listed in the City of Paris datasets are counted (no private air-conditioned spaces, shaded streets or courtyards).',
      'The 12e and 16e include the Bois de Vincennes and Bois de Boulogne, which inflates their area and green space; trees in the woods are not counted.',
      'No surface temperature, population density or vulnerability data is included yet.',
    ],
    sources,
    areas,
  };

  const boundaries: FeatureCollection = {
    type: 'FeatureCollection',
    features: polygons.map((p) => ({
      type: 'Feature',
      properties: { code: p.code },
      geometry: p.feature.geometry,
    })),
  };

  await writeFile(path.join(DATA_DIR, 'areas.json'), JSON.stringify(out, null, 2));
  await writeFile(path.join(DATA_DIR, 'boundaries.geojson'), JSON.stringify(boundaries));
  await writeFile(path.join(DATA_DIR, 'points.json'), JSON.stringify(points));

  console.log('\nArrondissement  score  gap rank  cool spots/km²  fountains/km²  green %  trees/km²');
  for (const a of [...areas].sort((x, y) => x.code - y.code)) {
    console.log(
      `${a.name.padEnd(15)} ${String(a.index.score).padStart(5)}  ${String(a.index.gapRank).padStart(8)}  ${String(a.perKm2.coolingSpots).padStart(14)}  ${String(a.perKm2.fountains).padStart(13)}  ${String(a.coolGreenSharePct).padStart(7)}  ${String(a.perKm2.trees ?? '–').padStart(9)}`,
    );
  }
  if (greenHaByCode.size === 0) console.warn('  ⚠ Green spaces had no shapes, so the green-share indicator was left out.');
  console.log(`\nMedian score ${median(areas.map((a) => a.index.score))}. Wrote ${points.length} points to server/data/.`);
}

main().catch((err) => {
  console.error('\n✖ Data build failed:', err instanceof Error ? err.message : err);
  console.error('Check your internet connection, then run `npm run data -- --refresh`.');
  process.exit(1);
});