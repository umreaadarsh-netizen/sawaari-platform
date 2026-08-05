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

export interface FareRates {
  baseFare: number;
  perKm: number;
  minFare: number;
}

/** Transparent fare from a fleet card: base + per-km, minimum, rounded to ₹5. */
export function estimateFare(distanceKm: number, rates: FareRates): number {
  const raw = rates.baseFare + rates.perKm * distanceKm;
  return Math.max(rates.minFare, Math.round(Math.max(raw, rates.minFare) / 5) * 5);
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

/**
 * Sawaari's home turf — Gotegaon, Narsinghpur district, Madhya Pradesh.
 * Used as the default map center and as the fallback pickup when GPS is
 * blocked or returns a placeholder outside India.
 */
export const GOTEGAON: LatLng = { lat: 22.92, lng: 79.18 };
export const GOTEGAON_ADDRESS = "Gotegaon, Madhya Pradesh, India";

// ---- OSRM road routing (keyless public API) -------------------------------

const osrmCache = new Map<string, [number, number][]>();

/**
 * Fetch a real road route between two points from the public OSRM demo
 * server (CORS-enabled, no key). Falls back to the curved `buildRoutePath`
 * estimate if the network/routing is unavailable, and caches by coordinates.
 */
export async function fetchOsrmRoute(a: LatLng, b: LatLng): Promise<[number, number][]> {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}->${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  const cached = osrmCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
    );
    if (!res.ok) throw new Error("OSRM request failed");
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (data.code !== "Ok" || !coords || coords.length < 2) {
      throw new Error("No route returned");
    }
    // OSRM returns [lng, lat]; Leaflet wants [lat, lng].
    const path = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    osrmCache.set(key, path);
    return path;
  } catch {
    const fallback = buildRoutePath(a, b);
    osrmCache.set(key, fallback);
    return fallback;
  }
}

/** Rough bounding box covering India (lat/lng). */
export const INDIA_BOUNDS = {
  south: 6.5,
  north: 37.1,
  west: 68.0,
  east: 97.4,
};

/** True when a coordinate pair falls within India's bounding box. */
export function isInIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.south &&
    lat <= INDIA_BOUNDS.north &&
    lng >= INDIA_BOUNDS.west &&
    lng <= INDIA_BOUNDS.east
  );
}
