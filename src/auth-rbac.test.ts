/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./convex/schema";
import { api } from "./convex/_generated/api";

/**
 * Authentication & authorization end-to-end tests.
 *
 * Exercises the real hardened guards in `src/convex/`:
 *  - `users.requireUser` / `users.requireRole` (identity + role validation)
 *  - role grants on onboarding (saveProfile → driver, first booking → rider)
 *  - driver-only vs rider-only vs admin-only function gating
 *  - money settlement living behind an internal mutation, never on `api`
 *
 * Runs against convex-test's in-memory backend with no network or deployment.
 */

const PICKUP = { address: "Gotegaon Chauraha, MP", lat: 22.92, lng: 79.18 };
const DROPOFF = { address: "Gotegaon Bus Stand, MP", lat: 22.9, lng: 79.18 };

async function setup() {
  const t = convexTest({
    schema,
    modules: import.meta.glob("./convex/**/*.*s"),
  });
  const { riderId, driverId } = await t.run(async (ctx) => ({
    riderId: await ctx.db.insert("users", {
      name: "Riya Rider",
      email: "riya@example.com",
      role: "user",
    }),
    driverId: await ctx.db.insert("users", {
      name: "Dev Driver",
      email: "dev@example.com",
      role: "user",
    }),
  }));
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

/** Onboard a driver: profile (grants the role), go online, park at pickup. */
async function onboardDriver(driver: Awaited<ReturnType<typeof setup>>["driver"]) {
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

test("unauthenticated calls are rejected on every guarded function", async () => {
  const { t } = await setup();
  // Seed real rows so Convex's id-validators pass and it is the auth gates
  // (never the arg validators) that reject the anonymous calls.
  const { rideId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Seed",
      email: "seed@example.com",
    });
    const rideId = await ctx.db.insert("rides", {
      riderId: userId,
      status: "requested",
      pickup: PICKUP,
      dropoff: DROPOFF,
      fare: 60,
      distanceKm: 2.22,
      vehicleType: "classic",
      paid: false,
      riderName: "Seed",
      createdAt: Date.now(),
    });
    return { rideId, userId };
  });

  const guardedMutations = [
    () =>
      t.mutation(api.rides.requestRide, {
        pickup: PICKUP,
        dropoff: DROPOFF,
        vehicleType: "classic",
      }),
    () => t.mutation(api.rides.acceptRide, { rideId }),
    () => t.mutation(api.rides.payRide, { rideId, method: "upi" }),
    () => t.mutation(api.rides.cancelRide, { rideId }),
    () => t.mutation(api.rides.updateRideStatus, { rideId, status: "arriving" }),
    () => t.mutation(api.rides.sendMessage, { rideId, body: "hi" }),
    () => t.mutation(api.drivers.saveProfile, { name: "X", vehicleNo: "MP42EV0001" }),
    () => t.mutation(api.drivers.setOnline, { online: true }),
    () => t.mutation(api.drivers.updateLocation, { lat: 22.9, lng: 79.18 }),
    () => t.mutation(api.ratings.rateDriver, { rideId, rating: 5 }),
    () => t.mutation(api.admin.becomeAdmin, {}),
    () => t.mutation(api.admin.setUserRole, { userId, role: "admin" }),
    () => t.mutation(api.admin.adminCancelRide, { rideId }),
    () =>
      t.mutation(api.fleet.saveFleetVehicle, {
        id: "classic",
        name: "X",
        tagline: "X",
        seats: 3,
        baseFare: 30,
        perKm: 14,
        minFare: 35,
        enabled: true,
        sort: 1,
      }),
    () => t.mutation(api.fleet.setVehicleEnabled, { id: "classic", enabled: true }),
  ];

  for (const call of guardedMutations) {
    await expect(call()).rejects.toThrow("Please sign in.");
  }

  const guardedQueries = [
    () => t.query(api.admin.adminStats, {}),
    () => t.query(api.admin.listAllRides, {}),
    () => t.query(api.admin.adminListReceipts, {}),
  ];
  for (const call of guardedQueries) {
    await expect(call()).rejects.toThrow("Please sign in.");
  }
});

test("onboarding grants roles: driver profile -> driver, first booking -> rider", async () => {
  const { t, rider, driver } = await setup();

  // Creating a driver profile is the driver on-ramp: it grants the role.
  await driver.mutation(api.drivers.saveProfile, {
    name: "Dev Driver",
    vehicleNo: "MP42EV1234",
  });
  const driverUser = await driver.query(api.users.currentUser, {});
  expect(driverUser?.role).toBe("driver");

  // A brand-new account (no role yet) becomes a rider on their first booking.
  const freshId = await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "Fresh", email: "fresh@example.com" }),
  );
  const fresh = t.withIdentity({
    subject: `${freshId}|fresh-session`,
    name: "Fresh",
    email: "fresh@example.com",
  });
  await fresh.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  const freshUser = await fresh.query(api.users.currentUser, {});
  expect(freshUser?.role).toBe("rider");

  // Existing roles are never overwritten by onboarding (an admin who also
  // drives stays admin).
  const riderUser = await rider.query(api.users.currentUser, {});
  expect(riderUser?.role).toBe("user");
});

