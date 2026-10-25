/**
 * Food places near a point, from OpenStreetMap's Overpass API (free, no key).
 *
 * Uber Eats and Deliveroo don't let other websites list their restaurants,
 * so CoolBlock shows real places from OpenStreetMap and links out to the
 * delivery apps for ordering.
 */
import type { FoodPlace } from './types.js';

const OVERPASS_URL = process.env.OVERPASS_URL?.trim() || 'https://overpass-api.de/api/interpreter';
const RADIUS_M = 500;
const MAX_PLACES = 8;
const THIRTY_MINUTES = 30 * 60 * 1000;
const cache = new Map<string, { at: number; places: FoodPlace[] }>();

const KINDS: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  fast_food: 'Fast food',
  ice_cream: 'Ice cream',
  bakery: 'Bakery',
  pastry: 'Pastry shop',
};

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export async function foodNear(lat: number, lng: number): Promise<FoodPlace[]> {
  // Round to about 100 m so people at the same spot share one lookup.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < THIRTY_MINUTES) return hit.places;

  const around = `(around:${RADIUS_M},${lat},${lng})`;
  const query =
    '[out:json][timeout:20];(' +
    `nwr["amenity"~"^(restaurant|cafe|fast_food|ice_cream)$"]["name"]${around};` +
    `nwr["shop"~"^(bakery|pastry)$"]["name"]${around};` +
    ');out center 300;';

  let res: globalThis.Response;
  try {
    res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CoolBlock/1.0 (hackathon prototype)' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error("couldn't reach OpenStreetMap. Check your internet connection.");
  }
  if (res.status === 429 || res.status === 504) throw new Error('OpenStreetMap is busy right now. Try again in a minute.');
  if (!res.ok) throw new Error(`OpenStreetMap returned HTTP ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };

  const places = (json.elements ?? [])
    .map((e): FoodPlace | null => {
      const plat = e.lat ?? e.center?.lat;
      const plng = e.lon ?? e.center?.lon;
      const tags = e.tags ?? {};
      if (plat === undefined || plng === undefined || !tags.name) return null;
      const cuisine = tags.cuisine
        ? tags.cuisine
            .split(';')
            .map((c) => c.trim().replace(/_/g, ' '))
            .filter(Boolean)
            .slice(0, 2)
            .join(', ')
        : null;
      return {
        id: `${e.type}/${e.id}`,
        name: tags.name,
        kind: KINDS[tags.amenity ?? ''] ?? KINDS[tags.shop ?? ''] ?? 'Food',
        cuisine,
        lat: plat,
        lng: plng,
        distance: Math.round(distanceM(lat, lng, plat, plng)),
      };
    })
    .filter((p): p is FoodPlace => p !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_PLACES);

  cache.set(key, { at: Date.now(), places });
  return places;
}