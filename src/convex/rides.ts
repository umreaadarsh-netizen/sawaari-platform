import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";
import { FleetVehicle, getFleetRates } from "./fleet";

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

/** Transparent fare from a fleet card: base + per-km, minimum, rounded to ₹5. */
export function estimateFare(distanceKm: number, rates: FleetVehicle): number {
  const raw = rates.baseFare + rates.perKm * distanceKm;
  return Math.max(rates.minFare, Math.round(Math.max(raw, rates.minFare) / 5) * 5);
}

const ACTIVE_STATUSES = [
  "requested",
  "matched",
  "arriving",
  "in_progress",
] as const;

const isActive = (status: string) =>
  (ACTIVE_STATUSES as readonly string[]).includes(status);

/**
 * Dispatch radius for ride requests. A `requested` ride is broadcast (via the
 * live query subscription — the WebSocket channel) only to online drivers whose
 * current location is within this many kilometres of the pickup.
 */
export const MATCHING_RADIUS_KM = 5;

/** Distance from the driver to a ride's pickup, in kilometres. */
function driverToPickupKm(
  driver: { lat: number; lng: number },
  pickup: { lat: number; lng: number },
): number {
  return haversineKm(driver.lat, driver.lng, pickup.lat, pickup.lng);
}

// ---- rider flow -----------------------------------------------------------

export const requestRide = mutation({
  args: {
    pickup: v.object({ address: v.string(), lat: v.number(), lng: v.number() }),
    dropoff: v.object({ address: v.string(), lat: v.number(), lng: v.number() }),
    vehicleType: v.string(),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, { pickup, dropoff, vehicleType, scheduledFor }) => {
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

    const rates = await getFleetRates(ctx, vehicleType);
    if (!rates.enabled) {
      throw new Error("This vehicle is temporarily unavailable.");
    }
    if (scheduledFor !== undefined) {
      const maxAhead = Date.now() + 48 * 60 * 60 * 1000;
      if (scheduledFor < Date.now() || scheduledFor > maxAhead) {
        throw new Error("Scheduled pickup must be within the next 48 hours.");
      }
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
      fare: estimateFare(distanceKm, rates),
      distanceKm,
      vehicleType,
      scheduledFor,
      paid: false,
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

/** Settle an invoice for a completed trip. */
export const payRide = mutation({
  args: {
    rideId: v.id("rides"),
    method: v.union(v.literal("upi"), v.literal("card"), v.literal("cash")),
  },
  handler: async (ctx, { rideId, method }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.riderId !== user._id) {
      throw new Error("Only the rider can pay for this ride.");
    }
    if (ride.status !== "completed") {
      throw new Error("Payment is available once the trip is completed.");
    }
    if (ride.paid) throw new Error("This trip is already settled.");
    await ctx.db.patch(rideId, {
      paid: true,
      paidAt: Date.now(),
      paymentMethod: method,
    });
  },
});

/** Recent trips for the signed-in customer or driver. */
export const myRides = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const [asRider, asDriver] = await Promise.all([
      ctx.db
        .query("rides")
        .withIndex("by_rider_created", (q) => q.eq("riderId", user._id))
        .order("desc")
        .take(20),
      ctx.db
        .query("rides")
        .withIndex("by_driver_created", (q) => q.eq("driverId", user._id))
        .order("desc")
        .take(20),
    ]);
    const seen = new Set<string>();
    const merged = [...asRider, ...asDriver].filter((r) => {
      if (seen.has(r._id)) return false;
      seen.add(r._id);
      return true;
    });
    return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
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
    if (ride.status !== "requested" && ride.status !== "matched") {
      throw new Error("This ride can no longer be cancelled.");
    }
    await ctx.db.patch(rideId, { status: "cancelled" });
  },
});

// ---- driver flow ----------------------------------------------------------

/**
 * Open ride requests, streamed live over the WebSocket subscription to every
 * online driver — but only those whose current location is within the 5 km
 * matching radius of the pickup. The broadcast is a personal, radius-filtered
 * view: each driver only ever sees requests they could realistically serve.
 */
export const openRides = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!driver) return [];
    if (!driver.online) return []; // offline drivers receive no broadcasts

    const rides = await ctx.db
      .query("rides")
      .withIndex("by_status_created", (q) => q.eq("status", "requested"))
      .order("desc")
      .take(30);

    return rides
      .map((r) => ({ ride: r, distanceKm: driverToPickupKm(driver.location, r.pickup) }))
      .filter(({ distanceKm }) => distanceKm <= MATCHING_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 12)
      .map(({ ride }) => ride);
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
    if (ride.driverId) {
      throw new Error("This ride is already locked to another driver.");
    }
    // Defense in depth: never accept a pickup outside the matching radius.
    if (driverToPickupKm(driver.location, ride.pickup) > MATCHING_RADIUS_KM) {
      throw new Error("This pickup is outside your 5 km matching radius.");
    }

    // Lock the ride to this driver and flip the status to `matched` — both
    // dashboards observe this change through their live queries, so the rider
    // sees the driver card appear and other drivers see the request vanish
    // simultaneously, with no page refresh.
    await ctx.db.patch(rideId, {
      driverId: user._id,
      driverName: driver.name,
      vehicleNo: driver.vehicleNo,
      status: "matched",
      acceptedAt: Date.now(),
    });

    // The matched driver gains a trip on completion; bump the counter now so
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
