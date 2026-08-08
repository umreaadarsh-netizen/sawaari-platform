// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Doc } from "@/convex/_generated/dataModel";
import DriverDashboard from "./DriverDashboard";

// ---- Convex mocks ---------------------------------------------------------
vi.mock("@/convex/_generated/api", () => {
  const api = {
    rides: {
      activeRide: { path: "rides:activeRide" },
      requestRide: { path: "rides:requestRide" },
      cancelRide: { path: "rides:cancelRide" },
      myRides: { path: "rides:myRides" },
      openRides: { path: "rides:openRides" },
      acceptRide: { path: "rides:acceptRide" },
      updateRideStatus: { path: "rides:updateRideStatus" },
      payRide: { path: "rides:payRide" },
      listMessages: { path: "rides:listMessages" },
      sendMessage: { path: "rides:sendMessage" },
    },
    drivers: {
      nearbyDrivers: { path: "drivers:nearbyDrivers" },
      getDriver: { path: "drivers:getDriver" },
      myProfile: { path: "drivers:myProfile" },
      saveProfile: { path: "drivers:saveProfile" },
      setOnline: { path: "drivers:setOnline" },
      updateLocation: { path: "drivers:updateLocation" },
    },
    fleet: { listFleet: { path: "fleet:listFleet" } },
    ratings: {
      myRatings: { path: "ratings:myRatings" },
      driverRatings: { path: "ratings:driverRatings" },
      rateDriver: { path: "ratings:rateDriver" },
    },
    wallet: {
      myWallet: { path: "wallet:myWallet" },
      myPayouts: { path: "wallet:myPayouts" },
    },
    stripe: {
      createPaymentIntent: { path: "stripe:createPaymentIntent" },
      getStripeKeys: { path: "stripe:getStripeKeys" },
      createConnectAccount: { path: "stripe:createConnectAccount" },
      getConnectAccountLink: { path: "stripe:getConnectAccountLink" },
      requestPayout: { path: "stripe:requestPayout" },
    },
    stripeQueries: { myConnectAccount: { path: "stripeQueries:myConnectAccount" } },
  };
  return { api };
});

const queryStore = vi.hoisted(() => ({} as Record<string, unknown>));
const mutationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const actionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ url: "https://example.com", amountPaise: 10000 }),
);

vi.mock("convex/react", () => ({
  useQuery: (ref: { path: string }) => queryStore[ref.path] ?? null,
  useMutation: () => mutationMock,
  useAction: () => actionMock,
}));

// ---- App-level mocks ------------------------------------------------------
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { _id: "u_driver", name: "Test Driver", email: "driver@test.com", role: "driver" },
    isLoading: false,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-now", () => ({ useNow: () => 1_750_000_000_000 }));
vi.mock("@/hooks/use-road-route", () => ({ useRoadRoute: () => null }));
vi.mock("@/hooks/use-location-suggest", () => ({
  useLocationSuggest: () => ({ suggestions: [], loading: false, search: vi.fn(), clear: vi.fn() }),
  reverseGeocode: vi.fn(async () => "Test location"),
}));

vi.mock("@/components/map/SawaariMap", () => ({
  SawaariMap: () => <div data-testid="sawaari-map" />,
  MapMarker: () => null,
}));

// ---- Fixtures -------------------------------------------------------------
const profile = {
  _id: "u_driver",
  userId: "u_driver",
  name: "Test Driver",
  vehicleNo: "MP 01 EV 4821",
  phone: "919876543210",
  online: false,
  location: { address: "Gotegaon", lat: 22.77, lng: 79.18 },
  lastSeen: 1_750_000_000_000,
  rating: 4.9,
  ratingCount: 12,
  trips: 87,
};

const baseRide = {
  _id: "rides_driver",
  riderId: "u_rider",
  driverId: "u_driver",
  pickup: { address: "Gotegaon, Gotegaon Tahsil", lat: 22.7727, lng: 79.1824 },
  dropoff: { address: "Narsinghpur, Madhya Pradesh", lat: 22.9, lng: 79.2 },
  fare: 720,
  distanceKm: 49.4,
  vehicleType: "classic",
  paid: false,
  riderName: "Anita Sharma",
  driverName: "Test Driver",
  vehicleNo: "MP 01 EV 4821",
  pickupOtp: "1234",
  completionOtp: "5678",
  createdAt: 1_750_000_000_000,
};

const matchedRide = { ...baseRide, status: "matched" } as unknown as Doc<"rides">;
const arrivingRide = { ...baseRide, status: "arriving" } as unknown as Doc<"rides">;
const inProgressRide = { ...baseRide, status: "in_progress" } as unknown as Doc<"rides">;

