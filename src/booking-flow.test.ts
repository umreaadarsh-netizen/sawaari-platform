/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./convex/schema";
import { api } from "./convex/_generated/api";
import { MATCHING_RADIUS_KM, haversineKm } from "./convex/rides";
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
// ~4.45 km south (0.04° of latitude) — a longer hop for a second, distinct fare.
const DROPOFF2 = { address: "Kundam, MP", lat: 22.88, lng: 79.18 };

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
  return { t, rider, driver, riderId, driverId };
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
  route: { pickup?: typeof PICKUP; dropoff?: typeof PICKUP } = {},
): Promise<Id<"rides">> {
  const pickup = route.pickup ?? PICKUP;
  const dropoff = route.dropoff ?? DROPOFF;
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup,
    dropoff,
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

/**
 * Latitude offset (degrees) for a pure-meridian walk from (lat, lng) that
 * makes the real haversine distance to (lat, lng) land at-or-below `km` —
 * i.e. the closest representable point on the "in" side of the boundary.
 * Binary search keeps this coupled to the production haversine (the exact
 * math `openRides` runs) instead of a hand-computed approximation.
 */
function meridianOffset(lat: number, lng: number, km: number): number {
  let lo = 0;
  let hi = 0.1; // 0.1° ≈ 11.1 km — comfortably beyond any radius we probe
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (haversineKm(lat + mid, lng, lat, lng) <= km) lo = mid;
    else hi = mid;
  }
  return lo;
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

test("rider can cancel a requested ride and book a fresh ride right away", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // Book the first ride; it sits in the `requested` pool for nearby drivers.
  const firstId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  expect((await rider.query(api.rides.getRide, { rideId: firstId }))?.status).toBe(
    "requested",
  );

  // Only one ride may be in flight per rider.
  await expect(
    rider.mutation(api.rides.requestRide, {
      pickup: PICKUP,
      dropoff: DROPOFF,
      vehicleType: "classic",
    }),
  ).rejects.toThrow("You already have an active ride.");

  // Cancel before any driver accepts.
  await rider.mutation(api.rides.cancelRide, { rideId: firstId });
  expect((await rider.query(api.rides.getRide, { rideId: firstId }))?.status).toBe(
    "cancelled",
  );
  expect(await rider.query(api.rides.activeRide, { side: "rider" })).toBeNull();

  // A cancelled ride is not active, so the rider can book again immediately.
  const secondId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  expect((await rider.query(api.rides.getRide, { rideId: secondId }))?.status).toBe(
    "requested",
  );
  expect(secondId).not.toBe(firstId);
});

test("cancellation is allowed after matching, but locked once the trip starts", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // Book → a driver accepts → `matched` (still pre-start).
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });

  // A stranger (the driver) cannot cancel on the rider's behalf.
  await expect(
    driver.mutation(api.rides.cancelRide, { rideId }),
  ).rejects.toThrow("Only the rider can cancel this ride.");

  // The rider can still cancel while matched — the trip hasn't started.
  await rider.mutation(api.rides.cancelRide, { rideId });
  expect((await rider.query(api.rides.getRide, { rideId }))?.status).toBe("cancelled");

  // ...and is free to book again, which the same driver accepts.
  const startedId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId: startedId });
  const codes = await rider.query(api.rides.activeRide, { side: "rider" });
  await driver.mutation(api.rides.updateRideStatus, {
    rideId: startedId,
    status: "arriving",
  });
  await driver.mutation(api.rides.updateRideStatus, {
    rideId: startedId,
    status: "in_progress",
    otp: codes!.pickupOtp!,
  });

  // Once the trip is on the road it can no longer be cancelled.
  await expect(
    rider.mutation(api.rides.cancelRide, { rideId: startedId }),
  ).rejects.toThrow("This ride can no longer be cancelled.");
});

