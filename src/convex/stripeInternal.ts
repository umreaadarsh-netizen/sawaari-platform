import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * INTERNAL-ONLY Stripe plumbing. Nothing here is exposed on the public `api`
 * namespace: the webhook route (`http.ts`) and the Stripe node actions call
 * these functions with `ctx.runQuery` / `ctx.runMutation`, so no client
 * session can ever touch the payment ledger directly.
 */

// ---- idempotency (Stripe delivers webhooks at-least-once) -----------------

export const stripeEventExists = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const found = await ctx.db
      .query("stripeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first();
    return found !== null;
  },
});

export const recordStripeEvent = internalMutation({
  args: { eventId: v.string(), type: v.string(), processedAt: v.number() },
  handler: async (ctx, { eventId, type, processedAt }) => {
    await ctx.db.insert("stripeEvents", { eventId, type, processedAt });
  },
});

// ---- PaymentIntents ledger ------------------------------------------------

export const recordPayment = internalMutation({
  args: {
    stripePaymentIntentId: v.string(),
    userId: v.id("users"),
    purpose: v.union(v.literal("ride"), v.literal("wallet_topup")),
    rideId: v.optional(v.id("rides")),
    amountPaise: v.number(),
    currency: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("payments", { ...args, status: "created" });
  },
});

export const markPaymentSucceeded = internalMutation({
  args: { stripePaymentIntentId: v.string(), settledAt: v.number() },
  handler: async (ctx, { stripePaymentIntentId, settledAt }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_pi", (q) => q.eq("stripePaymentIntentId", stripePaymentIntentId))
      .first();
    if (!payment) return;
    await ctx.db.patch(payment._id, { status: "succeeded", settledAt });
  },
});

export const markPaymentFailed = internalMutation({
  args: { stripePaymentIntentId: v.string() },
  handler: async (ctx, { stripePaymentIntentId }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_pi", (q) => q.eq("stripePaymentIntentId", stripePaymentIntentId))
      .first();
    if (!payment) return;
    await ctx.db.patch(payment._id, { status: "failed" });
  },
});

export const getPaymentByPi = internalQuery({
  args: { stripePaymentIntentId: v.string() },
  handler: async (ctx, { stripePaymentIntentId }) => {
    return (
      (await ctx.db
        .query("payments")
        .withIndex("by_pi", (q) => q.eq("stripePaymentIntentId", stripePaymentIntentId))
        .first()) ?? null
    );
  },
});

// ---- users <-> Stripe refs ------------------------------------------------

export const getUserByStripeAccount = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("stripe_account", (q) => q.eq("stripeAccountId", accountId))
      .first();
    return (user ?? null) as Doc<"users"> | null;
  },
});

export const getUserByStripeCustomer = internalQuery({
  args: { customerId: v.string() },
  handler: async (ctx, { customerId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("stripe_customer", (q) => q.eq("stripeCustomerId", customerId))
      .first();
    return (user ?? null) as Doc<"users"> | null;
  },
});

export const storeStripeRefs = internalMutation({
  args: {
    userId: v.id("users"),
    customerId: v.optional(v.string()),
    accountId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, customerId, accountId }) => {
    const patch: Record<string, string> = {};
    if (customerId !== undefined) patch.stripeCustomerId = customerId;
    if (accountId !== undefined) patch.stripeAccountId = accountId;
    await ctx.db.patch(userId, patch);
  },
});

/** `account.updated` webhook — sync Connect capability flags onto the user. */
export const updateConnectStatus = internalMutation({
  args: {
    userId: v.id("users"),
    detailsSubmitted: v.boolean(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeDetailsSubmitted: args.detailsSubmitted,
      stripeChargesEnabled: args.chargesEnabled,
      stripePayoutsEnabled: args.payoutsEnabled,
    });
  },
});

/** `setup_intent.succeeded` — vault the confirmed card as the default. */
export const vaultPaymentMethod = internalMutation({
  args: { userId: v.id("users"), paymentMethodId: v.string() },
  handler: async (ctx, { userId, paymentMethodId }) => {
    await ctx.db.patch(userId, { stripePaymentMethodId: paymentMethodId });
  },
});

// ---- Connect transfers / payouts ------------------------------------------

export const getPayoutByTransfer = internalQuery({
  args: { transferId: v.string() },
  handler: async (ctx, { transferId }) => {
    return (
      (await ctx.db
        .query("payouts")
        .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
        .first()) ?? null
    );
  },
});

export const markPayoutFailed = internalMutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    await ctx.db.patch(payoutId, { status: "failed" });
  },
});

export const markPayoutPaid = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    transferId: v.optional(v.string()),
    paidAt: v.number(),
  },
  handler: async (ctx, { payoutId, transferId, paidAt }) => {
    await ctx.db.patch(payoutId, {
      status: "paid",
      transferId: transferId ?? undefined,
      paidAt,
    });
  },
});
