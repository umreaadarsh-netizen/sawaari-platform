import { describe, expect, it } from "vitest";
import { clampStars, nextAverageRating } from "./rating";

describe("clampStars", () => {
  it("keeps valid 1–5 ratings as-is", () => {
    expect(clampStars(1)).toBe(1);
    expect(clampStars(3)).toBe(3);
    expect(clampStars(5)).toBe(5);
  });

  it("clamps out-of-band ratings into 1–5", () => {
    expect(clampStars(0)).toBe(1);
    expect(clampStars(-3)).toBe(1);
    expect(clampStars(7)).toBe(5);
  });

  it("rounds fractional input before clamping", () => {
    expect(clampStars(3.4)).toBe(3);
    expect(clampStars(3.5)).toBe(4);
    expect(clampStars(3.6)).toBe(4);
    expect(clampStars(4.9)).toBe(5);
  });
});

describe("nextAverageRating", () => {
  it("replaces the new-driver placeholder with the first genuine rating", () => {
    expect(nextAverageRating(4.9, 0, 5)).toBe(5);
    expect(nextAverageRating(4.9, 0, 3)).toBe(3);
  });

  it("rolls a running average forward", () => {
    expect(nextAverageRating(5, 1, 4)).toBe(4.5); // (5×1 + 4) / 2
    expect(nextAverageRating(4.5, 2, 5)).toBeCloseTo(14 / 3, 10); // 4.666…
    expect(nextAverageRating(5, 1, 5)).toBe(5);
    expect(nextAverageRating(3, 3, 3)).toBe(3);
  });

  it("matches the mutation's stored values for a [5, 4, 5] sequence", () => {
    // Mirrors rateDriver: first rating replaces the 4.9 placeholder, the
    // average is rolled per rating, and the stored value is rounded to 0.1.
    const store = (avg: number) => Math.round(avg * 10) / 10;

    let rating = 4.9;
    let count = 0;

    rating = store(nextAverageRating(rating, count, 5));
    count += 1;
    expect([rating, count]).toEqual([5, 1]);

    rating = store(nextAverageRating(rating, count, 4));
    count += 1;
    expect([rating, count]).toEqual([4.5, 2]);

    rating = store(nextAverageRating(rating, count, 5));
    count += 1;
    expect([rating, count]).toEqual([4.7, 3]);
  });
});