test("admin ledger: platform-retained totals balance against settled receipts", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // The rider claims the workspace admin seat — the first caller wins.
  await rider.mutation(api.admin.becomeAdmin, {});
  await expect(
    driver.mutation(api.admin.becomeAdmin, {}),
  ).rejects.toThrow("This workspace already has an administrator.");

  // Non-admins are locked out of the ledger and the receipts book.
  await expect(driver.query(api.admin.adminStats, {})).rejects.toThrow(
    "Administrator access required.",
  );
  await expect(driver.query(api.admin.adminListReceipts, {})).rejects.toThrow(
    "Administrator access required.",
  );

  // Settle two trips end to end: ₹60 via UPI, ₹90 via cash.
  const ride1 = await completeRide(rider, driver);
  await rider.mutation(api.rides.payRide, { rideId: ride1, method: "upi" });
  const ride2 = await completeRide(rider, driver, { dropoff: DROPOFF2 });
  await rider.mutation(api.rides.payRide, { rideId: ride2, method: "cash" });

  // The admin dashboard ledger, derived from the receipts: 60 + 90 = 150
  // gross, driver 45 + round(0.75 × 90) = 68, platform 15 + 22 = 37.
  const stats = await rider.query(api.admin.adminStats, {});
  expect(stats).toMatchObject({
    totalRides: 2,
    activeRides: 0,
    completedRides: 2,
    paidRides: 2,
    revenue: 150,
    faresCollected: 150,
    driverPayouts: 113,
    platformRevenue: 37,
    upiRevenue: 60,
    cashRevenue: 90,
    qrRevenue: 0,
    onlineDrivers: 1,
    totalDrivers: 1,
    totalUsers: 2,
  });

  // The driver's wallet mirrors the same ledger (75% + 25% per settled fare).
  const wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet).toMatchObject({
    driverEarnings: 113,
    platformRetained: 37,
    totalFares: 150,
    settledRides: 2,
  });

  // The receipts book is the permanent record: one row per settled fare with
  // the frozen split stamped on it, gross always equal to driver + platform.
  const receipts = await rider.query(api.admin.adminListReceipts, {});
  expect(receipts).toHaveLength(2);
  expect(receipts.map((r) => r.totalFare).sort()).toEqual([60, 90]);
  expect(receipts.map((r) => r.driverShare).sort()).toEqual([45, 68]);
  expect(receipts.map((r) => r.platformShare).sort()).toEqual([15, 22]);
  expect(receipts.map((r) => r.paymentMethod).sort()).toEqual(["cash", "upi"]);
  for (const r of receipts) {
    expect(r.driverShare + r.platformShare).toBe(r.totalFare);
  }

  // The rides ledger agrees, and OTP secrets never leak into admin views.
  const all = await rider.query(api.admin.listAllRides, {});
  expect(all).toHaveLength(2);
  expect(all.every((r) => r.status === "completed")).toBe(true);
  expect(
    all.every((r) => r.pickupOtp === undefined && r.completionOtp === undefined),
  ).toBe(true);
});

test("an offline driver stops receiving ride broadcasts (and cannot accept)", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // Online and parked at the pickup → the first request reaches the driver.
  const firstId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  const before = await driver.query(api.rides.openRides, {});
  expect(before.map((r) => r._id)).toContain(firstId);

  // Free the rider and take the driver offline — still parked at the pickup.
  await rider.mutation(api.rides.cancelRide, { rideId: firstId });
  await driver.mutation(api.drivers.setOnline, { online: false });
  await driver.mutation(api.drivers.updateLocation, {
    lat: PICKUP.lat,
    lng: PICKUP.lng,
  });

  // A fresh request within the matching radius is broadcast to nobody:
  // the offline driver's personal feed is empty, even though the pickup
  // is physically right next to them.
  const secondId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  const offline = await driver.query(api.rides.openRides, {});
  expect(offline).toHaveLength(0);
  expect((await rider.query(api.rides.getRide, { rideId: secondId }))?.status).toBe(
    "requested",
  );

  // Acceptance is locked while offline, before any radius check.
  await expect(
    driver.mutation(api.rides.acceptRide, { rideId: secondId }),
  ).rejects.toThrow("Go online to accept rides.");

  // Flipping back online resumes the broadcast for the same request.
  await driver.mutation(api.drivers.setOnline, { online: true });
  const back = await driver.query(api.rides.openRides, {});
  expect(back.map((r) => r._id)).toContain(secondId);
});

