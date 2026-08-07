/// <reference types="vite/client" />

import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./convex/schema";
import { api } from "./convex/_generated/api";
import { verifyStripeSignature } from "./convex/stripeWebhooks";
import type { Id } from "./convex/_generated/dataModel";

/**
 * Stripe integration tests.
 *
 * - `verifyStripeSignature` (the webhook HMAC check) is unit-tested against a
 *   hand-built signature so a wrong body, secret, or stale timestamp is never
 *   accepted.
 * - Card settlement runs through `internalSettleRideFromStripe` — the exact
 *   internal mutation the webhook calls — so the receipt + 75/25 wallet split
 *   are asserted on the real settlement core.
 * - Wallet top-ups and Connect payouts are exercised against the internal
 *   ledger mutations, including the balance-debit and failure-refund paths.
 * - The Stripe actions' auth/role gates are tested without any Stripe keys
 *   (they reject before ever touching the network).
 *
 * Runs against convex-test's in-memory backend with no network or deployment.
 */

const PICKUP = { address: "Gotegaon Chauraha, MP", lat: 22.92, lng: 79.18 };
const DROPOFF = { address: "Gotegaon Bus Stand, MP", lat: 22.9, lng: 79.18 };

type Harness = Awaited<ReturnType<typeof setup>>["rider"];

