import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

/**
 * Sawaari's commission model: every settled fare is split 75/25 at the moment
 * the trip is completed — 75% accrues to the driver's earnings wallet and 25%
 * is retained by the platform (admin ledger). The split is frozen on the ride
 * and stamped again on the receipt so the numbers can never drift.
 *
 * The split itself lives in `src/lib/geo.ts` and is re-exported here so the
 * server, the receipt, and the display layer are literally the same code.
 */
export {
  DRIVER_COMMISSION_RATE as DRIVER_SHARE_RATE,
  PLATFORM_COMMISSION_RATE as PLATFORM_SHARE_RATE,
  splitFare,
} from "../lib/geo";

/**
 * INTERNAL — credit one settled fare to a driver's earnings wallet: the 75%
 * driver share accrues to `driverEarnings`, the 25% platform cut to
 * `platformRetained`, and the gross fare is recorded against `totalFares`.
 * The wallet row is upserted per driver, so the dashboard reads a single
 * cumulative balance.
 *
 * Money movement is intentionally internal-only: the function is not exposed
 * on the public `api` namespace (only via `internal`), so no client session
 * can invoke it. The only caller is `rides.payRide` after a fare is captured.
 */
export const internalCreditWallet = internalMutation({
  args: {
    userId: v.id("users"),
    fare: v.number(),
    driverShare: v.number(),
    platformShare: v.number(),
    settledAt: v.number(),
  },
  handler: async (ctx, { userId, fare, driverShare, platformShare, settledAt }) => {
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
  },
});

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
