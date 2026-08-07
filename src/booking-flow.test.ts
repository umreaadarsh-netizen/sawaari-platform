/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./convex/schema";
import { api } from "./convex/_generated/api";
import type { Id } from "./convex/_generated/dataModel";

/**
 * End-to-end backend test for the full Sawaari ride lifecycle:
 *
 *   rider books → driver accepts → OTP-verified trip start → completion
 *   → fare settlement (receipt + 75/25 wallet split) → rider rating.
 *
 * Runs against convex-test's in-memory Convex backend, so it exercises the
 * real mutations in `src/convex/rides.ts`, `drivers.ts`, `wallet.ts` and
 * `ratings.ts` with no network, deployment, or WebSocket layer.
 *
 * Identities: `getAuthUserId` (via `@convex-dev/auth`) reads the user id from
 * the subject claim `<userId>|<sessionId>`, so each `withIdentity` subject is
 * built from a real `users` row id seeded through the harness.
 */

const PICKUP = { address: "Gotegaon Chauraha, MP", lat: 22.92, lng: 79.18 };
// ~2.22 km south of the pickup (0.02° of latitude).
const DROPOFF = { address: "Gotegaon Bus Stand, MP", lat: 22.9, lng: 79.18 };

type Harness = Awaited<ReturnType<typeof setup>>["rider"];

async function setup() {
  // This project's Convex functions live under `src/convex/` (a custom
  // `functions` path in convex.json), so convex-test can't auto-discover them
  // with its built-in glob. Pass the module map explicitly; `import.meta.glob`
  // is a Vite transform available in vitest test files.
  const t = convexTest({
    schema,
    modules: import.meta.glob("./convex/**/*.*s"),
  });
  const { riderId, driverId } = await t.run(async (ctx) => {
    const riderId = await ctx.db.insert("users", {
      name: "Riya Rider",
      email: "riya@example.com",
      role: "user",
    });
    const driverId = await ctx.db.insert("users", {
      name: "Dev Driver",
      email: "dev@example.com",
      role: "user",
    });
    return { riderId, driverId };
  });
  const rider = t.withIdentity({
    subject: `${riderId}|rider-session`,
    name: "Riya Rider",
    email: "riya@example.com",
  });
  const driver = t.withIdentity({
    subject: `${driverId}|driver-session`,
    name: "Dev Driver",
    email: "dev@example.com",
  });
  return { rider, driver, riderId, driverId };
}

/** Create the driver profile, go online, and park next to the pickup. */
async function onboardDriver(driver: Harness) {
  await driver.mutation(api.drivers.saveProfile, {
    name: "Dev Driver",
    vehicleNo: "MP42EV1234",
  });
  await driver.mutation(api.drivers.setOnline, { online: true });
  await driver.mutation(api.drivers.updateLocation, {
    lat: PICKUP.lat,
    lng: PICKUP.lng,
  });
}

/**
 * Drive one ride from request to completion using only the public mutations
 * (including the pickup/completion code handshake). Returns the ride id.
 */
async function completeRide(
  rider: Harness,
  driver: Harness,
): Promise<Id<"rides">> {
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });

  // The rider's view carries the lifecycle codes; the driver's never does.
  const pickupOtp = (
    await rider.query(api.rides.activeRide, { side: "rider" })
  )!.pickupOtp!;

  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "arriving",
  });
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "in_progress",
    otp: pickupOtp,
  });

  const completionOtp = (
    await rider.query(api.rides.activeRide, { side: "rider" })
  )!.completionOtp!;
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "completed",
    otp: completionOtp,
  });

  return rideId;
}

