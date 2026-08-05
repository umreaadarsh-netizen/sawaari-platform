import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser } from "./users";
import type { Id } from "./_generated/dataModel";

/**
 * Sawaari's commission model: every settled fare is split 75/25 at the moment
 * the trip is completed — 75% accrues to the driver's earnings wallet and 25%
 * is retained by the platform (admin ledger). The split is frozen on the ride
 * and stamped again on the receipt so the numbers can never drift.
 */
export const DRIVER_SHARE_RATE = 0.75;
export const PLATFORM_SHARE_RATE = 0.25;

/**
 * Split a fare into the driver's 75% and the platform's 25% in whole rupees.
 * The driver share is rounded and the platform takes the remainder, so the
 * two parts always sum exactly to the fare.
 */
export function splitFare(
  fare: number,
): { driverShare: number; platformShare: number } {
  const driverShare = Math.round(fare * DRIVER_SHARE_RATE);
  return { driverShare, platformShare: fare - driverShare };
}

/**
 * Credit one settled fare to a driver's earnings wallet: the 75% driver share
 * accrues to `driverEarnings`, the 25% platform cut to `platformRetained`,
 * and the gross fare is recorded against `totalFares`. The wallet row is
 * upserted per driver, so the dashboard reads a single cumulative balance.
 */
export async function creditWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  fare: number,
  driverShare: number,
  platformShare: number,
  settledAt: number,
) {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      driverEarnings: existing.driverEarnings + driverShare,
      platformRetained: existing.platformRetained + platformShare,
      totalFares: existing.totalFares + fare,
      settledRides: existing.settledRides + 1,
      updatedAt: settledAt,
    });
  } else {
    await ctx.db.insert("wallets", {
      userId,
      driverEarnings: driverShare,
      platformRetained: platformShare,
      totalFares: fare,
      settledRides: 1,
      updatedAt: settledAt,
    });
  }
}

/** The current user's earnings wallet — the driver's cumulative 75% balance. */
export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return (
      (await ctx.db
        .query("wallets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first()) ?? null
    );
  },
});
