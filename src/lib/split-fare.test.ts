import { describe, expect, it } from "vitest";
import {
  DRIVER_COMMISSION_RATE,
  PLATFORM_COMMISSION_RATE,
  splitFare,
} from "./geo";

describe("splitFare", () => {
  it("splits a fare 75/25", () => {
    expect(splitFare(100)).toEqual({ driverShare: 75, platformShare: 25 });
  });

  it("rounds the driver share and gives the platform the remainder", () => {
    expect(splitFare(10)).toEqual({ driverShare: 8, platformShare: 2 }); // 7.5 → 8
    expect(splitFare(3)).toEqual({ driverShare: 2, platformShare: 1 }); // 2.25 → 2
    expect(splitFare(1)).toEqual({ driverShare: 1, platformShare: 0 }); // 0.75 → 1
    expect(splitFare(101)).toEqual({ driverShare: 76, platformShare: 25 }); // 75.75 → 76
    expect(splitFare(12345)).toEqual({
      driverShare: 9259,
      platformShare: 3086,
    });
  });

  it("handles a zero fare", () => {
    expect(splitFare(0)).toEqual({ driverShare: 0, platformShare: 0 });
  });

  it("always sums exactly to the fare", () => {
    for (let fare = 0; fare <= 250; fare++) {
      const { driverShare, platformShare } = splitFare(fare);
      expect(driverShare + platformShare).toBe(fare);
    }
    // …and for larger, odd fares too
    for (const fare of [999, 5000, 12345, 678910]) {
      const { driverShare, platformShare } = splitFare(fare);
      expect(driverShare + platformShare).toBe(fare);
    }
  });

  it("exposes commission rates that sum to 100%", () => {
    expect(DRIVER_COMMISSION_RATE).toBe(0.75);
    expect(PLATFORM_COMMISSION_RATE).toBe(0.25);
    expect(DRIVER_COMMISSION_RATE + PLATFORM_COMMISSION_RATE).toBe(1);
  });
});
