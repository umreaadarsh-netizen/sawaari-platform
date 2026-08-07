import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { getCurrentUser, requireRole } from "./users";

export interface FleetVehicle {
  id: string;
  name: string;
  tagline: string;
  seats: number;
  baseFare: number;
  perKm: number;
  minFare: number;
  enabled: boolean;
  sort: number;
}

/** The catalogue that ships with the platform; admins can edit it from the
 *  admin area, which persists rows in the `fleet` table. */
export const DEFAULT_FLEET: FleetVehicle[] = [
  {
    id: "classic",
    name: "Sawaari Classic",
    tagline: "The everyday electric commute",
    seats: 3,
    baseFare: 30,
    perKm: 14,
    minFare: 35,
    enabled: true,
    sort: 1,
  },
  {
    id: "comfort",
    name: "Sawaari Comfort",
    tagline: "Extra legroom and softer seats",
    seats: 4,
    baseFare: 45,
    perKm: 18,
    minFare: 50,
    enabled: true,
    sort: 2,
  },
  {
    id: "xl",
    name: "Sawaari XL",
    tagline: "Groups, luggage and longer trips",
    seats: 6,
    baseFare: 60,
    perKm: 22,
    minFare: 65,
    enabled: true,
    sort: 3,
  },
];

/** Resolve the fare card for a vehicle id — persisted admin rows first,
 *  falling back to the built-in catalogue. */
export async function getFleetRates(
  ctx: MutationCtx,
  vehicleId: string,
): Promise<FleetVehicle> {
  const row = await ctx.db
    .query("fleet")
    .withIndex("by_vehicle_id", (q) => q.eq("id", vehicleId))
    .first();
  if (row) {
    return {
      id: row.id,
      name: row.name,
      tagline: row.tagline,
      seats: row.seats,
      baseFare: row.baseFare,
      perKm: row.perKm,
      minFare: row.minFare,
      enabled: row.enabled,
      sort: row.sort,
    };
  }
  return DEFAULT_FLEET.find((v) => v.id === vehicleId) ?? DEFAULT_FLEET[0];
}

const vehicleFields = {
  id: v.string(),
  name: v.string(),
  tagline: v.string(),
  seats: v.number(),
  baseFare: v.number(),
  perKm: v.number(),
  minFare: v.number(),
  enabled: v.boolean(),
  sort: v.number(),
};

/** The catalogue as customers see it: the built-in fleet with any admin
 *  edits layered on top (admin rows persist in the `fleet` table). */
export const listFleet = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db.query("fleet").take(50);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return DEFAULT_FLEET.map((v) => {
      const row = byId.get(v.id);
      if (!row) return v;
      return {
        id: v.id,
        name: row.name,
        tagline: row.tagline,
        seats: row.seats,
        baseFare: row.baseFare,
        perKm: row.perKm,
        minFare: row.minFare,
        enabled: row.enabled,
        sort: row.sort,
      };
    });
  },
});

export const saveFleetVehicle = mutation({
  args: vehicleFields,
  handler: async (ctx, vehicle) => {
    await requireRole(ctx, "admin", "Administrator access required.");
    const existing = await ctx.db
      .query("fleet")
      .withIndex("by_vehicle_id", (q) => q.eq("id", vehicle.id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, vehicle);
      return existing._id;
    }
    return await ctx.db.insert("fleet", vehicle);
  },
});

export const setVehicleEnabled = mutation({
  args: { id: v.string(), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    await requireRole(ctx, "admin", "Administrator access required.");
    const existing = await ctx.db
      .query("fleet")
      .withIndex("by_vehicle_id", (q) => q.eq("id", id))
      .first();
    if (existing) await ctx.db.patch(existing._id, { enabled });
  },
});
