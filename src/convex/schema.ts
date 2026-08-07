import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
//
// Sawaari RBAC: every signed-in user is either a `rider`, a `driver`, or an
// `admin` (plus legacy `user`/`member` values kept for migration safety).
// The role is granted on onboarding — `drivers.saveProfile` upgrades a user
// to `driver` and the first ride booking grants `rider` — and it gates which
// dashboards and backend functions a session may touch.
export const ROLES = {
  ADMIN: "admin",
  RIDER: "rider",
  DRIVER: "driver",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.RIDER),
  v.literal(ROLES.DRIVER),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// ---- Sawaari ride-hailing domain ----

export const RIDE_STATUSES = [
  "requested", // rider asked; broadcast to nearby drivers
  "matched", // a driver accepted and the ride is locked to them
  "arriving", // driver reached pickup
  "in_progress", // on the road to drop-off
  "completed",
  "cancelled",
] as const;

export const rideStatusValidator = v.union(
  v.literal("requested"),
  v.literal("matched"),
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

      // Phone-OTP accounts (Convex Auth Phone provider): the normalized
      // E.164-ish number (91XXXXXXXXXX) is the account identifier and is
      // verified when the user signs in with an SMS code. Field names and the
      // `phone` index MUST match what @convex-dev/auth queries
      // (uniqueUserWithVerifiedPhone uses withIndex("phone") on the `phone`
      // field and filters on `phoneVerificationTime`).
      phone: v.optional(v.string()),
      phoneVerificationTime: v.optional(v.number()),

      role: v.optional(roleValidator), // role of the user. do not remove

      // Stripe refs (all server-written via webhooks/internal mutations):
      // `stripeCustomerId` — the rider's PaymentMethods/Customer vault for
      //   one-click card payments;
      // `stripeAccountId` — the driver's Stripe Connect Express account used
      //   for direct payouts;
      // the `stripe*Enabled` flags are synced from `account.updated` webhooks
      //   and gate whether a driver may request a payout;
      // `stripePaymentMethodId` — the vaulted default card (SetupIntent).
      stripeCustomerId: v.optional(v.string()),
      stripeAccountId: v.optional(v.string()),
      stripeDetailsSubmitted: v.optional(v.boolean()),
      stripeChargesEnabled: v.optional(v.boolean()),
      stripePayoutsEnabled: v.optional(v.boolean()),
      stripePaymentMethodId: v.optional(v.string()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("phone", ["phone"])
      .index("stripe_customer", ["stripeCustomerId"])
      .index("stripe_account", ["stripeAccountId"]),

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
      // 4-digit ride-lifecycle codes. pickupOtp is generated when a driver
      // accepts and shown to the rider; the driver must enter it to start the
      // trip. completionOtp is generated when the trip starts; the rider shares
      // it with the driver at drop-off so the trip can be completed.
      pickupOtp: v.optional(v.string()),
      completionOtp: v.optional(v.string()),
      createdAt: v.number(),
      acceptedAt: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      // The 75/25 commission split, frozen on the ride the moment it is
      // completed (driver 75% / platform 25%). The same split is stamped on
      // the receipt at settlement, so dashboards can always show net
      // earnings per trip.
      driverShare: v.optional(v.number()),
      platformShare: v.optional(v.number()),
      commissionRate: v.optional(v.number()),
    })
      .index("by_rider_created", ["riderId", "createdAt"])
      .index("by_driver_created", ["driverId", "createdAt"])
      .index("by_status_created", ["status", "createdAt"]),

    // Driver earnings wallets — the 75% net share of every settled fare,
    // credited automatically when the rider pays. The 25% platform cut is
    // retained on the same row so the admin ledger balances to the gross
    // fares the platform collected (incl. system-QR payments).
    wallets: defineTable({
      userId: v.id("users"),
      driverEarnings: v.number(), // 75% net accrual for the driver
      platformRetained: v.number(), // 25% retained by the platform
      totalFares: v.number(), // gross fares collected through the platform
      settledRides: v.number(),
      // Optional pre-paid rider balance — credited via Stripe
      // `payment_intent.succeeded` webhooks for `wallet_topup` intents.
      riderBalance: v.optional(v.number()),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Idempotency ledger for Stripe webhooks. Stripe delivers events
    // at-least-once, so every processed event id is recorded here (unique
    // index) and re-deliveries are skipped.
    stripeEvents: defineTable({
      eventId: v.string(), // Stripe event id, e.g. evt_...
      type: v.string(),
      processedAt: v.number(),
    }).index("by_event_id", ["eventId"]),

    // Every Stripe PaymentIntent we create, tracked from creation through
    // webhook confirmation so settlement is auditable and idempotent.
    payments: defineTable({
      stripePaymentIntentId: v.string(),
      userId: v.id("users"),
      purpose: v.union(v.literal("ride"), v.literal("wallet_topup")),
      rideId: v.optional(v.id("rides")),
      amountPaise: v.number(),
      currency: v.string(),
      status: v.union(
        v.literal("created"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
      createdAt: v.number(),
      settledAt: v.optional(v.number()),
    })
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_pi", ["stripePaymentIntentId"]),

    // Stripe Connect transfers initiated from driver earnings — the record
    // of money leaving the platform wallet to a driver's bank.
    payouts: defineTable({
      driverId: v.id("users"),
      amountPaise: v.number(),
      currency: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("failed"),
      ),
      transferId: v.optional(v.string()),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
    })
      .index("by_driver_created", ["driverId", "createdAt"])
      .index("by_transfer", ["transferId"]),

    // Online EV auto drivers whose live location is streamed to riders.
    drivers: defineTable({
      userId: v.id("users"),
      name: v.string(),
      vehicleNo: v.string(),
      phone: v.optional(v.string()), // E.164-ish 91XXXXXXXXXX — used for the WhatsApp chat link
      online: v.boolean(),
      location: placeValidator,
      lastSeen: v.number(),
      rating: v.number(), // live running average from rideRatings (starts at a 4.9 placeholder)
      ratingCount: v.number(), // number of genuine rider ratings folded into the average
      trips: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_online", ["online"]),

    // Settlement receipts for completed rides. A receipt is written the moment
    // a fare is captured (UPI or cash) and is the permanent record of the
    // transaction — rider/driver dashboards and the admin ledger read from
    // here, so a receipt can never be edited or lost.
    receipts: defineTable({
      rideId: v.id("rides"),
      receiptNo: v.string(), // stable SW-XXXXXX id shown to customers
      riderId: v.id("users"),
      riderName: v.string(),
      driverId: v.optional(v.id("users")),
      driverName: v.optional(v.string()),
      vehicleNo: v.optional(v.string()),
      vehicleType: v.string(),
      pickup: placeValidator,
      dropoff: placeValidator,
      distanceKm: v.number(),
      baseFare: v.number(),
      distanceFare: v.number(),
      totalFare: v.number(),
      // The frozen 75/25 commission split applied at settlement:
      // `driverShare` (75%) accrues to the driver's earnings wallet and
      // `platformShare` (25%) is retained by the platform's ledger.
      driverShare: v.number(),
      platformShare: v.number(),
      commissionRate: v.number(),
      paymentMethod: v.union(
        v.literal("upi"),
        v.literal("card"),
        v.literal("qr"), // SAWAARI system QR — full fare credited to the platform
        v.literal("cash"),
      ),
      upiRef: v.optional(v.string()), // UPI / system-QR transaction reference (UTRN)
      settledAt: v.number(),
    })
      .index("by_ride", ["rideId"])
      .index("by_rider_created", ["riderId", "settledAt"])
      .index("by_driver_created", ["driverId", "settledAt"]),

    // Rider → driver trip ratings. One immutable rating per completed ride,
    // written the moment the fare is settled. Each rating rolls up into the
    // driver's live average (`drivers.rating`) so both dashboards stream the
    // same score over the WebSocket subscription.
    rideRatings: defineTable({
      rideId: v.id("rides"),
      riderId: v.id("users"),
      riderName: v.string(),
      driverId: v.id("users"),
      rating: v.number(), // 1–5 stars
      comment: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_ride", ["rideId"])
      .index("by_rider_created", ["riderId", "createdAt"])
      .index("by_driver_created", ["driverId", "createdAt"]),

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

    // DEMO ONLY — plaintext SMS codes parked here when no Vonage credentials
    // are configured, so the dev preview can surface the code on screen (no
    // SMS is actually sent). Never written when VONAGE_API_KEY / _SECRET are
    // set, and the demoCode query refuses to read it in production mode.
    demoOtps: defineTable({
      phone: v.string(),
      code: v.string(),
      expiresAt: v.number(),
      createdAt: v.number(),
    }).index("by_phone", ["phone"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
