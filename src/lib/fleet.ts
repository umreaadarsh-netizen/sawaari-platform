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

/** Mirrors the built-in catalogue served by `convex/fleet.ts`. The admin area
 *  can edit these, which persists overrides in the fleet table. */
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

export function vehicleById(id: string): FleetVehicle {
  return DEFAULT_FLEET.find((v) => v.id === id) ?? DEFAULT_FLEET[0];
}

export function formatVehicleRate(v: {
  baseFare: number;
  perKm: number;
}): string {
  return `₹${v.baseFare} + ₹${v.perKm}/km`;
}
