"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireRoleAction, requireUserAction } from "./users";
import Stripe from "stripe";

/**
 * Sawaari's Stripe rail.
 *
 * - Riders pay trip fares (and can pre-pay a wallet float) with card
 *   PaymentIntents created here; `payment_intent.succeeded` webhooks settle
 *   the ride / credit the wallet through internal mutations.
 * - Drivers get a Stripe Connect Express account for payouts; the platform
 *   pushes their 75% earnings out as Transfers (`requestPayout`), and
 *   `account.updated` webhooks sync onboarding status back to the users row.
 *
 * The client is built lazily so the module imports cleanly in the demo
 * preview where no STRIPE_SECRET_KEY is configured — every action surfaces a
 * clear "not configured" error instead of crashing the bundle.
 */

const MIN_AMOUNT_PAISE = 5000; // ₹50 — Stripe's minimum card charge in INR

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY in the Keys tab.");
  }
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

/** Whether Stripe is configured + the publishable key for the client SDK. */
export const getStripeKeys = action({
  args: {},
  handler: async () => {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      enabled: Boolean(process.env.STRIPE_SECRET_KEY),
    };
  },
});

/**
 * Create a PaymentIntent for a ride fare or a wallet top-up. Returns the
 * client secret the Stripe PaymentElement confirms on the rider's screen;
 * settlement happens server-side on `payment_intent.succeeded`.
 */
export const createPaymentIntent = action({
  args: {
    amount: v.number(), // whole ₹ (the fare or the top-up amount)
    purpose: v.union(v.literal("ride"), v.literal("wallet_topup")),
    rideId: v.optional(v.id("rides")),
  },
  handler: async (ctx, { amount, purpose, rideId }) => {
    const user = await requireUserAction(ctx);
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Card payments aren't configured yet.");
    }
    const amountPaise = Math.round(amount * 100);
    if (amountPaise < MIN_AMOUNT_PAISE) {
      throw new Error("The minimum Stripe payment is ₹50.");
    }

    // Ride intents must target the caller's own completed, unpaid ride — the
    // same gates `payRide` enforces, so the card rail can't undercut them.
    if (purpose === "ride") {
      if (!rideId) throw new Error("rideId is required for ride payments.");
      const ride = await ctx.runQuery(api.rides.getRide, { rideId });
      if (!ride) throw new Error("Ride not found.");
      if (ride.riderId !== user._id) {
        throw new Error("Only the rider can pay for this ride.");
      }
      if (ride.status !== "completed") {
        throw new Error("Payment is available once the trip is completed.");
      }
      if (ride.paid) throw new Error("This trip is already settled.");
    }

    const stripe = getStripe();

    // Lazy customer vault: one Customer per user, reused for saved payment
    // methods and future off-session charges.
    let customerId = user.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        metadata: { userId: user._id },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.stripeInternal.storeStripeRefs, {
        userId: user._id,
        customerId,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPaise,
      currency: "inr",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: user._id,
        purpose,
        rideId: rideId ?? "",
      },
    });

    // Track the intent from birth so the webhook can settle idempotently.
    await ctx.runMutation(internal.stripeInternal.recordPayment, {
      stripePaymentIntentId: paymentIntent.id,
      userId: user._id,
      purpose,
      rideId,
      amountPaise,
      currency: "inr",
      createdAt: Date.now(),
    });

    return {
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      paymentIntentId: paymentIntent.id,
    };
  },
});

/**
 * Create a SetupIntent so a rider can vault a card for one-click fare
 * payment. On `setup_intent.succeeded` the webhook stores the payment method
 * id on the user; subsequent PaymentIntents charge it off-session.
 */
export const createSetupIntent = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserAction(ctx);
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Card payments aren't configured yet.");
    }
    const stripe = getStripe();

    let customerId = user.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        metadata: { userId: user._id },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.stripeInternal.storeStripeRefs, {
        userId: user._id,
        customerId,
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    return {
      clientSecret: setupIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    };
  },
});

/**
 * Create (or fetch) the driver's Stripe Connect Express account and mint an
 * onboarding link. The driver completes KYC on Stripe's hosted flow; status
 * syncs back via `account.updated` webhooks.
 */
export const createConnectAccount = action({
  args: { origin: v.string() },
  handler: async (ctx, { origin }) => {
    const user = await requireRoleAction(ctx, "driver", "Driver access required.");
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe payouts aren't configured yet.");
    }
    const stripe = getStripe();

    let accountId = user.stripeAccountId ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "IN",
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { userId: user._id },
      });
      accountId = account.id;
      await ctx.runMutation(internal.stripeInternal.storeStripeRefs, {
        userId: user._id,
        accountId,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/app/driver`,
      return_url: `${origin}/app/driver?payout=return`,
    });

    return { url: accountLink.url, accountId };
  },
});

/** Re-mint an onboarding link for a driver who already has an account. */
export const getConnectAccountLink = action({
  args: { origin: v.string() },
  handler: async (ctx, { origin }) => {
    const user = await requireRoleAction(ctx, "driver", "Driver access required.");
    if (!user.stripeAccountId) {
      throw new Error("No Stripe account on file yet — start onboarding first.");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe payouts aren't configured yet.");
    }
    const stripe = getStripe();
    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      type: "account_onboarding",
      refresh_url: `${origin}/app/driver`,
      return_url: `${origin}/app/driver?payout=return`,
    });
    return { url: accountLink.url, accountId: user.stripeAccountId };
  },
});

/**
 * Withdraw the driver's full 75% earnings balance to their connected bank
 * via a Stripe Connect Transfer. The wallet debit and payout record happen in
 * one internal mutation; if the Transfer fails the debit is reversed so money
 * is never lost silently.
 */
export const requestPayout = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireRoleAction(ctx, "driver", "Driver access required.");
    if (!user.stripeAccountId) {
      throw new Error("Connect your Stripe account before requesting a payout.");
    }
    if (!user.stripePayoutsEnabled) {
      throw new Error("Your payout account isn't ready yet — finish Stripe onboarding first.");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe payouts aren't configured yet.");
    }

    const wallet = await ctx.runQuery(api.wallet.myWallet, {});
    const balance = wallet?.driverEarnings ?? 0;
    const amountPaise = Math.round(balance * 100);
    if (amountPaise < MIN_AMOUNT_PAISE) {
      throw new Error("You need at least ₹50 in earnings to withdraw.");
    }

    const stripe = getStripe();
    const createdAt = Date.now();

    // 1. Atomically debit the wallet and open a `pending` payout row.
    const payoutId = await ctx.runMutation(internal.wallet.internalCreatePayout, {
      driverId: user._id,
      amountPaise,
      currency: "inr",
      createdAt,
    });

    // 2. Move the money to the driver's Connect balance (which auto-pays out
    //    to their bank on Stripe's payout schedule).
    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: amountPaise,
        currency: "inr",
        destination: user.stripeAccountId,
        metadata: { userId: user._id, payoutId },
      });
    } catch (err) {
      // Reverse the debit — a failed transfer must never eat driver earnings.
      await ctx.runMutation(internal.stripeInternal.markPayoutFailed, { payoutId });
      await ctx.runMutation(internal.wallet.internalRefundPayout, {
        driverId: user._id,
        amount: Math.round(amountPaise / 100),
        settledAt: Date.now(),
      });
      throw new Error(err instanceof Error ? err.message : "Transfer failed.");
    }

    await ctx.runMutation(internal.stripeInternal.markPayoutPaid, {
      payoutId,
      transferId: transfer.id,
      paidAt: Date.now(),
    });

    return { transferId: transfer.id, amountPaise };
  },
});
