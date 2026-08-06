import { describe, expect, it } from "vitest";
import {
  BENGALURU,
  GOTEGAON,
  estimateFare,
  etaMinutes,
  formatINR,
  formatKm,
  haversineKm,
  isInIndia,
} from "./geo";

const RATES = { baseFare: 40, perKm: 12, minFare: 60 };

describe("estimateFare", () => {
  it("charges base + per-km for a normal trip", () => {
    expect(estimateFare(5, RATES)).toBe(100); // 40 + 12×5
  });

  it("rounds the fare up/down to the nearest ₹5", () => {
    // raw = 102 → ₹100, raw = 103 → ₹105
    expect(estimateFare(62 / 12, { ...RATES, minFare: 0 })).toBe(100);
    expect(estimateFare(63 / 12, { ...RATES, minFare: 0 })).toBe(105);
  });

  it("never goes below the minimum fare", () => {
    // raw = 32, but the floor is 60
    expect(estimateFare(1, { baseFare: 20, perKm: 12, minFare: 60 })).toBe(60);
  });

  it("protects the minimum fare even when rounding would dip below it", () => {
    // raw = 32 < min 62, and rounding 62 to a ₹5 multiple gives 60 — the
    // outer max keeps the advertised minimum of 62.
    expect(estimateFare(1, { baseFare: 20, perKm: 12, minFare: 62 })).toBe(62);
  });

  it("returns the base fare for a zero-distance trip", () => {
    expect(estimateFare(0, { baseFare: 30, perKm: 10, minFare: 0 })).toBe(30);
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(BENGALURU, BENGALURU)).toBe(0);
  });

  it("is symmetric", () => {
    const ab = haversineKm(BENGALURU, GOTEGAON);
    const ba = haversineKm(GOTEGAON, BENGALURU);
    expect(ab).toBeCloseTo(ba, 8);
  });

  it("measures one degree of longitude at the equator (~111.2 km)", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.19,
      1,
    );
  });

  it("measures a quarter of the earth's circumference (~10,008 km)", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 90, lng: 0 })).toBeCloseTo(
      10007.5,
      0,
    );
  });

  it("puts Bengaluru→Gotegaon in a sane straight-line range (~1,100 km)", () => {
    const d = haversineKm(BENGALURU, GOTEGAON);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1300);
  });
});

describe("formatINR", () => {
  it("formats with Indian digit grouping", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(1234)).toBe("₹1,234");
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(1234567)).toBe("₹12,34,567");
  });

  it("rounds to whole rupees", () => {
    expect(formatINR(75.6)).toBe("₹76");
  });
});

describe("formatKm", () => {
  it("uses one decimal under 10 km", () => {
    expect(formatKm(3.456)).toBe("3.5 km");
    expect(formatKm(9.94)).toBe("9.9 km");
    expect(formatKm(0)).toBe("0.0 km");
  });

  it("rounds to whole km at 10 km and beyond", () => {
    expect(formatKm(10)).toBe("10 km");
    expect(formatKm(12.4)).toBe("12 km");
  });
});

describe("etaMinutes", () => {
  it("assumes ~18 km/h city EV traffic", () => {
    expect(etaMinutes(5)).toBe(17); // round(5/18×60)
    expect(etaMinutes(18)).toBe(60);
  });

  it("never reports below 1 minute", () => {
    expect(etaMinutes(0)).toBe(1);
  });
});

describe("isInIndia", () => {
  it("accepts Indian cities", () => {
    expect(isInIndia(BENGALURU.lat, BENGALURU.lng)).toBe(true);
    expect(isInIndia(GOTEGAON.lat, GOTEGAON.lng)).toBe(true);
  });

  it("rejects locations outside the India bounding box", () => {
    expect(isInIndia(40.71, -74.01)).toBe(false); // New York
    expect(isInIndia(0, 0)).toBe(false);
  });

  it("honours the boundary inclusive on the north/west edges", () => {
    expect(isInIndia(37.1, 68.0)).toBe(true);
    expect(isInIndia(37.1001, 68.0)).toBe(false);
  });
});
