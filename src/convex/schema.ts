import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---- Sawaari ride-hailing domain ----

export const RIDE_STATUSES = [
  "requested", // rider asked; waiting for a driver
  "accepted", // driver matched
  "arriving", // driver reached pickup
  "in_progress", // on the road to drop-off
  "completed",
  "cancelled",
] as const;

export const rideStatusValidator = v.union(
  v.literal("requested"),
  v.literal("accepted"),
  v.literal("arriving"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);
export type RideStatus = Infer<typeof rideStatusValidator>;

export const placeValidator = v.object({
  address: v.string(),
  lat: v.number(),
  lng: v.number(),
});
export type Place = Infer<typeof placeValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // A ride connects a rider and a driver through its lifecycle.
    // Convex queries over this table are live WebSocket subscriptions, so a
    // status change on one dashboard instantly appears on the other.
    rides: defineTable({
      riderId: v.id("users"),
      driverId: v.optional(v.id("users")),
      status: rideStatusValidator,
      pickup: placeValidator,
      dropoff: placeValidator,
      fare: v.number(),
      distanceKm: v.number(),
      vehicleType: v.string(), // fleet catalog id
      scheduledFor: v.optional(v.number()), // future pickup time for scheduled rides
      paid: v.boolean(),
      paidAt: v.optional(v.number()),
      paymentMethod: v.optional(v.string()),
      riderName: v.string(),
      driverName: v.optional(v.string()),
      vehicleNo: v.optional(v.string()),
      createdAt: v.number(),
      acceptedAt: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    })
      .index("by_rider_created", ["riderId", "createdAt"])
      .index("by_driver_created", ["driverId", "createdAt"])
      .index("by_status_created", ["status", "createdAt"]),

    // Online EV auto drivers whose live location is streamed to riders.
    drivers: defineTable({
      userId: v.id("users"),
      name: v.string(),
      vehicleNo: v.string(),
      phone: v.optional(v.string()), // E.164-ish 91XXXXXXXXXX — used for the WhatsApp chat link
      online: v.boolean(),
      location: placeValidator,
      lastSeen: v.number(),
      rating: v.number(),
      trips: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_online", ["online"]),

    // In-ride chat between rider and driver (streamed live to both).
    rideMessages: defineTable({
      rideId: v.id("rides"),
      authorId: v.id("users"),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_ride_created", ["rideId", "createdAt"]),

    // The bookable fleet catalog — managed from the admin area.
    fleet: defineTable({
      id: v.string(), // stable vehicle id, e.g. "classic"
      name: v.string(),
      tagline: v.string(),
      seats: v.number(),
      baseFare: v.number(),
      perKm: v.number(),
      minFare: v.number(),
      enabled: v.boolean(),
      sort: v.number(),
    }).index("by_vehicle_id", ["id"]),

    // Phone OTP codes for SMS login (delivered via Vonage). Codes are stored
    // hashed with a per-code salt, expire after 10 minutes and are limited to
    // a handful of verification attempts per phone.
    phoneOtps: defineTable({
      phone: v.string(), // E.164-ish, e.g. "919876543210"
      codeHash: v.string(),
      salt: v.string(),
      expiresAt: v.number(),
      attempts: v.number(),
      createdAt: v.number(),
    }).index("by_phone", ["phone"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
