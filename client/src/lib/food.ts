import type { FoodPlace } from '../types';

/** On a phone these open the Uber Eats / Deliveroo app if it's installed, otherwise their website. */
export const UBER_EATS_URL = 'https://www.ubereats.com/fr';
export const DELIVEROO_URL = 'https://deliveroo.fr/fr/';

/** Cafés, bakeries, ice-cream shops and restaurants within 500 m, nearest first. */
export async function fetchFood(lat: number, lng: number): Promise<FoodPlace[]> {
  let res: Response;
  try {
    res = await fetch(`/api/food?lat=${lat}&lng=${lng}`);
  } catch {
    throw new Error("Can't reach the CoolBlock server. Is it still running?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
  return body.places as FoodPlace[];
}