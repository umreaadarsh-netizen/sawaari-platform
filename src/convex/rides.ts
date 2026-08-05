import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

// ---- shared helpers -------------------------------------------------------

/** Straight-line distance in kilometres (haversine). */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Transparent fare: ₹30 base + ₹14/km, minimum ₹35, rounded to ₹5. */
export function estimateFare(distanceKm: number): number {
  const raw = 30 + 14 * distanceKm;
  const min = 35;
  return Math.max(min, Math.round(Math.max(raw, min) / 5) * 5);
}

const ACTIVE_STATUSES = [
  "requested",
  "accepted",
  "arriving",
  "in_progress",
] as const;

const isActive = (status: string) =>
  (ACTIVE_STATUSES as readonly string[]).includes(status);

// ---- rider flow -----------------------------------------------------------

export const requestRide = mutation({
  args: {
    pickup: v.object({ address: v.string(), lat: v.number(), lng: v.number() }),
    dropoff: v.object({ address: v.string(), lat: v.number(), lng: v.number() }),
  },
  handler: async (ctx, { pickup, dropoff }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in to book a ride.");

    const distanceKm = haversineKm(
      pickup.lat,
      pickup.lng,
      dropoff.lat,
      dropoff.lng,
    );
    if (distanceKm < 0.2) {
      throw new Error("Pickup and drop-off are too close together.");
    }

    const recent = await ctx.db
      .query("rides")
      .withIndex("by_rider_created", (q) => q.eq("riderId", user._id))
      .order("desc")
      .take(10);
    if (recent.some((r) => isActive(r.status))) {
      throw new Error("You already have an active ride.");
    }

    return await ctx.db.insert("rides", {
      riderId: user._id,
      status: "requested",
      pickup,
      dropoff,
      fare: estimateFare(distanceKm),
      distanceKm,
      riderName: user.name ?? user.email?.split("@")[0] ?? "Guest",
      createdAt: Date.now(),
    });
  },
});

/** The ride currently in flight for the current user on the given side. */
export const activeRide = query({
  args: { side: v.union(v.literal("rider"), v.literal("driver")) },
  handler: async (ctx, { side }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    if (side === "rider") {
      const rides = await ctx.db
        .query("rides")
        .withIndex("by_rider_created", (q) => q.eq("riderId", user._id))
        .order("desc")
        .take(10);
      return rides.find((r) => isActive(r.status)) ?? null;
    }

    const rides = await ctx.db
      .query("rides")
      .withIndex("by_driver_created", (q) => q.eq("driverId", user._id))
      .order("desc")
      .take(10);
    return rides.find((r) => isActive(r.status)) ?? null;
  },
});

export const getRide = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const ride = await ctx.db.get(rideId);
    if (!ride) return null;
    if (ride.riderId !== user._id && ride.driverId !== user._id) return null;
    return ride;
  },
});

export const cancelRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== user._id) {
      throw new Error("Only the rider can cancel this ride.");
    }
    if (ride.status !== "requested" && ride.status !== "accepted") {
      throw new Error("This ride can no longer be cancelled.");
    }
    await ctx.db.patch(rideId, { status: "cancelled" });
  },
});

// ---- driver flow ----------------------------------------------------------

/** Open ride requests, streamed live to every online driver. */
export const openRides = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rides = await ctx.db
      .query("rides")
      .withIndex("by_status_created", (q) => q.eq("status", "requested"))
      .order("desc")
      .take(20);
    return rides;
  },
});

export const acceptRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!driver) throw new Error("Create a driver profile first.");
    if (!driver.online) throw new Error("Go online to accept rides.");

    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("This ride no longer exists.");
    if (ride.status !== "requested") {
      throw new Error("Another driver already took this ride.");
    }

    await ctx.db.patch(rideId, {
      driverId: user._id,
      driverName: driver.name,
      vehicleNo: driver.vehicleNo,
      status: "accepted",
      acceptedAt: Date.now(),
    });

    // The accepted driver gains a trip on completion; bump the counter now so
    // stats feel alive, then patch again on completion.
    await ctx.db.patch(driver._id, { trips: driver.trips + 1 });
  },
});

export const updateRideStatus = mutation({
  args: {
    rideId: v.id("rides"),
    status: v.union(
      v.literal("arriving"),
      v.literal("in_progress"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, { rideId, status }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.driverId !== user._id) {
      throw new Error("Only the assigned driver can update this ride.");
    }
    const now = Date.now();
    await ctx.db.patch(rideId, {
      status,
      startedAt: status === "in_progress" ? (ride.startedAt ?? now) : ride.startedAt,
      completedAt: status === "completed" ? (ride.completedAt ?? now) : ride.completedAt,
    });
  },
});

// ---- in-ride chat ---------------------------------------------------------

export const listMessages = query({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const ride = await ctx.db.get(rideId);
    if (!ride) return [];
    if (ride.riderId !== user._id && ride.driverId !== user._id) return [];
    return await ctx.db
      .query("rideMessages")
      .withIndex("by_ride_created", (q) => q.eq("rideId", rideId))
      .order("asc")
      .take(200);
  },
});

export const sendMessage = mutation({
  args: { rideId: v.id("rides"), body: v.string() },
  handler: async (ctx, { rideId, body }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const text = body.trim();
    if (!text) return;
    if (text.length > 500) throw new Error("Message is too long.");
    const ride = await ctx.db.get(rideId);
    if (!ride) return;
    if (ride.riderId !== user._id && ride.driverId !== user._id) {
      throw new Error("You are not part of this ride.");
    }
    await ctx.db.insert("rideMessages", {
      rideId,
      authorId: user._id,
      authorName: user.name ?? user.email?.split("@")[0] ?? "Guest",
      body: text,
      createdAt: Date.now(),
    });
  },
});