const openRequest = {
  _id: "rides_open",
  riderName: "Anita Sharma",
  fare: 720,
  distanceKm: 3.2,
  vehicleType: "classic",
  pickup: { address: "Gotegaon, Gotegaon Tahsil", lat: 22.7727, lng: 79.1824 },
  dropoff: { address: "Narsinghpur, Madhya Pradesh", lat: 22.9, lng: 79.2 },
};

const wallet = {
  _id: "wallet_1",
  userId: "u_driver",
  driverEarnings: 750,
  platformRetained: 250,
  totalFares: 1000,
  settledRides: 2,
  updatedAt: 1_750_000_000_000,
};

const GRADIENT = ["bg-gradient-to-r", "from-amber-400", "to-orange-500", "text-amber-950"];

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <DriverDashboard />
    </MemoryRouter>,
  );

const setQuery = (path: string, value: unknown) => {
  queryStore[path] = value;
};

describe("DriverDashboard — Electric Amber booking & payout CTAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(queryStore).forEach((k) => delete queryStore[k]);
    setQuery("rides:myRides", []);
    setQuery("ratings:driverRatings", []);
    setQuery("rides:listMessages", []);
    setQuery("wallet:myPayouts", []);
  });

  it("shows the gradient Create profile CTA and enables it once name + vehicle are filled", async () => {
    const user = userEvent.setup();
    setQuery("drivers:myProfile", null);
    renderDashboard();

    const create = screen.getByRole("button", { name: /create profile/i });
    // Name pre-fills from the auth user; vehicle number is what's missing.
    expect(create).toBeDisabled();
    expect(create).toHaveClass(...GRADIENT);

    await user.type(
      screen.getByPlaceholderText("Vehicle no. (e.g. KA 01 EV 4821)"),
      "MP 01 EV 4821",
    );
    expect(create).toBeEnabled();
  });

  it("shows the gradient Accept CTA on an open booking while online", () => {
    setQuery("drivers:myProfile", { ...profile, online: true });
    setQuery("rides:openRides", [openRequest]);
    renderDashboard();

    expect(screen.getByText(/1 waiting/i)).toBeInTheDocument();
    // The request card is itself a button whose accessible name includes
    // "Accept", so find the inner gradient Accept control specifically.
    const accepts = screen.getAllByRole("button", { name: /accept/i });
    const accept = accepts.find((el) => el.classList.contains("from-amber-400"));
    expect(accept).toBeDefined();
    expect(accept).toHaveClass(...GRADIENT);
  });

  it("shows the gradient Arrived at pickup CTA for a matched ride", () => {
    setQuery("drivers:myProfile", profile);
    setQuery("rides:activeRide", matchedRide);
    renderDashboard();

    const arrived = screen.getByRole("button", { name: /arrived at pickup/i });
    expect(arrived).toHaveClass(...GRADIENT);

    // Clicking it drives the ride into "arriving".
    // (Only invoked if we simulate the click — covered by the status tests.)
  });

  it("gates Start trip behind the 4-digit pickup code, with the gradient CTA", async () => {
    const user = userEvent.setup();
    setQuery("drivers:myProfile", profile);
    setQuery("rides:activeRide", arrivingRide);
    renderDashboard();

    const start = screen.getByRole("button", { name: /start trip/i });
    expect(start).toBeDisabled();
    expect(start).toHaveClass(...GRADIENT);

    await user.type(screen.getByPlaceholderText("••••"), "1234");
    expect(start).toBeEnabled();
  });

  it("gates Complete trip behind the 4-digit completion code, with the gradient CTA", async () => {
    const user = userEvent.setup();
    setQuery("drivers:myProfile", profile);
    setQuery("rides:activeRide", inProgressRide);
    renderDashboard();

    const complete = screen.getByRole("button", { name: /complete trip/i });
    expect(complete).toBeDisabled();
    expect(complete).toHaveClass(...GRADIENT);

    await user.type(screen.getByPlaceholderText("••••"), "5678");
    expect(complete).toBeEnabled();
  });

  it("shows the gradient Withdraw CTA with the wallet balance once payouts are enabled", () => {
    setQuery("drivers:myProfile", profile);
    setQuery("wallet:myWallet", wallet);
    setQuery("stripeQueries:myConnectAccount", {
      accountId: "acct_1",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    renderDashboard();

    const withdraw = screen.getByRole("button", { name: /withdraw ₹750/i });
    expect(withdraw).toBeEnabled();
    expect(withdraw).toHaveClass(...GRADIENT);
  });
});
