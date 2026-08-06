import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";
import { clampStars, nextAverageRating } from "../lib/rating";

/**
 * Rider → driver trip ratings & feedback.
 *
 * A rider rates their trip once, right after the fare is settled. The rating
 * is stored per ride (one per ride, immutable) and rolls up into a running
 * average on the driver's profile (`drivers.rating`), which both dashboards
 * stream live over the WebSocket subscription — the rider sees the driver's
 * score before boarding, the driver sees their own update instantly.
 */
export const rateDriver = mutation({
  args: {
    rideId: v.id("rides"),
    rating: v.number(), // 1–5
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { rideId, rating, comment }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");

    const stars = clampStars(rating);
    const cleanComment = (comment ?? "").trim().slice(0, 300);

    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== user._id) {
      throw new Error("Only the rider who took this trip can rate it.");
    }
    if (ride.status !== "completed") {
      throw new Error("Ratings open once the trip is completed.");
    }
    if (!ride.driverId) {
      throw new Error("This trip has no driver to rate.");
    }
    // Narrowed copy — property narrowing doesn't flow into query closures.
    const driverId = ride.driverId;

    const existing = await ctx.db
      .query("rideRatings")
      .withIndex("by_ride", (q) => q.eq("rideId", rideId))
      .first();
    if (existing) throw new Error("You've already rated this trip.");

    await ctx.db.insert("rideRatings", {
      rideId,
      riderId: user._id,
      riderName: ride.riderName,
      driverId,
      rating: stars,
      comment: cleanComment || undefined,
      createdAt: Date.now(),
    });

    // Roll the new rating into the driver's live average. New drivers start
    // at a 4.9 placeholder with zero real ratings, so the first genuine
    // rating replaces the placeholder instead of blending into it.
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", driverId))
      .first();
    if (driver) {
      const count = driver.ratingCount ?? 0;
      const nextCount = count + 1;
      const nextAvg = nextAverageRating(driver.rating, count, stars);
      await ctx.db.patch(driver._id, {
        rating: Math.round(nextAvg * 10) / 10,
        ratingCount: nextCount,
      });
    }
  },
});

/** Every rating this user has given — keyed to rides for the history stars. */
export const myRatings = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("rideRatings")
      .withIndex("by_rider_created", (q) => q.eq("riderId", user._id))
      .order("desc")
      .take(100);
  },
});

/** Recent feedback on the signed-in driver's profile. */
export const driverRatings = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("rideRatings")
      .withIndex("by_driver_created", (q) => q.eq("driverId", user._id))
      .order("desc")
      .take(50);
  },
});
