import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const BENGALURU = {
  address: "Bengaluru, Karnataka, India",
  lat: 12.9716,
  lng: 77.5946,
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
  args: { name: v.string(), vehicleNo: v.string() },
  handler: async (ctx, { name, vehicleNo }) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Please sign in.");
    const cleanName = name.trim().slice(0, 40);
    const cleanNo = vehicleNo.trim().toUpperCase().slice(0, 12);
    if (!cleanName) throw new Error("Please enter your name.");
    if (!cleanNo) throw new Error("Please enter your vehicle number.");

    const existing = await ctx.db
      .query("drivers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { name: cleanName, vehicleNo: cleanNo });
      return existing._id;
    }
    return await ctx.db.insert("drivers", {
      userId: user._id,
      name: cleanName,
      vehicleNo: cleanNo,
      online: false,
      location: BENGALURU,
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