test("a driver outside the 5 km matching radius never sees the request", async () => {
  const { t, rider, driver, driverId } = await setup();
  await onboardDriver(driver);
  // Park the first driver ~4.45 km from the pickup — inside the radius.
  await driver.mutation(api.drivers.updateLocation, {
    lat: PICKUP.lat + 0.04,
    lng: PICKUP.lng,
  });

  // A second, online driver ~6.67 km away — just outside the 5 km radius.
  const farDriverId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Far Driver",
      email: "far@example.com",
      role: "user",
    }),
  );
  const farDriver = t.withIdentity({
    subject: `${farDriverId}|far-session`,
    name: "Far Driver",
    email: "far@example.com",
  });
  await farDriver.mutation(api.drivers.saveProfile, {
    name: "Far Driver",
    vehicleNo: "MP42EV9999",
  });
  await farDriver.mutation(api.drivers.setOnline, { online: true });
  await farDriver.mutation(api.drivers.updateLocation, {
    lat: PICKUP.lat + 0.06,
    lng: PICKUP.lng,
  });

  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });

  // The in-radius driver's broadcast carries the request; the far driver's
  // personal feed is filtered out entirely.
  const near = await driver.query(api.rides.openRides, {});
  expect(near.map((r) => r._id)).toContain(rideId);
  const far = await farDriver.query(api.rides.openRides, {});
  expect(far).toHaveLength(0);

  // Defense in depth: accepting outside the radius is rejected too.
  await expect(
    farDriver.mutation(api.rides.acceptRide, { rideId }),
  ).rejects.toThrow("This pickup is outside your 5 km matching radius.");

  // The in-radius driver accepts normally.
  await driver.mutation(api.rides.acceptRide, { rideId });
  const matched = await rider.query(api.rides.getRide, { rideId });
  expect(matched?.status).toBe("matched");
  expect(matched?.driverId).toBe(driverId);
});

test("the 5 km matching radius is inclusive: 5.0 km is broadcast, 5.01 km is not", async () => {
  const { t, rider, driver, driverId } = await setup();
  await onboardDriver(driver);

  // Park the first driver precisely ON the boundary: the largest latitude
  // whose real haversine distance to the pickup is still ≤ 5 km — the
  // closest representable point at-or-below the radius.
  const insideLat =
    PICKUP.lat + meridianOffset(PICKUP.lat, PICKUP.lng, MATCHING_RADIUS_KM);
  await driver.mutation(api.drivers.updateLocation, {
    lat: insideLat,
    lng: PICKUP.lng,
  });
  const insideDist = haversineKm(insideLat, PICKUP.lng, PICKUP.lat, PICKUP.lng);
  expect(insideDist).toBeLessThanOrEqual(MATCHING_RADIUS_KM);
  expect(insideDist).toBeCloseTo(MATCHING_RADIUS_KM, 9); // 4.999999999999912

  // A second, online driver at exactly 5.01 km — 10 m past the boundary.
  const outsideLat = PICKUP.lat + meridianOffset(PICKUP.lat, PICKUP.lng, 5.01);
  const outsideDist = haversineKm(outsideLat, PICKUP.lng, PICKUP.lat, PICKUP.lng);
  expect(outsideDist).toBeGreaterThan(MATCHING_RADIUS_KM);
  expect(outsideDist).toBeCloseTo(5.01, 9); // 5.00999999999986
  const outsideId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Boundary Driver",
      email: "boundary@example.com",
      role: "user",
    }),
  );
  const outside = t.withIdentity({
    subject: `${outsideId}|boundary-session`,
    name: "Boundary Driver",
    email: "boundary@example.com",
  });
  await outside.mutation(api.drivers.saveProfile, {
    name: "Boundary Driver",
    vehicleNo: "MP42EV8888",
  });
  await outside.mutation(api.drivers.setOnline, { online: true });
  await outside.mutation(api.drivers.updateLocation, {
    lat: outsideLat,
    lng: PICKUP.lng,
  });

  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });

  // The boundary driver's feed carries the request — the radius check is
  // `<=`, so a driver at precisely 5.0 km is broadcast to...
  const boundaryFeed = await driver.query(api.rides.openRides, {});
  expect(boundaryFeed.map((r) => r._id)).toContain(rideId);
  // ...and the driver at 5.01 km is filtered out entirely.
  const outsideFeed = await outside.query(api.rides.openRides, {});
  expect(outsideFeed).toHaveLength(0);

  // Acceptance mirrors the broadcast: 5.01 km is rejected at the gate,
  // while the driver standing on the boundary accepts normally.
  await expect(
    outside.mutation(api.rides.acceptRide, { rideId }),
  ).rejects.toThrow("This pickup is outside your 5 km matching radius.");
  await driver.mutation(api.rides.acceptRide, { rideId });
  const matched = await rider.query(api.rides.getRide, { rideId });
  expect(matched?.status).toBe("matched");
  expect(matched?.driverId).toBe(driverId);
});
