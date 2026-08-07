"use node";

import { createHmac, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Stripe webhook signature verification — a dependency-free port of the
 * algorithm the Stripe SDK runs inside `constructEvent`, so the exact same
 * code is unit-tested in vitest and used here. Stripe signs the raw request
 * body as:
 *
 *   v1 = HMAC-SHA256(STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)
 *
 * The header is `t=<timestamp>,v1=<hex>`; a signature is accepted only when
 * every v1 token matches (constant-time compare) and the timestamp is within
 * the tolerance window (default 300s, matching Stripe's docs).
 */
export interface StripeSignatureCheck {
  valid: boolean;
  timestamp: number;
  reason: string;
}

export function verifyStripeSignature(
  body: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 300,
): StripeSignatureCheck {
  if (!signatureHeader) {
    return { valid: false, timestamp: 0, reason: "Missing stripe-signature header" };
  }

  const pairs = new Map<string, string>();
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    pairs.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }

  const timestampRaw = pairs.get("t");
  if (!timestampRaw || !/^\d+$/.test(timestampRaw)) {
    return { valid: false, timestamp: 0, reason: "Missing or malformed timestamp" };
  }
  const timestamp = Number(timestampRaw);

  const signedPayload = `${timestamp}.${body}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest();

  const v1 = pairs.get("v1");
  if (!v1) {
    return { valid: false, timestamp, reason: "No v1 signature present" };
  }

  let received: Buffer;
  try {
    received = Buffer.from(v1, "hex");
  } catch {
    return { valid: false, timestamp, reason: "Malformed v1 signature" };
  }

  // Constant-time compare (length-safe) — never leak partial-match timing.
  const a = received.length === expected.length ? received : Buffer.alloc(expected.length);
  if (!timingSafeEqual(a, expected)) {
    return { valid: false, timestamp, reason: "Signature mismatch" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, timestamp, reason: "Timestamp outside tolerance window" };
  }

  return { valid: true, timestamp, reason: "ok" };
}

/**
 * Stripe webhook processor — runs in the Node runtime so it can read
 * STRIPE_WEBHOOK_SECRET and verify the HMAC signature. The http route in
 * `http.ts` (V8 runtime) delegates here via `ctx.runAction`. Every event id
 * is recorded in `stripeEvents` so at-least-once redeliveries are no-ops,
 * and all state changes happen through internal mutations — never public
 * functions.
 */
export const handleWebhook = action({
  args: {
    body: v.string(),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, { body, signature }) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return { status: 503, body: "Webhooks are not configured." };
    }

    const check = verifyStripeSignature(body, signature, webhookSecret);
    if (!check.valid) {
      return { status: 400, body: `Invalid signature: ${check.reason}` };
    }

    let event: { id?: unknown; type?: unknown; data?: unknown };
    try {
      event = JSON.parse(body);
    } catch {
      return { status: 400, body: "Malformed payload." };
    }
    if (typeof event.id !== "string" || typeof event.type !== "string") {
      return { status: 400, body: "Malformed event." };
    }

    // Idempotency: skip events already processed (Stripe retries on 5xx /
    // timeouts, so every handler must be safe to run twice).
    const seen = await ctx.runQuery(internal.stripeInternal.stripeEventExists, {
      eventId: event.id,
    });
    if (seen) {
      return { status: 200, body: "Already processed." };
    }

    const data = (event.data ?? {}) as { object?: Record<string, unknown> };
    const object = data.object ?? {};

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = object as {
            id?: string;
            amount?: number;
            metadata?: Record<string, string>;
          };
          const metadata = pi.metadata ?? {};
          if (metadata.purpose === "wallet_topup") {
            if (metadata.userId) {
              await ctx.runMutation(internal.wallet.internalTopUpRiderWallet, {
                userId: metadata.userId as never,
                amount: Math.round((pi.amount ?? 0) / 100),
                settledAt: Date.now(),
              });
            }
          } else if (metadata.rideId) {
            await ctx.runMutation(internal.rides.internalSettleRideFromStripe, {
              rideId: metadata.rideId as never,
              paymentIntentId: pi.id ?? "",
            });
          }
          if (pi.id) {
            await ctx.runMutation(internal.stripeInternal.markPaymentSucceeded, {
              stripePaymentIntentId: pi.id,
              settledAt: Date.now(),
            });
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const pi = object as { id?: string };
          if (pi.id) {
            await ctx.runMutation(internal.stripeInternal.markPaymentFailed, {
              stripePaymentIntentId: pi.id,
            });
          }
          break;
        }

        case "account.updated": {
          const account = object as {
            id?: string;
            details_submitted?: boolean;
            charges_enabled?: boolean;
            payouts_enabled?: boolean;
          };
          if (account.id) {
            const user = await ctx.runQuery(internal.stripeInternal.getUserByStripeAccount, {
              accountId: account.id,
            });
            if (user) {
              await ctx.runMutation(internal.stripeInternal.updateConnectStatus, {
                userId: user._id,
                detailsSubmitted: Boolean(account.details_submitted),
                chargesEnabled: Boolean(account.charges_enabled),
                payoutsEnabled: Boolean(account.payouts_enabled),
              });
            }
          }
          break;
        }

        case "transfer.created": {
          const transfer = object as { id?: string };
          if (transfer.id) {
            const payout = await ctx.runQuery(internal.stripeInternal.getPayoutByTransfer, {
              transferId: transfer.id,
            });
            // The initiating action usually marks the payout paid already;
            // this catches the case where the action died mid-flight.
            if (payout) {
              await ctx.runMutation(internal.stripeInternal.markPayoutPaid, {
                payoutId: payout._id,
                transferId: transfer.id,
                paidAt: Date.now(),
              });
            }
          }
          break;
        }

        case "setup_intent.succeeded": {
          const setup = object as { customer?: string; payment_method?: string };
          if (setup.customer && setup.payment_method) {
            const user = await ctx.runQuery(internal.stripeInternal.getUserByStripeCustomer, {
              customerId: setup.customer,
            });
            if (user) {
              await ctx.runMutation(internal.stripeInternal.vaultPaymentMethod, {
                userId: user._id,
                paymentMethodId: setup.payment_method,
              });
            }
          }
          break;
        }

        default:
          // Acknowledge (and idempotently record) unhandled events so Stripe
          // stops retrying them.
          break;
      }

      await ctx.runMutation(internal.stripeInternal.recordStripeEvent, {
        eventId: event.id,
        type: event.type,
        processedAt: Date.now(),
      });
    } catch (err) {
      // Let Stripe retry on failure; the idempotency ledger prevents
      // double-processing once the retry succeeds.
      console.error(`[stripe-webhook] ${event.type} failed:`, err);
      return { status: 500, body: "Webhook processing failed." };
    }

    return { status: 200, body: "ok" };
  },
});