test("full lifecycle: book → match → OTP start → complete → pay → rate", async () => {
  const { rider, driver, riderId, driverId } = await setup();
  await onboardDriver(driver);

  // 1. Rider books a classic EV auto for a ~2.2 km hop.
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  const booked = await rider.query(api.rides.getRide, { rideId });
  expect(booked?.status).toBe("requested");
  expect(booked?.paid).toBe(false);
  // base 30 + 14 × 2.22 ≈ 61.1 → ₹5-round → 60 (min fare 35 is no obstacle).
  expect(booked?.fare).toBe(60);
  expect(booked?.distanceKm).toBeGreaterThan(2.1);
  expect(booked?.distanceKm).toBeLessThan(2.4);
  expect(booked?.riderId).toBe(riderId);

  // 2. The request is broadcast to the nearby online driver, who accepts.
  const open = await driver.query(api.rides.openRides, {});
  expect(open.map((r) => r._id)).toContain(rideId);
  await driver.mutation(api.rides.acceptRide, { rideId });

  const matched = await rider.query(api.rides.getRide, { rideId });
  expect(matched?.status).toBe("matched");
  expect(matched?.driverId).toBe(driverId);
  const afterAccept = await rider.query(api.drivers.getDriver, { userId: driverId });
  expect(afterAccept?.trips).toBe(1); // trip counter bumps on match

  // 3. Lifecycle codes are secrets: only the rider's live view carries them
  //    (history/driver/admin views strip them). The driver must ask for them.
  const withCodes = await rider.query(api.rides.activeRide, { side: "rider" });
  expect(withCodes?.status).toBe("matched");
  expect(withCodes?.pickupOtp).toMatch(/^\d{4}$/);
  const pickupOtp = withCodes!.pickupOtp!;

  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "arriving",
  });
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "in_progress",
    otp: pickupOtp,
  });
  const started = await rider.query(api.rides.activeRide, { side: "rider" });
  expect(started?.status).toBe("in_progress");
  expect(started?.completionOtp).toMatch(/^\d{4}$/);
  const completionOtp = started!.completionOtp!;

  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "completed",
    otp: completionOtp,
  });
  const done = await rider.query(api.rides.getRide, { rideId });
  expect(done?.status).toBe("completed");
  expect(done?.completedAt).toBeTypeOf("number");
  expect(done?.driverShare).toBe(45); // 75% of ₹60
  expect(done?.platformShare).toBe(15); // 25% of ₹60
  expect(done?.commissionRate).toBe(0.75);

  // 4. Rider settles the fare — permanent receipt + driver wallet credit.
  await rider.mutation(api.rides.payRide, { rideId, method: "upi" });
  const paid = await rider.query(api.rides.getRide, { rideId });
  expect(paid?.paid).toBe(true);
  expect(paid?.paymentMethod).toBe("upi");
  expect(paid?.paidAt).toBeTypeOf("number");

  const receipt = await rider.query(api.rides.receiptForRide, { rideId });
  expect(receipt).toMatchObject({
    rideId,
    totalFare: 60,
    baseFare: 30,
    distanceFare: 30,
    driverShare: 45,
    platformShare: 15,
    commissionRate: 0.75,
    paymentMethod: "upi",
  });
  expect(receipt?.receiptNo).toBe(`SW-${rideId.slice(-6).toUpperCase()}`);
  expect(receipt?.upiRef).toMatch(/^\d{12}$/); // minted UTRN

  const wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet).toMatchObject({
    driverEarnings: 45,
    platformRetained: 15,
    totalFares: 60,
    settledRides: 1,
  });

  // 5. Rider rates the trip — the first genuine rating replaces the 4.9
  //    placeholder on the driver's live average.
  await rider.mutation(api.ratings.rateDriver, {
    rideId,
    rating: 5,
    comment: "Smooth silent ride!",
  });
  const ratings = await rider.query(api.ratings.myRatings, {});
  expect(ratings).toHaveLength(1);
  expect(ratings[0]).toMatchObject({
    rideId,
    rating: 5,
    comment: "Smooth silent ride!",
  });
  const rated = await rider.query(api.drivers.getDriver, { userId: driverId });
  expect(rated?.rating).toBe(5);
  expect(rated?.ratingCount).toBe(1);
});

test("payment is gated until the trip completes (and only the rider pays)", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });

  // Not completed yet → no settlement.
  await expect(
    rider.mutation(api.rides.payRide, { rideId, method: "upi" }),
  ).rejects.toThrow("Payment is available once the trip is completed.");

  // A stranger (the driver) cannot settle someone else's ride.
  await expect(
    driver.mutation(api.rides.payRide, { rideId, method: "cash" }),
  ).rejects.toThrow("Only the rider can pay for this ride.");

  // And nobody can rate a trip that isn't finished.
  await expect(
    rider.mutation(api.ratings.rateDriver, { rideId, rating: 5 }),
  ).rejects.toThrow("Ratings open once the trip is completed.");
});

test("a completed trip is rated exactly once, with stars clamped to 1–5", async () => {
  const { rider, driver, driverId } = await setup();
  await onboardDriver(driver);
  const rideId = await completeRide(rider, driver);

  // Out-of-range input is clamped into 1–5, not rejected.
  await rider.mutation(api.ratings.rateDriver, { rideId, rating: 7 });
  const ratings = await rider.query(api.ratings.myRatings, {});
  expect(ratings).toHaveLength(1);
  expect(ratings[0].rating).toBe(5);

  // One rating per ride — a second attempt is rejected.
  await expect(
    rider.mutation(api.ratings.rateDriver, { rideId, rating: 3 }),
  ).rejects.toThrow("You've already rated this trip.");

  const rated = await rider.query(api.drivers.getDriver, { userId: driverId });
  expect(rated?.rating).toBe(5);
  expect(rated?.ratingCount).toBe(1);
});