test("a rider cannot execute driver actions", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // No driver profile → every driver action is locked before any state change.
  await expect(
    rider.mutation(api.drivers.setOnline, { online: true }),
  ).rejects.toThrow("Create a driver profile first.");

  // A rider's broadcast feed is empty — they are not a driver.
  expect(await rider.query(api.rides.openRides, {})).toHaveLength(0);

  // Book a ride as the rider, then try to act on it as a driver would.
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await expect(
    rider.mutation(api.rides.acceptRide, { rideId }),
  ).rejects.toThrow("Create a driver profile first.");
  await expect(
    rider.mutation(api.rides.updateRideStatus, { rideId, status: "arriving" }),
  ).rejects.toThrow("Driver access required.");
});

test("a driver cannot settle, rate, or cancel the rider's ride", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });

  // The driver's own broadcasts still work, but rider-only actions on the
  // same ride are ownership-gated — even before the trip completes.
  await expect(
    driver.mutation(api.rides.cancelRide, { rideId }),
  ).rejects.toThrow("Only the rider can cancel this ride.");
  await expect(
    driver.mutation(api.rides.payRide, { rideId, method: "upi" }),
  ).rejects.toThrow("Only the rider can pay for this ride.");
  await expect(
    driver.mutation(api.ratings.rateDriver, { rideId, rating: 5 }),
  ).rejects.toThrow("Only the rider who took this trip can rate it.");

  // The driver's wallet stays untouched by these attempts.
  expect(await driver.query(api.wallet.myWallet, {})).toBeNull();
});

test("the admin surface is locked to admins — and becomeAdmin unlocks it", async () => {
  const { rider, driver, driverId } = await setup();

  // Non-admins are rejected everywhere, with the exact same gate message.
  await expect(rider.query(api.admin.adminStats, {})).rejects.toThrow(
    "Administrator access required.",
  );
  await expect(driver.query(api.admin.listAllRides, {})).rejects.toThrow(
    "Administrator access required.",
  );
  await expect(
    rider.mutation(api.admin.setUserRole, { userId: driverId, role: "driver" }),
  ).rejects.toThrow("Administrator access required.");
  // Seed a real ride so the id-validator passes and the admin gate rejects.
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await expect(
    rider.mutation(api.admin.adminCancelRide, { rideId }),
  ).rejects.toThrow("Administrator access required.");
  await expect(
    rider.mutation(api.fleet.saveFleetVehicle, {
      id: "classic",
      name: "X",
      tagline: "X",
      seats: 3,
      baseFare: 30,
      perKm: 14,
      minFare: 35,
      enabled: true,
      sort: 1,
    }),
  ).rejects.toThrow("Administrator access required.");

  // The first caller to becomeAdmin is granted the role and unlocks the area.
  await rider.mutation(api.admin.becomeAdmin, {});
  const stats = await rider.query(api.admin.adminStats, {});
  expect(stats.totalUsers).toBe(2);

  // Admins can now assign the driver role to others (RBAC administration).
  await rider.mutation(api.admin.setUserRole, { userId: driverId, role: "driver" });
  const driverUser = await driver.query(api.users.currentUser, {});
  expect(driverUser?.role).toBe("driver");

  // A second caller is refused — the seat is taken.
  await expect(driver.mutation(api.admin.becomeAdmin, {})).rejects.toThrow(
    "This workspace already has an administrator.",
  );
});

test("money settlement is internal-only — never exposed on the public API", async () => {
  const { rider, driver } = await setup();
  await onboardDriver(driver);

  // The settlement crediting mutation does not exist on the client namespace.
  const publicWallet = api.wallet as unknown as Record<string, unknown>;
  expect("internalCreditWallet" in publicWallet).toBe(false);

  // ...but it exists on the internal namespace, which clients cannot call.
  const { internal } = await import("./convex/_generated/api");
  expect(internal.wallet.internalCreditWallet).toBeDefined();

  // Sanity: settlement still flows end-to-end through the public payRide gate.
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });
  const pickupOtp = (
    await rider.query(api.rides.activeRide, { side: "rider" })
  )!.pickupOtp!;
  await driver.mutation(api.rides.updateRideStatus, { rideId, status: "arriving" });
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
  await rider.mutation(api.rides.payRide, { rideId, method: "upi" });

  const wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet?.settledRides).toBe(1);
  expect(wallet?.totalFares).toBeGreaterThan(0);
});