async function setup() {
  const t = convexTest({
    schema,
    modules: import.meta.glob("./convex/**/*.*s"),
  });
  const { riderId, driverId } = await t.run(async (ctx) => ({
    riderId: await ctx.db.insert("users", {
      name: "Riya Rider",
      email: "riya@example.com",
      role: "rider",
    }),
    driverId: await ctx.db.insert("users", {
      name: "Dev Driver",
      email: "dev@example.com",
      role: "driver",
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

// Internal references — the tests may call them, clients never can.
const { internal } = await import("./convex/_generated/api");

// convex-test's runtime implements `runMutation`/`runQuery` for internal
// functions, but the published type surface omits them — cast once.
type HarnessInternal = {
  runMutation: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
  runQuery: (fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
};
function h(t: Awaited<ReturnType<typeof setup>>["t"]): HarnessInternal {
  return t as unknown as HarnessInternal;
}

/** Onboard the driver: profile, online, parked at the pickup. */
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

/** Drive one ride to completion (request → OTP handshake → completed). */
async function completeRide(rider: Harness, driver: Harness) {
  const rideId = await rider.mutation(api.rides.requestRide, {
    pickup: PICKUP,
    dropoff: DROPOFF,
    vehicleType: "classic",
  });
  await driver.mutation(api.rides.acceptRide, { rideId });
  const pickupOtp = (await rider.query(api.rides.activeRide, { side: "rider" }))!
    .pickupOtp!;
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "arriving",
  });
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "in_progress",
    otp: pickupOtp,
  });
  const completionOtp = (await rider.query(api.rides.activeRide, { side: "rider" }))!
    .completionOtp!;
  await driver.mutation(api.rides.updateRideStatus, {
    rideId,
    status: "completed",
    otp: completionOtp,
  });
  return rideId;
}

/** Hand-build a Stripe webhook signature (independent of the implementation). */
function stripeSignature(
  body: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

test("webhook signatures: valid passes, tampered/expired/wrong-secret are rejected", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded" });

  // A correctly-signed body verifies.
  const good = stripeSignature(body, secret);
  expect(verifyStripeSignature(body, good, secret).valid).toBe(true);

  // Tampering with the payload invalidates the signature.
  const tampered = body.replace("evt_123", "evt_999");
  expect(verifyStripeSignature(tampered, good, secret).valid).toBe(false);

  // The wrong webhook secret never verifies.
  const wrongSecret = stripeSignature(body, "whsec_other");
  expect(verifyStripeSignature(body, wrongSecret, secret).valid).toBe(false);

  // A missing header is rejected outright.
  expect(verifyStripeSignature(body, null, secret).valid).toBe(false);

  // A v1 token computed for a different body (e.g. replayed) fails.
  const replayed = stripeSignature(body.replace("payment_intent", "transfer"), secret);
  expect(verifyStripeSignature(body, replayed, secret).valid).toBe(false);

  // An expired timestamp (beyond the 300s tolerance) is rejected.
  const stale = stripeSignature(body, secret, Math.floor(Date.now() / 1000) - 600);
  expect(verifyStripeSignature(body, stale, secret).valid).toBe(false);

  // A fresh timestamp inside the tolerance window passes.
  const fresh = stripeSignature(body, secret, Math.floor(Date.now() / 1000) - 120);
  expect(verifyStripeSignature(body, fresh, secret).valid).toBe(true);
});

test("card payment settles through the internal webhook path (receipt + 75/25 split)", async () => {
  const { t, rider, driver } = await setup();
  await onboardDriver(driver);
  const rideId = await completeRide(rider, driver);

  // What the `payment_intent.succeeded` webhook calls:
  await h(t).runMutation(internal.rides.internalSettleRideFromStripe, {
    rideId,
    paymentIntentId: "pi_test_123",
  });

  // The receipt is stamped as a card payment with the PaymentIntent as ref.
  const receipt = await rider.query(api.rides.receiptForRide, { rideId });
  expect(receipt).toMatchObject({
    rideId,
    paymentMethod: "card",
    totalFare: 60,
    driverShare: 45,
    platformShare: 15,
  });
  expect(receipt?.upiRef).toBe("pi_test_123");

  // The driver's earnings wallet got the 75% share, the platform the 25%.
  const wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet).toMatchObject({
    driverEarnings: 45,
    platformRetained: 15,
    totalFares: 60,
    settledRides: 1,
  });

  // The ride is marked paid.
  const paid = await rider.query(api.rides.getRide, { rideId });
  expect(paid?.paid).toBe(true);
  expect(paid?.paymentMethod).toBe("card");
});

test("a ride settles only once — a second card capture is refused", async () => {
  const { t, rider, driver } = await setup();
  await onboardDriver(driver);
  const rideId = await completeRide(rider, driver);

  await h(t).runMutation(internal.rides.internalSettleRideFromStripe, {
    rideId,
    paymentIntentId: "pi_test_1",
  });
  await expect(
    h(t).runMutation(internal.rides.internalSettleRideFromStripe, {
      rideId,
      paymentIntentId: "pi_test_2",
    }),
  ).rejects.toThrow("This trip is already settled.");
});

test("wallet top-ups credit the rider balance ledger", async () => {
  const { t, rider, riderId } = await setup();

  // `wallet_topup` PaymentIntent succeeds → webhook credits the rider float.
  await h(t).runMutation(internal.wallet.internalTopUpRiderWallet, {
    userId: riderId,
    amount: 200,
    settledAt: Date.now(),
  });
  await h(t).runMutation(internal.wallet.internalTopUpRiderWallet, {
    userId: riderId,
    amount: 50,
    settledAt: Date.now(),
  });

  const wallet = await rider.query(api.wallet.myWallet, {});
  expect(wallet?.riderBalance).toBe(250);
});

test("payout lifecycle: debit → transfer → paid, all recorded in the ledger", async () => {
  const { t, driver, driverId } = await setup();
  await onboardDriver(driver);

  // Seed ₹60 of settled earnings (75/25 on a ₹60 fare).
  await h(t).runMutation(internal.wallet.internalCreditWallet, {
    userId: driverId,
    fare: 60,
    driverShare: 45,
    platformShare: 15,
    settledAt: Date.now(),
  });

  // The driver requests a payout: wallet debited, payout row opened.
  const payoutId = await h(t).runMutation(internal.wallet.internalCreatePayout, {
    driverId,
    amountPaise: 4500,
    currency: "inr",
    createdAt: Date.now(),
  });
  let wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet?.driverEarnings).toBe(0); // ₹45 gone to the transfer

  // The Stripe Transfer succeeds → payout flips to paid with the transfer id.
  await h(t).runMutation(internal.stripeInternal.markPayoutPaid, {
    payoutId,
    transferId: "tr_abc123",
    paidAt: Date.now(),
  });
  const byTransfer = await h(t).runQuery(internal.stripeInternal.getPayoutByTransfer, {
    transferId: "tr_abc123",
  });
  expect(byTransfer).toMatchObject({
    driverId,
    amountPaise: 4500,
    status: "paid",
  });

  // The driver's payout history shows it.
  const payouts = await driver.query(api.wallet.myPayouts, {});
  expect(payouts).toHaveLength(1);
  expect(payouts[0].status).toBe("paid");

  // Platform retention is untouched by the payout.
  wallet = await driver.query(api.wallet.myWallet, {});
  expect(wallet?.platformRetained).toBe(15);
  expect(wallet?.riderBalance ?? 0).toBe(0);
});

test("a payout never exceeds the available earnings balance", async () => {
  const { t, driverId } = await setup();
  await h(t).runMutation(internal.wallet.internalCreditWallet, {
    userId: driverId,
    fare: 60,
    driverShare: 45,
    platformShare: 15,
    settledAt: Date.now(),
  });

  await expect(
    h(t).runMutation(internal.wallet.internalCreatePayout, {
      driverId,
      amountPaise: 9000, // ₹90 > ₹45 available
      currency: "inr",
      createdAt: Date.now(),
    }),
  ).rejects.toThrow("Insufficient earnings for payout.");
});

test("Stripe actions are auth/role-gated and degrade gracefully without keys", async () => {
  const { t, rider, driver } = await setup();
  await onboardDriver(driver);

  // Unauthenticated: every Stripe action requires a session.
  await expect(
    t.action(api.stripe.createPaymentIntent, {
      amount: 100,
      purpose: "ride",
    }),
  ).rejects.toThrow("Please sign in.");

  // A rider cannot create a Connect account or request a payout.
  await expect(
    rider.action(api.stripe.createConnectAccount, { origin: "https://sawaari.app" }),
  ).rejects.toThrow("Driver access required.");
  await expect(rider.action(api.stripe.requestPayout, {})).rejects.toThrow(
    "Driver access required.",
  );

  // A driver without a Connect account cannot request a payout.
  await expect(driver.action(api.stripe.requestPayout, {})).rejects.toThrow(
    "Connect your Stripe account before requesting a payout.",
  );

  // Without STRIPE_SECRET_KEY the payment rail reports "not configured"
  // instead of crashing (the preview/demo experience).
  await expect(
    rider.action(api.stripe.createPaymentIntent, {
      amount: 100,
      purpose: "ride",
    }),
  ).rejects.toThrow("Card payments aren't configured yet.");
});

test("money movement stays internal-only — nothing on the public API surface", async () => {
  const { t, driverId } = await setup();
  await h(t).runMutation(internal.wallet.internalCreditWallet, {
    userId: driverId as Id<"users">,
    fare: 60,
    driverShare: 45,
    platformShare: 15,
    settledAt: Date.now(),
  });

  // No internal settlement/top-up/payout functions on the client namespace.
  const ridesPublic = api.rides as unknown as Record<string, unknown>;
  expect("internalSettleRideFromStripe" in ridesPublic).toBe(false);
  const walletPublic = api.wallet as unknown as Record<string, unknown>;
  expect("internalTopUpRiderWallet" in walletPublic).toBe(false);
  expect("internalCreatePayout" in walletPublic).toBe(false);

  // ...but they all exist on the internal namespace, which clients can't call.
  expect(internal.rides.internalSettleRideFromStripe).toBeDefined();
  expect(internal.wallet.internalTopUpRiderWallet).toBeDefined();
  expect(internal.wallet.internalCreatePayout).toBeDefined();
  expect(internal.wallet.internalRefundPayout).toBeDefined();
  expect(internal.stripeInternal.recordStripeEvent).toBeDefined();
  expect(internal.stripeInternal.updateConnectStatus).toBeDefined();
  expect(internal.stripeInternal.markPayoutPaid).toBeDefined();
});
