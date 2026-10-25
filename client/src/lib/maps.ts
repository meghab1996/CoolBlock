import type { CoolingPoint } from '../types';

/**
 * Google Maps directions to a point, starting from wherever the user is.
 * Uses Google's public Maps URLs (no API key). On a phone with the Google Maps
 * app, the link opens the app and starts navigation; otherwise Google Maps opens
 * in the browser.
 */
export function directionsUrl(lat: number, lng: number, mode: 'walking' | 'transit' | 'bicycling' | 'driving' = 'walking') {
  const qs = new URLSearchParams({
    api: '1',
    destination: `${lat},${lng}`,
    travelmode: mode,
    dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${qs}`;
}

/** Straight-line distance in metres between two points (haversine formula). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** The closest point to a location, with its distance in metres. */
export function nearestPoint(points: CoolingPoint[], lat: number, lng: number) {
  let best: { point: CoolingPoint; distance: number } | null = null;
  for (const point of points) {
    const distance = distanceM(lat, lng, point.lat, point.lng);
    if (!best || distance < best.distance) best = { point, distance };
  }
  return best;
}

/** Asks the browser for the user's position. Needs https (or localhost). */
export function locate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new Error('Finding your location needs a secure https:// address. On a phone, start the app with npm run dev:phone.'));
      return;
    }
    if (!('geolocation' in navigator)) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location access is blocked. Allow it for this site in your browser settings, then try again.',
          2: "Your location isn't available right now. Try again in a moment.",
          3: 'Finding your location took too long. Try again.',
        };
        reject(new Error(messages[err.code] ?? 'Could not find your location.'));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}