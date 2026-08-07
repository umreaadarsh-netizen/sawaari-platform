import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./users";
import { withoutOtps } from "./rides";
import { roleValidator } from "./schema";

const ACTIVE = ["requested", "matched", "arriving", "in_progress"] as const;

/** Identity-validated admin gate shared by every admin function. */
const requireAdmin = async (ctx: Parameters<typeof requireUser>[0]) => {
  const user = await requireUser(ctx); // throws "Please sign in." when anonymous
  if (user.role !== "admin") throw new Error("Administrator access required.");
  return user;
};

/** The first person to open the admin area becomes its administrator.
 *  Afterwards, admins can grant the role from the Users tab. */
export const becomeAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    if (existing) {
      throw new Error("This workspace already has an administrator.");
    }
    await ctx.db.patch(user._id, { role: "admin" });
  },
});

export const setUserRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, { userId, role }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { role });
  },
});

export const adminCancelRide = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, { rideId }) => {
    await requireAdmin(ctx);
    const ride = await ctx.db.get(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (!(ACTIVE as readonly string[]).includes(ride.status)) {
      throw new Error("Only active rides can be cancelled.");
    }
    await ctx.db.patch(rideId, { status: "cancelled" });
  },
});

export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rides = await ctx.db.query("rides").order("desc").take(500);
    const drivers = await ctx.db.query("drivers").take(500);
    const users = await ctx.db.query("users").take(500);
    const receipts = await ctx.db.query("receipts").order("desc").take(500);
    const completed = rides.filter((r) => r.status === "completed");
    const paid = completed.filter((r) => r.paid);
    const byMethod = (m: string) =>
      paid.filter((r) => r.paymentMethod === m).reduce((sum, r) => sum + r.fare, 0);

    // The platform's transaction ledger — every settled receipt carries the
    // frozen 75/25 split, so the admin sees exactly what was collected, what
    // accrued to drivers and what the platform retained. Receipts written
    // before the split shipped fall back to the 75/25 arithmetic.
    const faresCollected = receipts.reduce((sum, r) => sum + r.totalFare, 0);
    const driverPayouts = receipts.reduce(
      (sum, r) => sum + (r.driverShare ?? Math.round(r.totalFare * 0.75)),
      0,
    );
    const platformRevenue = receipts.reduce(
      (sum, r) =>
        sum + (r.platformShare ?? r.totalFare - Math.round(r.totalFare * 0.75)),
      0,
    );

    return {
      totalRides: rides.length,
      activeRides: rides.filter((r) => (ACTIVE as readonly string[]).includes(r.status)).length,
      completedRides: completed.length,
      revenue: faresCollected,
      paidRides: paid.length,
      upiRevenue: byMethod("upi"),
      cashRevenue: byMethod("cash"),
      qrRevenue: byMethod("qr"),
      faresCollected,
      driverPayouts,
      platformRevenue,
      onlineDrivers: drivers.filter((d) => d.online).length,
      totalDrivers: drivers.length,
      totalUsers: users.length,
    };
  },
});

export const listAllRides = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rides = await ctx.db.query("rides").order("desc").take(100);
    const filtered = status ? rides.filter((r) => r.status === status) : rides;
    return filtered.map((r) => withoutOtps(r));
  },
});

export const listAllDrivers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("drivers").order("desc").take(100);
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").order("desc").take(100);
  },
});

/** The settlement ledger: every receipt issued, newest first. */
export const adminListReceipts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("receipts").order("desc").take(100);
  },
});
