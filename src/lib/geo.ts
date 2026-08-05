export interface Place {
  address: string;
  lat: number;
  lng: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance in kilometres (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Transparent fare: ₹30 base + ₹14/km, minimum ₹35, rounded to ₹5. */
export function estimateFare(distanceKm: number): number {
  return Math.max(35, Math.round((30 + 14 * distanceKm) / 5) * 5);
}

export function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Rough ETA assuming ~18 km/h city EV traffic. */
export function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 18) * 60));
}

/**
 * A slightly curved path between two points so the route on the map reads
 * like a real street route instead of a ruler line.
 */
export function buildRoutePath(a: LatLng, b: LatLng): [number, number][] {
  const steps = 7;
  const dist = haversineKm(a, b);
  const bow = Math.min(0.004, Math.max(0.0006, dist * 0.06));
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const len = Math.hypot(dLat, dLng) || 1;
  // perpendicular unit vector
  const px = -dLng / len;
  const py = dLat / len;

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = a.lat + dLat * t;
    const lng = a.lng + dLng * t;
    const amp = Math.sin(Math.PI * t) * bow;
    points.push([lat + py * amp, lng + px * amp]);
  }
  return points;
}

export const BENGALURU: LatLng = { lat: 12.9716, lng: 77.5946 };
