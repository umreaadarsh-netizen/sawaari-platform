import { v } from "convex/values";
import { query } from "./_generated/server";
import { normalizeIndianPhone } from "./phone";

/**
 * DEV-PREVIEW ONLY — surface the plaintext SMS code for a phone while no
 * Vonage credentials are configured. The `phone-otp` auth provider (see
 * `auth.ts`) parks the code in `demoOtps` instead of sending SMS; this query
 * lets the sign-in card show it on screen for testing.
 *
 * The moment VONAGE_API_KEY / VONAGE_API_SECRET are set this returns null and
 * the code is never readable — real SMS delivery takes over. The query lives
 * in its own non-node module because `phoneOtp.ts` is a `"use node"` file,
 * and queries cannot be defined in Node.js functions.
 */
export const demoCode = query({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
      return null;
    }
    const normalized = normalizeIndianPhone(phone);
    const row = await ctx.db
      .query("demoOtps")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .first();
    if (!row) return null;
    if (Date.now() > row.expiresAt) return null;
    return row.code;
  },
});
