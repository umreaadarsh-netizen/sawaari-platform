/**
 * Pure rating math shared by the Convex server and the unit tests.
 *
 * Riders rate completed trips 1–5 stars. The raw input is rounded and clamped
 * into the valid band, and the driver's live average is rolled forward from
 * their current count — the first genuine rating replaces the new-driver
 * placeholder instead of blending into it.
 */

/** Round and clamp a raw rating into the valid 1–5 star band. */
export function clampStars(rating: number): number {
  return Math.max(1, Math.min(5, Math.round(rating)));
}

/**
 * The driver's running average after one more `stars` rating, given the
 * current average and the number of ratings behind it. When `count` is 0 the
 * first genuine rating replaces the placeholder outright.
 */
export function nextAverageRating(
  current: number,
  count: number,
  stars: number,
): number {
  if (count === 0) return stars;
  return (current * count + stars) / (count + 1);
}
