import { describe, expect, test } from "bun:test";
import {
  GOTEGAON,
  estimateFare,
  haversineKm,
  type LatLng,
} from "../src/lib/geo";
import {
  isValidIndianPhone,
  maskPhone,
  normalizeIndianPhone,
  waNumber,
} from "../src/convex/phone";

// Matches the dispatch pipeline in src/convex/rides.ts `openRides`:
// map distance -> filter within MATCHING_RADIUS_KM -> sort nearest first
// -> cap at 12. Kept as a pure function so the radius rule is testable.
const MATCHING_RADIUS_KM = 5;
function dispatchWithinRadius(
  driver: LatLng,
  rides: { id: string; pickup: LatLng }[],
): { id: string; distanceKm: number }[] {
  return rides
    .map((r) => ({ id: r.id, distanceKm: haversineKm(driver, r.pickup) }))
    .filter(({ distanceKm }) => distanceKm <= MATCHING_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);
}

describe("haversineKm", () => {
  test("zero distance at the same point", () => {
    expect(haversineKm(GOTEGAON, GOTEGAON)).toBeCloseTo(0, 6);
  });

  test("is symmetric", () => {
    const a: LatLng = { lat: 22.92, lng: 79.18 };
    const b: LatLng = { lat: 22.891, lng: 79.19 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });

  test("Gotegaon -> Narsinghpur is roughly 3.4 km", () => {
    const narsinghpur: LatLng = { lat: 22.891, lng: 79.19 };
    const d = haversineKm(GOTEGAON, narsinghpur);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(4);
  });

  test("Delhi -> Mumbai matches the known ~1150 km reference", () => {
    const delhi: LatLng = { lat: 28.6139, lng: 77.209 };
    const mumbai: LatLng = { lat: 19.076, lng: 72.8777 };
    const d = haversineKm(delhi, mumbai);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1250);
  });
});

describe("estimateFare (fare calculator + booking quotes)", () => {
  const classic = { baseFare: 30, perKm: 14, minFare: 35 };
  const comfort = { baseFare: 45, perKm: 18, minFare: 50 };
  const xl = { baseFare: 60, perKm: 22, minFare: 65 };

  test("base + per-km math, rounded to nearest ₹5", () => {
    expect(estimateFare(5, classic)).toBe(100); // 30 + 14*5
    expect(estimateFare(1, classic)).toBe(45); // 44 -> 45
    expect(estimateFare(10, comfort)).toBe(225); // 45 + 18*10
    expect(estimateFare(10, xl)).toBe(280); // 60 + 22*10
  });

  test("minimum fare applies on very short trips", () => {
    expect(estimateFare(0.1, classic)).toBe(35);
    expect(estimateFare(0.2, comfort)).toBe(50);
    expect(estimateFare(0.05, xl)).toBe(65);
  });

  test("never below the minimum, never with surge", () => {
    for (const km of [0, 0.3, 1, 4, 12.5]) {
      expect(estimateFare(km, classic)).toBeGreaterThanOrEqual(35);
    }
  });
});

describe("5 km matching-radius dispatch (openRides pipeline)", () => {
  const driver = GOTEGAON;
  const pickupAt = (latOffset: number, lngOffset: number): LatLng => ({
    lat: driver.lat + latOffset,
    lng: driver.lng + lngOffset,
  });
  // ~0.55 km away (0.005° lat)
  const nearby1 = pickupAt(0.005, 0);
  // ~3.4 km away (0.03° lat)
  const nearby2 = pickupAt(0.03, 0);
  // ~1.1 km away
  const nearby3 = pickupAt(0.01, 0);
  // ~6.7 km away (0.06° lat) — outside the radius
  const far1 = pickupAt(0.06, 0);
  // ~13.4 km away — outside the radius
  const far2 = pickupAt(0.12, 0);

  const rides = [
    { id: "ride-far2", pickup: far2 },
    { id: "ride-near2", pickup: nearby2 },
    { id: "ride-far1", pickup: far1 },
    { id: "ride-near1", pickup: nearby1 },
    { id: "ride-near3", pickup: nearby3 },
  ];

  test("only rides within 5 km are dispatched", () => {
    const dispatched = dispatchWithinRadius(driver, rides);
    expect(dispatched.map((d) => d.id).sort()).toEqual([
      "ride-near1",
      "ride-near2",
      "ride-near3",
    ]);
  });

  test("dispatched rides are ordered nearest-first", () => {
    const dispatched = dispatchWithinRadius(driver, rides);
    expect(dispatched[0].id).toBe("ride-near1");
    expect(dispatched[1].id).toBe("ride-near3");
    expect(dispatched[2].id).toBe("ride-near2");
  });

  test("out-of-radius pickups never reach a driver", () => {
    const dispatched = dispatchWithinRadius(driver, rides);
    expect(dispatched.some((d) => d.id === "ride-far1")).toBe(false);
    expect(dispatched.some((d) => d.id === "ride-far2")).toBe(false);
    for (const d of dispatched) {
      expect(d.distanceKm).toBeLessThanOrEqual(5);
    }
  });

  test("a driver standing at the pickup always receives it", () => {
    const dispatched = dispatchWithinRadius(driver, [
      { id: "ride-at-pickup", pickup: driver },
    ]);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].distanceKm).toBeCloseTo(0, 6);
  });
});

describe("Indian phone helpers (WhatsApp + OTP)", () => {
  test("normalizeIndianPhone adds the 91 country code", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("919876543210");
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("919876543210");
    expect(normalizeIndianPhone("919876543210")).toBe("919876543210");
  });

  test("isValidIndianPhone only accepts 91 + 6-9 + 9 digits", () => {
    expect(isValidIndianPhone("919876543210")).toBe(true);
    expect(isValidIndianPhone("915123456789")).toBe(false); // starts with 5
    expect(isValidIndianPhone("91987654321")).toBe(false); // 9 digits
    expect(isValidIndianPhone("819876543210")).toBe(false); // no cc
  });

  test("waNumber produces digits-only 91-prefixed links", () => {
    expect(waNumber("+91 98765 43210")).toBe("919876543210");
    expect(waNumber("9876543210")).toBe("919876543210");
  });

  test("maskPhone formats for display", () => {
    expect(maskPhone("919876543210")).toBe("+91 98765-43210");
  });
});
