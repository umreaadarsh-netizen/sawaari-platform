// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Doc } from "@/convex/_generated/dataModel";
import RiderDashboard from "./RiderDashboard";

// ---- Convex mocks ---------------------------------------------------------
// The generated `api` is an `anyApi` proxy whose references are not stable
// across accesses, so we replace the module with stable refs carrying a
// `path` and dispatch `useQuery`/`useMutation`/`useAction` on that path.
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
    user: { _id: "u_rider", name: "Test Rider", email: "rider@test.com", role: "rider" },
    isLoading: false,
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-now", () => ({ useNow: () => 1_750_000_000_000 }));
vi.mock("@/hooks/use-road-route", () => ({ useRoadRoute: () => null }));

// Leaflet won't work in jsdom; the map is just a shell for these tests.
vi.mock("@/components/map/SawaariMap", () => ({
  SawaariMap: () => <div data-testid="sawaari-map" />,
  MapMarker: () => null,
}));

vi.mock("@/components/ride/StripeCardPayment", () => ({
  StripeCardPayment: () => <div data-testid="stripe-card-payment" />,
}));

// Stateful suggestion mock: typing a query synchronously fills `suggestions`,
// which the next render (driven by the component's own setState) picks up.
const suggestMock = vi.hoisted(() => ({
  suggestions: [] as { label: string; sublabel: string; lat: number; lng: number }[],
  loading: false,
  search: vi.fn((q: string) => {
    suggestMock.suggestions = q.includes("Gotegaon")
      ? [{ label: "Gotegaon, Gotegaon Tahsil", sublabel: "Gotegaon, MP", lat: 22.77, lng: 79.18 }]
      : q.includes("Narsinghpur")
        ? [
            {
              label: "Narsinghpur, Madhya Pradesh",
              sublabel: "Narsinghpur, MP",
              lat: 22.9,
              lng: 79.2,
            },
          ]
        : [];
  }),
  clear: vi.fn(() => {
    suggestMock.suggestions = [];
  }),
}));

vi.mock("@/hooks/use-location-suggest", () => ({
  useLocationSuggest: () => suggestMock,
  reverseGeocode: vi.fn(async () => "Test location"),
}));

// ---- Fixtures -------------------------------------------------------------
const completedRide = {
  _id: "rides_test",
  riderId: "u_rider",
  driverId: "u_driver",
  status: "completed",
  pickup: { address: "Gotegaon, Gotegaon Tahsil", lat: 22.7727, lng: 79.1824 },
  dropoff: { address: "Narsinghpur, Madhya Pradesh", lat: 22.9, lng: 79.2 },
  fare: 720,
  distanceKm: 49.4,
  vehicleType: "classic",
  paid: false,
  riderName: "Test Rider",
  driverName: "Ravi Driver",
  vehicleNo: "MP 01 EV 4821",
  createdAt: 1_750_000_000_000,
} as unknown as Doc<"rides">;

const GRADIENT = ["bg-gradient-to-r", "from-amber-400", "to-orange-500", "text-amber-950"];

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <RiderDashboard />
    </MemoryRouter>,
  );

const setQuery = (path: string, value: unknown) => {
  queryStore[path] = value;
};

describe("RiderDashboard — Electric Amber booking & payment CTAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(queryStore).forEach((k) => delete queryStore[k]);
    // Defaults for array-returning queries so subcomponents render cleanly.
    setQuery("rides:myRides", []);
    setQuery("ratings:myRatings", []);
    setQuery("drivers:nearbyDrivers", []);
    setQuery("fleet:listFleet", []);
    setQuery("rides:listMessages", []);
    suggestMock.suggestions = [];
    suggestMock.search.mockClear();
    suggestMock.clear.mockClear();
  });

  it("renders the booking panel with a disabled amber gradient Book now CTA", () => {
    setQuery("rides:activeRide", null);
    renderDashboard();

    expect(screen.getByText("Book an EV rickshaw")).toBeInTheDocument();
    const bookNow = screen.getByRole("button", { name: /book now/i });
    expect(bookNow).toBeDisabled();
    expect(bookNow).toHaveClass(...GRADIENT);
    expect(screen.getByText(/set a pickup and drop-off to calculate your fare/i)).toBeInTheDocument();
  });

  it("enables the gradient Book now CTA and shows the amber fare card once pickup + drop-off are chosen", async () => {
    const user = userEvent.setup();
    setQuery("rides:activeRide", null);
    renderDashboard();

    const pickupInput = screen.getByPlaceholderText("Search pickup point…");
    await user.click(pickupInput);
    await user.type(pickupInput, "Gotegaon");
    await user.click(await screen.findByText("Gotegaon, Gotegaon Tahsil"));

    const dropoffInput = screen.getByPlaceholderText("Search drop-off point…");
    await user.click(dropoffInput);
    await user.type(dropoffInput, "Narsinghpur");
    await user.click(await screen.findByText("Narsinghpur, Madhya Pradesh"));

    const bookNow = screen.getByRole("button", { name: /book now/i });
    expect(bookNow).toBeEnabled();
    expect(bookNow).toHaveClass(...GRADIENT);

    // Fare calculator card carries the amber tint.
    expect(
      document.querySelector('[class*="from-amber-400/10"]'),
    ).not.toBeNull();

    await user.click(bookNow);
    expect(mutationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleType: "classic",
        pickup: expect.objectContaining({ address: "Gotegaon, Gotegaon Tahsil" }),
        dropoff: expect.objectContaining({ address: "Narsinghpur, Madhya Pradesh" }),
      }),
    );
  });

  it("shows the gradient Pay CTA in checkout for a completed ride", () => {
    setQuery("rides:activeRide", completedRide);
    setQuery("drivers:getDriver", {
      _id: "u_driver",
      name: "Ravi Driver",
      phone: "919876543210",
    });
    renderDashboard();

    expect(screen.getByText(/trip complete — settle your fare/i)).toBeInTheDocument();
    const pay = screen.getByRole("button", { name: /pay ₹720/i });
    expect(pay).toBeEnabled();
    expect(pay).toHaveClass(...GRADIENT);
  });

  it("opens the gradient Submit rating CTA after paying", async () => {
    setQuery("rides:activeRide", completedRide);
    setQuery("drivers:getDriver", {
      _id: "u_driver",
      name: "Ravi Driver",
      phone: "919876543210",
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: /pay ₹720/i }));

    // handlePay waits ~900ms before settling — give it a comfortable window.
    const submit = await screen.findByRole(
      "button",
      { name: /submit rating/i },
      { timeout: 3000 },
    );
    expect(submit).toHaveClass(...GRADIENT);
    expect(screen.getByText(/how was your ride with ravi driver/i)).toBeInTheDocument();
  });
});
