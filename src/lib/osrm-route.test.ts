import { afterEach, describe, expect, it, vi } from "vitest";
import { BENGALURU, GOTEGAON, buildRoutePath, fetchOsrmRoute } from "./geo";
import type { LatLng } from "./geo";

/**
 * Tests for the OSRM route fallback: `buildRoutePath` bends the straight line
 * between two points into a short street-like curve, and `fetchOsrmRoute`
 * lands there whenever the network route can't be fetched. The route cache is
 * module-level, so every test uses a distinct pair of coordinates to keep the
 * cache from leaking between tests.
 */

const MUMBAI: LatLng = { lat: 19.076, lng: 72.8777 };
const PUNE: LatLng = { lat: 18.5204, lng: 73.8567 };
const CHENNAI: LatLng = { lat: 13.0827, lng: 80.2707 };
const DELHI: LatLng = { lat: 28.6139, lng: 77.209 };
const JAIPUR: LatLng = { lat: 26.9124, lng: 75.7873 };
const AHMEDABAD: LatLng = { lat: 23.0225, lng: 72.5714 };
const SURAT: LatLng = { lat: 21.1702, lng: 72.8311 };

/** Euclidean distance (in lat/lng units) from a point to the a→b segment. */
function distToSegment(p: [number, number], a: LatLng, b: LatLng): number {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const len2 = dLat * dLat + dLng * dLng;
  let t =
    len2 === 0 ? 0 : ((p[0] - a.lat) * dLat + (p[1] - a.lng) * dLng) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a.lat + dLat * t), p[1] - (a.lng + dLng * t));
}

/** buildRoutePath's maximum bow, in degrees (see src/lib/geo.ts). */
const BOW_CAP = 0.004;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildRoutePath", () => {
  it("returns 8 valid [lat, lng] pairs", () => {
    const path = buildRoutePath(GOTEGAON, BENGALURU);
    expect(path).toHaveLength(8); // 7 steps + the two endpoints
    for (const [lat, lng] of path) {
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
    }
  });

  it("starts at the pickup and ends at the dropoff", () => {
    const path = buildRoutePath(GOTEGAON, BENGALURU);
    expect(path[0]).toEqual([GOTEGAON.lat, GOTEGAON.lng]);
    expect(path[path.length - 1]).toEqual([BENGALURU.lat, BENGALURU.lng]);
  });

  it("stays within the 0.004° bow cap of the straight segment", () => {
    const path = buildRoutePath(GOTEGAON, BENGALURU);
    const max = Math.max(
      ...path.map((p) => distToSegment(p, GOTEGAON, BENGALURU)),
    );
    expect(max).toBeLessThanOrEqual(BOW_CAP + 1e-9);
    expect(max).toBeGreaterThan(0.0005); // a real curve, not a collapsed line
  });

  it("bows less than the cap for short city trips", () => {
    // ~30 m apart: bow = max(0.0006, min(0.004, dist×0.06)) ≈ 0.0018
    const a: LatLng = { lat: 22.92, lng: 79.18 };
    const b: LatLng = { lat: 22.9202, lng: 79.1802 };
    const path = buildRoutePath(a, b);
    const max = Math.max(...path.map((p) => distToSegment(p, a, b)));
    expect(max).toBeLessThan(BOW_CAP);
  });

  it("keeps intermediate points between the endpoints", () => {
    const path = buildRoutePath(GOTEGAON, BENGALURU);
    const p = path[4];
    expect(p[0]).toBeGreaterThan(Math.min(GOTEGAON.lat, BENGALURU.lat));
    expect(p[0]).toBeLessThan(Math.max(GOTEGAON.lat, BENGALURU.lat));
    expect(p[1]).toBeGreaterThan(Math.min(GOTEGAON.lng, BENGALURU.lng));
    expect(p[1]).toBeLessThan(Math.max(GOTEGAON.lng, BENGALURU.lng));
  });

  it("degenerates cleanly for identical endpoints", () => {
    const path = buildRoutePath(CHENNAI, CHENNAI);
    expect(path).toHaveLength(8);
    for (const p of path) {
      expect(p).toEqual([CHENNAI.lat, CHENNAI.lng]);
      expect(distToSegment(p, CHENNAI, CHENNAI)).toBe(0);
    }
  });
});

describe("fetchOsrmRoute", () => {
  const osrmUrl = (a: LatLng, b: LatLng) =>
    `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;

  it("falls back to buildRoutePath when the network request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const path = await fetchOsrmRoute(MUMBAI, PUNE);
    expect(path).toEqual(buildRoutePath(MUMBAI, PUNE));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(osrmUrl(MUMBAI, PUNE));
  });

  it("falls back when the server answers with a non-OK response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const path = await fetchOsrmRoute(CHENNAI, BENGALURU);
    expect(path).toEqual(buildRoutePath(CHENNAI, BENGALURU));
  });

  it("falls back when OSRM reports no usable route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "NoRoute", routes: [] }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchOsrmRoute(DELHI, JAIPUR)).toEqual(
      buildRoutePath(DELHI, JAIPUR),
    );
  });

  it("swaps OSRM's [lng, lat] coordinates into [lat, lng] pairs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [79.18, 22.92],
                [78.5, 18.5],
                [77.5946, 12.9716],
              ],
            },
          },
        ],
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const path = await fetchOsrmRoute(GOTEGAON, BENGALURU);
    expect(path).toEqual([
      [22.92, 79.18],
      [18.5, 78.5],
      [12.9716, 77.5946],
    ]);
  });

  it("caches by rounded coordinates so repeat calls skip the network", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchOsrmRoute(AHMEDABAD, SURAT);
    const second = await fetchOsrmRoute(AHMEDABAD, SURAT);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call hit the cache
  });
});
