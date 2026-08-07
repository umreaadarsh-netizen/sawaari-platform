import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Fetch the latest OTP record for a phone (if any). */
export const getOtp = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    return await ctx.db
      .query("phoneOtps")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
  },
});

/**
 * INTERNAL — park a plaintext demo SMS code for the dev preview. Only ever
 * written by the phone-otp auth provider when no Vonage credentials exist,
 * and only readable back by `phoneOtp.demoCode` while credentials are still
 * absent — so it can never leak codes in a configured production deployment.
 */
export const storeDemoOtp = internalMutation({
  args: {
    phone: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { phone, code, expiresAt }) => {
    const existing = await ctx.db
      .query("demoOtps")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("demoOtps", {
      phone,
      code,
      expiresAt,
      createdAt: Date.now(),
    });
  },
});

/** Replace any existing OTP for a phone with a freshly issued code. */
export const storeOtp = internalMutation({
  args: {
    phone: v.string(),
    codeHash: v.string(),
    salt: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phoneOtps")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("phoneOtps", {
      phone: args.phone,
      codeHash: args.codeHash,
      salt: args.salt,
      expiresAt: args.expiresAt,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});

export const deleteOtp = internalMutation({
  args: { id: v.id("phoneOtps") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const incrementAttempts = internalMutation({
  args: { id: v.id("phoneOtps") },
  handler: async (ctx, { id }) => {
    const record = await ctx.db.get(id);
    if (record) {
      await ctx.db.patch(id, { attempts: record.attempts + 1 });
    }
  },
});
