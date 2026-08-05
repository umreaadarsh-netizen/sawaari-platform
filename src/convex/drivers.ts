import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";
import { isValidIndianPhone, normalizeIndianPhone } from "./phone";

export const GOTEGAON = {
  address: "Gotegaon, Madhya Pradesh, India",
  lat: 22.92,
  lng: 79.18,
};

// ---- driver profile -------------------------------------------------------

export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
  },
});

export const getDriver = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const saveProfile = mutation({
  args: { name: v.string(), vehicleNo: v.string(), phone: v.optional(v.string()) },
  handler: async (ctx, { name, vehicleNo, phone }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const cleanName = name.trim().slice(0, 40);
    const cleanNo = vehicleNo.trim().toUpperCase().slice(0, 12);
    if (!cleanName) throw new Error("Please enter your name.");
    if (!cleanNo) throw new Error("Please enter your vehicle number.");

    // Optional WhatsApp number — normalized to 91XXXXXXXXXX, only stored
    // when it's a valid Indian mobile (or explicitly cleared).
    let cleanPhone: string | undefined;
    if (phone !== undefined && phone.trim() !== "") {
      const normalized = normalizeIndianPhone(phone);
      if (!isValidIndianPhone(normalized)) {
        throw new Error("Enter a valid 10-digit Indian mobile number.");
      }
      cleanPhone = normalized;
    } else if (phone === "") {
      cleanPhone = undefined;
    }

    const existing = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: cleanName,
        vehicleNo: cleanNo,
        ...(phone !== undefined ? { phone: cleanPhone } : {}),
      });
      return existing._id;
    }
    return await ctx.db.insert("drivers", {
      userId: user._id,
      name: cleanName,
      vehicleNo: cleanNo,
      phone: cleanPhone,
      online: false,
      location: GOTEGAON,
      lastSeen: now,
      rating: 4.9,
      trips: 0,
    });
  },
});

export const setOnline = mutation({
  args: { online: v.boolean() },
  handler: async (ctx, { online }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!driver) throw new Error("Create a driver profile first.");
    await ctx.db.patch(driver._id, { online, lastSeen: Date.now() });
  },
});

/** Streamed from the driver dashboard every few seconds while on duty. */
export const updateLocation = mutation({
  args: { lat: v.number(), lng: v.number() },
  handler: async (ctx, { lat, lng }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return;
    const driver = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!driver) return;
    await ctx.db.patch(driver._id, {
      location: { address: driver.location.address, lat, lng },
      lastSeen: Date.now(),
    });
  },
});

/** Recently-seen online drivers, shown as live markers on the rider map. */
export const nearbyDrivers = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("drivers")
      .withIndex("by_online", (q) => q.eq("online", true))
      .order("desc")
      .take(50);
    const cutoff = Date.now() - 60_000;
    return all.filter((d) => d.lastSeen >= cutoff).slice(0, 12);
  },
});
