import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  GOTEGAON,
  GOTEGAON_ADDRESS,
  Place,
  buildRoutePath,
  estimateFare,
  etaMinutes,
  formatINR,
  formatKm,
  haversineKm,
  isInIndia,
} from "@/lib/geo";
import { vehicleById, type FleetVehicle } from "@/lib/fleet";
import { reverseGeocode, useLocationSuggest } from "@/hooks/use-location-suggest";
import { useRoadRoute } from "@/hooks/use-road-route";
import { AppShell, DashMode } from "@/components/AppShell";
import { SawaariMap, MapMarker } from "@/components/map/SawaariMap";
import { StatusTimeline } from "@/components/ride/StatusTimeline";
import { ChatPanel } from "@/components/ride/ChatPanel";
import { TripHistory, receiptId } from "@/components/ride/TripHistory";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Radar,
  Search,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";

type Field = "pickup" | "dropoff";

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  requested: { label: "Matching driver", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  matched: { label: "Driver matched", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  arriving: { label: "Driver arrived", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  in_progress: { label: "On the move", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  completed: { label: "Completed", cls: "border-white/15 bg-white/5 text-slate-300" },
};

function toDateTimeLocal(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

/** Digits-only Indian number for a wa.me deep link (91 prefix). */
function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("91") ? d : `91${d}`;
}

export default function RiderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const activeRide = useQuery(api.rides.activeRide, { side: "rider" });
  const nearby = useQuery(api.drivers.nearbyDrivers);
  const fleet = useQuery(api.fleet.listFleet);
  const myTrips = useQuery(api.rides.myRides);
  const driverDoc = useQuery(
    api.drivers.getDriver,
    activeRide?.driverId ? { userId: activeRide.driverId } : "skip",
  );
  const requestRide = useMutation(api.rides.requestRide);
  const cancelRide = useMutation(api.rides.cancelRide);

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [vehicleId, setVehicleId] = useState("classic");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledValue, setScheduledValue] = useState(() =>
    toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [requesting, setRequesting] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [locating, setLocating] = useState(false);
  const [panelTab, setPanelTab] = useState<"book" | "history">("book");
  const suggest = useLocationSuggest();

  const ride = activeRide ?? null;
  const vehicles = (fleet ?? []).filter((v) => v.enabled);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicleById(vehicleId);

  const farePreview = useMemo(() => {
    if (!pickup || !dropoff) return null;
    const dist = haversineKm(pickup, dropoff);
    return { dist, fare: estimateFare(dist, vehicle), eta: etaMinutes(dist) };
  }, [pickup, dropoff, vehicle]);

  const focusField = (field: Field) => {
    if (activeField !== field) suggest.clear();
    setActiveField(field);
  };

  const applySuggestion = (field: Field, s: { label: string; lat: number; lng: number }) => {
    const place: Place = { address: s.label, lat: s.lat, lng: s.lng };
    if (field === "pickup") {
      setPickup(place);
      setPickupText(s.label);
    } else {
      setDropoff(place);
      setDropoffText(s.label);
    }
    suggest.clear();
    setActiveField(null);
  };

  const handleMapClick = async (lat: number, lng: number) => {
    if (ride) return;
    const address = await reverseGeocode(lat, lng);
    if (!pickup) {
      setPickup({ address, lat, lng });
      setPickupText(address);
    } else if (!dropoff) {
      setDropoff({ address, lat, lng });
      setDropoffText(address);
    }
  };

  /** Drop the pickup on Gotegaon when GPS is blocked or returns garbage. */
  const fallbackToGotegaon = (reason: string) => {
    setPickup({ address: GOTEGAON_ADDRESS, lat: GOTEGAON.lat, lng: GOTEGAON.lng });
    setPickupText(GOTEGAON_ADDRESS);
    setActiveField(null);
    suggest.clear();
    toast.info(`${reason} Pickup set to ${GOTEGAON_ADDRESS} — tap the map to adjust.`);
  };

  const handleLocate = async () => {
    if (!navigator.geolocation) {
      fallbackToGotegaon("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60_000,
        }),
      );
      const { latitude, longitude } = pos.coords;
      // GPS proxies / VPNs can return placeholder regions (e.g. South Africa).
      // If the fix falls outside India, treat it as unusable and default to Gotegaon.
      if (!isInIndia(latitude, longitude)) {
        fallbackToGotegaon("Location resolved outside India.");
        return;
      }
      const address = await reverseGeocode(latitude, longitude);
      setPickup({ address, lat: latitude, lng: longitude });
      setPickupText(address);
      setActiveField(null);
      suggest.clear();
      toast.success("Current location detected — pickup set.");
    } catch (error) {
      const code = (error as GeolocationPositionError | undefined)?.code;
      if (code === 1) {
        fallbackToGotegaon("Location permission was denied.");
      } else if (code === 2) {
        fallbackToGotegaon("Location is unavailable.");
      } else {
        fallbackToGotegaon("Couldn't locate you.");
      }
    } finally {
      setLocating(false);
    }
  };

  const handleRequest = async () => {
    if (!pickup || !dropoff) return;
    const scheduledFor =
      scheduleMode === "later" ? new Date(scheduledValue).getTime() : undefined;
    if (scheduledFor !== undefined && scheduledFor <= Date.now()) {
      toast.error("Scheduled pickup must be in the future.");
      return;
    }
    setRequesting(true);
    try {
      await requestRide({ pickup, dropoff, vehicleType: vehicle.id, scheduledFor });
      toast.success(
        scheduledFor
          ? `Booking confirmed for ${format(new Date(scheduledFor), "h:mm a")} — matching you with a driver.`
          : "Booking confirmed — matching you with a driver.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete the booking.");
    }
    setRequesting(false);
  };

  const handleCancel = async () => {
    if (!ride) return;
    try {
      await cancelRide({ rideId: ride._id });
      toast.info("Booking cancelled.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel the booking.");
    }
  };

  // ---- map data -----------------------------------------------------------
  const markers = useMemo<MapMarker[]>(() => {
    if (ride) {
      const list: MapMarker[] = [
        {
          id: "pickup",
          kind: "pickup",
          position: [ride.pickup.lat, ride.pickup.lng],
          label: ride.pickup.address,
        },
        {
          id: "dropoff",
          kind: "dropoff",
          position: [ride.dropoff.lat, ride.dropoff.lng],
          label: ride.dropoff.address,
        },
      ];
      if (
        driverDoc?.location &&
        ["matched", "arriving", "in_progress"].includes(ride.status)
      ) {
        list.push({
          id: "driver",
          kind: "driver",
          position: [driverDoc.location.lat, driverDoc.location.lng],
          label: driverDoc.name,
        });
      }
      return list;
    }
    const list: MapMarker[] = [];
    if (pickup)
      list.push({ id: "pickup", kind: "pickup", position: [pickup.lat, pickup.lng] });
    if (dropoff)
      list.push({ id: "dropoff", kind: "dropoff", position: [dropoff.lat, dropoff.lng] });
    (nearby ?? []).forEach((d) =>
      list.push({
        id: d._id,
        kind: "driver-idle",
        position: [d.location.lat, d.location.lng],
      }),
    );
    return list;
  }, [ride, pickup, dropoff, nearby, driverDoc]);

  // Real road route (OSRM) for the trip once a ride is active; fall back to
  // the curved estimate while it loads or for the pre-booking preview.
  const roadRoute = useRoadRoute(
    ride ? ride.pickup : null,
    ride ? ride.dropoff : null,
    Boolean(ride),
  );
  const route = useMemo(() => {
    if (ride) return roadRoute ?? buildRoutePath(ride.pickup, ride.dropoff);
    if (pickup && dropoff) return buildRoutePath(pickup, dropoff);
    return undefined;
  }, [ride, roadRoute, pickup, dropoff]);

  // Live approach vector: driver's current position → pickup while the driver
  // heads over (streamed in real time via the driver's location updates).
  const approachRoute = useMemo(() => {
    if (!ride || !driverDoc?.location) return undefined;
    if (!["matched", "arriving"].includes(ride.status)) return undefined;
    return buildRoutePath(driverDoc.location, ride.pickup);
  }, [ride, driverDoc?.location]);

  // Coordinate-aware so a fresh GPS fix (even on the same field) re-centers
  // the map and drops an active pickup marker on the detected point.
  const focusKey = ride
    ? `ride-${ride._id}-${ride.status}-${driverDoc?.location?.lat ?? ""}`
    : pickup && dropoff
      ? `booked-${pickup.lat.toFixed(5)}-${pickup.lng.toFixed(5)}-${dropoff.lat.toFixed(5)}`
      : pickup
        ? `pickup-${pickup.lat.toFixed(5)}-${pickup.lng.toFixed(5)}`
        : "idle";

  const driverInfo = useMemo(() => {
    if (!ride || !driverDoc?.location) return null;
    if (!["matched", "arriving", "in_progress"].includes(ride.status)) return null;
    if (ride.scheduledFor && ride.scheduledFor > Date.now()) {
      return {
        name: driverDoc.name,
        vehicleNo: driverDoc.vehicleNo,
        rating: driverDoc.rating,
        msg: `Pickup scheduled · ${format(new Date(ride.scheduledFor), "h:mm a")}`,
      };
    }
    const target = ride.status === "in_progress" ? ride.dropoff : ride.pickup;
    const dist = haversineKm(driverDoc.location, target);
    return {
      name: driverDoc.name,
      vehicleNo: driverDoc.vehicleNo,
      rating: driverDoc.rating,
      msg:
        ride.status === "in_progress"
          ? `Arriving in ~${etaMinutes(dist)} min`
          : `Driver is ${formatKm(dist)} away`,
    };
  }, [ride, driverDoc]);

  const statusPill = ride ? STATUS_PILL[ride.status] : null;
  const rideVehicle = ride ? vehicleById(ride.vehicleType) : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppShell mode="rider" onSwitchMode={(m: DashMode) => navigate(`/app/${m}`)} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Map */}
        <main className="relative h-[40vh] lg:order-2 lg:h-auto lg:flex-1">
          <SawaariMap
            center={[GOTEGAON.lat, GOTEGAON.lng]}
            zoom={13}
            markers={markers}
            route={route}
            approachRoute={approachRoute}
            onMapClick={handleMapClick}
            focusKey={focusKey}
            className="h-full"
          />

          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-wrap items-center justify-center gap-2 px-3">
            {ride && approachRoute && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-amber-300 backdrop-blur-xl">
                <Navigation className="size-3" />
                Driver approaching pickup — live
              </span>
            )}
            {!ride && (
              <span className="rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur-xl">
                <MapPin className="mr-1 inline size-3 text-emerald-300" />
                Tap the map to set a location
              </span>
            )}
            {!ride && farePreview && (
              <span className="rounded-full border border-emerald-400/30 bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 backdrop-blur-xl">
                {formatINR(farePreview.fare)} · {formatKm(farePreview.dist)} · ~
                {farePreview.eta} min
              </span>
            )}
            {ride && statusPill && (
              <span
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-xl",
                  statusPill.cls,
                )}
              >
                {statusPill.label}
              </span>
            )}
          </div>
        </main>

        {/* Panel */}
        <aside className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 bg-slate-950/60 backdrop-blur-xl lg:order-1 lg:w-[400px] lg:flex-none lg:border-r lg:border-t-0 xl:w-[430px]">
          {ride ? (
            <RideView
              ride={ride}
              vehicle={rideVehicle}
              driverInfo={driverInfo}
              driverPhone={driverDoc?.phone}
              searching={ride.status === "requested"}
              nearbyCount={nearby?.length ?? 0}
              chatOpen={chatOpen}
              setChatOpen={setChatOpen}
              onCancel={handleCancel}
              userId={user?._id ?? ""}
            />
          ) : (
            <>
              <div className="flex shrink-0 gap-1 p-4 pb-0 sm:p-5 sm:pb-0">
                <div className="flex w-full rounded-full border border-white/10 bg-white/5 p-1">
                  {(
                    [
                      { id: "book", label: "Book a ride" },
                      { id: "history", label: "Trip history" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPanelTab(t.id)}
                      className={cn(
                        "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-all",
                        panelTab === t.id
                          ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                          : "text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {panelTab === "history" ? (
                <TripHistory trips={myTrips ?? []} perspective="rider" />
              ) : (
                <BookingView
                  pickup={pickup}
                  dropoff={dropoff}
                  pickupText={pickupText}
                  dropoffText={dropoffText}
                  activeField={activeField}
                  suggestions={suggest.suggestions}
                  suggestLoading={suggest.loading}
                  vehicles={vehicles}
                  vehicleId={vehicleId}
                  onVehicleChange={setVehicleId}
                  scheduleMode={scheduleMode}
                  scheduledValue={scheduledValue}
                  onScheduleMode={setScheduleMode}
                  onScheduledValue={setScheduledValue}
                  farePreview={farePreview}
                  requesting={requesting}
                  locating={locating}
                  onPickupText={(v) => {
                    setPickupText(v);
                    if (pickup) setPickup(null);
                    setActiveField("pickup");
                    suggest.search(v);
                  }}
                  onDropoffText={(v) => {
                    setDropoffText(v);
                    if (dropoff) setDropoff(null);
                    setActiveField("dropoff");
                    suggest.search(v);
                  }}
                  onFocusField={focusField}
                  onBlurField={() => setActiveField(null)}
                  onPickSuggestion={applySuggestion}
                  onLocate={handleLocate}
                  onRequest={handleRequest}
                />
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---- booking --------------------------------------------------------------

function BookingView(props: {
  pickup: Place | null;
  dropoff: Place | null;
  pickupText: string;
  dropoffText: string;
  activeField: Field | null;
  suggestions: ReturnType<typeof useLocationSuggest>["suggestions"];
  suggestLoading: boolean;
  vehicles: FleetVehicle[];
  vehicleId: string;
  onVehicleChange: (id: string) => void;
  scheduleMode: "now" | "later";
  scheduledValue: string;
  onScheduleMode: (m: "now" | "later") => void;
  onScheduledValue: (v: string) => void;
  farePreview: { dist: number; fare: number; eta: number } | null;
  requesting: boolean;
  locating: boolean;
  onPickupText: (v: string) => void;
  onDropoffText: (v: string) => void;
  onFocusField: (f: Field) => void;
  onBlurField: () => void;
  onPickSuggestion: (f: Field, s: { label: string; lat: number; lng: number }) => void;
  onLocate: () => void;
  onRequest: () => void;
}) {
  const {
    pickup,
    dropoff,
    pickupText,
    dropoffText,
    activeField,
    suggestions,
    suggestLoading,
    vehicles,
    vehicleId,
    scheduleMode,
    scheduledValue,
    farePreview,
    requesting,
    locating,
  } = props;
  const selectedVehicle =
    vehicles.find((v) => v.id === vehicleId) ?? vehicleById(vehicleId);

  const minTime = toDateTimeLocal(new Date(Date.now() + 15 * 60 * 1000));
  const maxTime = toDateTimeLocal(new Date(Date.now() + 48 * 60 * 60 * 1000));

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-white">
          Book an EV rickshaw
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Fixed fares · live tracking · scheduled pickups
        </p>
      </div>

      {/* vehicle catalog */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Choose your rickshaw
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => props.onVehicleChange(v.id)}
              className={cn(
                "min-w-[132px] rounded-2xl border p-3 text-left transition-all",
                vehicleId === v.id
                  ? "border-emerald-400/50 bg-emerald-400/10 ring-2 ring-emerald-400/20"
                  : "border-white/10 bg-white/5 hover:border-white/20",
              )}
            >
              <p className="text-sm font-semibold text-white">
                {v.name.replace("Sawaari ", "")}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-emerald-300">
                ₹{v.baseFare} + ₹{v.perKm}/km
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">{v.seats} seats</p>
            </button>
          ))}
        </div>
      </div>

      {/* locations */}
      <div className="relative">
        <LocationInput
          label="Pickup"
          icon={<MapPin className="size-4 text-emerald-300" />}
          value={pickupText}
          placeholder="Search pickup point…"
          active={activeField === "pickup"}
          onFocus={() => props.onFocusField("pickup")}
          onBlur={props.onBlurField}
          onChange={props.onPickupText}
          action={
            <button
              type="button"
              onClick={props.onLocate}
              disabled={locating}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-60",
                locating
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20",
              )}
              title="Detect current location via GPS"
            >
              {locating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LocateFixed className="size-3.5" />
              )}
              {locating ? "Locating…" : "Detect"}
            </button>
          }
        />
        {activeField === "pickup" && <SuggestionList {...props} field="pickup" />}
      </div>

      <div className="relative -mt-2">
        <LocationInput
          label="Drop-off"
          icon={<Flag className="size-4 text-rose-300" />}
          value={dropoffText}
          placeholder="Search drop-off point…"
          active={activeField === "dropoff"}
          onFocus={() => props.onFocusField("dropoff")}
          onBlur={props.onBlurField}
          onChange={props.onDropoffText}
        />
        {activeField === "dropoff" && <SuggestionList {...props} field="dropoff" />}
      </div>

      {suggestLoading && (
        <p className="-mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Loader2 className="size-3 animate-spin" /> Searching nearby places…
        </p>
      )}

      {/* scheduling */}
      <div className="-mt-1">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Pickup time
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
            {(["now", "later"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => props.onScheduleMode(m)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                  scheduleMode === m
                    ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {m === "now" ? "As soon as possible" : "Schedule"}
              </button>
            ))}
          </div>
          {scheduleMode === "later" && (
            <input
              type="datetime-local"
              value={scheduledValue}
              min={minTime}
              max={maxTime}
              onChange={(e) => props.onScheduledValue(e.target.value)}
              className="h-9 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-200 [color-scheme:dark] focus:border-emerald-400/50 focus:outline-none"
            />
          )}
        </div>
        {scheduleMode === "later" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <CalendarClock className="size-3 text-emerald-300" />
            A driver is confirmed ahead of your scheduled pickup.
          </p>
        )}
      </div>

      {/* live fare calculator */}
      {farePreview ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-teal-400/5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                Fare calculator · {selectedVehicle.name}
              </p>
              <p className="mt-1 font-display text-3xl font-semibold text-white">
                {formatINR(farePreview.fare)}
              </p>
            </div>
            <div className="space-y-1 text-right text-[11px] text-slate-400">
              <p className="flex items-center justify-end gap-1.5">
                <Navigation className="size-3" /> {formatKm(farePreview.dist)}
              </p>
              <p className="flex items-center justify-end gap-1.5">
                <Clock className="size-3" /> ~{farePreview.eta} min
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Base fare</span>
              <span className="text-slate-200">₹{selectedVehicle.baseFare}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>
                ₹{selectedVehicle.perKm}/km × {farePreview.dist.toFixed(1)} km
              </span>
              <span className="text-slate-200">
                ₹{Math.round(selectedVehicle.perKm * farePreview.dist)}
              </span>
            </div>
            {farePreview.fare >
              Math.round(selectedVehicle.baseFare + selectedVehicle.perKm * farePreview.dist) && (
              <div className="flex justify-between text-slate-400">
                <span>Minimum fare applied</span>
                <span className="text-amber-300">₹{selectedVehicle.minFare}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold text-white">
              <span>Total</span>
              <span className="text-emerald-300">{formatINR(farePreview.fare)}</span>
            </div>
          </div>

          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Sparkles className="size-3 text-emerald-300" /> All-electric fleet · no surge
            pricing — the fare you see is final
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-xs text-slate-500">
          Set a pickup and drop-off to calculate your fare —{" "}
          <span className="text-emerald-300">or tap the map</span>
        </div>
      )}

      <div className="mt-auto">
        <Button
          type="button"
          size="lg"
          disabled={!farePreview || requesting}
          onClick={props.onRequest}
          className="w-full bg-emerald-500 py-6 text-[15px] font-semibold text-emerald-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
        >
          {requesting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Confirming booking…
            </>
          ) : (
            <>
              {scheduleMode === "later" ? "Schedule booking" : "Book now"}{" "}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="mt-2.5 text-center text-[11px] text-slate-500">
          The quoted fare is final. Settle by UPI, card or cash at the end of the trip.
        </p>
      </div>

    </div>
  );
}

function LocationInput({
  label,
  icon,
  value,
  placeholder,
  active,
  onFocus,
  onBlur,
  onChange,
  action,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  placeholder: string;
  active: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (v: string) => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border bg-white/5 px-3 transition-all",
        active
          ? "border-emerald-400/50 ring-2 ring-emerald-400/20"
          : "border-white/10",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <input
          value={value}
          placeholder={placeholder}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
      </div>
      {action}
    </div>
  );
}

function SuggestionList({
  field,
  suggestions,
  onPickSuggestion,
}: {
  field: Field;
  suggestions: ReturnType<typeof useLocationSuggest>["suggestions"];
  onPickSuggestion: (f: Field, s: { label: string; lat: number; lng: number }) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
      {suggestions.slice(0, 5).map((s, i) => (
        <li key={`${s.lat}-${s.lng}-${i}`}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPickSuggestion(field, s);
            }}
            className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-emerald-400/10"
          >
            <Search className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-slate-100">
                {s.label}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {s.sublabel}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---- active ride ----------------------------------------------------------

function RideView({
  ride,
  vehicle,
  driverInfo,
  driverPhone,
  searching,
  nearbyCount,
  chatOpen,
  setChatOpen,
  onCancel,
  userId,
}: {
  ride: Doc<"rides">;
  vehicle: FleetVehicle | null;
  driverInfo: { name: string; vehicleNo: string; rating: number; msg: string } | null;
  driverPhone: string | undefined;
  searching: boolean;
  nearbyCount: number;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  onCancel: () => void;
  userId: string;
}) {
  const completed = ride.status === "completed";
  const scheduled = ride.scheduledFor ? ride.scheduledFor > Date.now() : false;

  // WhatsApp confirmation — opens wa.me with the booking details pre-filled
  // the moment a driver is assigned (accepted/arriving/in progress).
  const assigned =
    !completed && ["matched", "arriving", "in_progress"].includes(ride.status);
  const waNumber = driverPhone && driverPhone.replace(/\D/g, "").length >= 10
    ? waDigits(driverPhone)
    : null;
  const waMessage = assigned
    ? `Hi ${ride.driverName ?? "there"}, this is ${ride.riderName} — booking ${receiptId(ride._id)} is confirmed.\n\nRoute: ${ride.pickup.address} → ${ride.dropoff.address}\nVehicle: ${vehicle?.name ?? "EV rickshaw"} · Fare: ${formatINR(ride.fare)}\nPickup: ${scheduled ? `scheduled for ${format(new Date(ride.scheduledFor!), "h:mm a")}` : "as soon as possible"}\n\nLooking forward to the ride — thank you!`
    : "";
  const waHref =
    waNumber && waMessage
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`
      : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-white">
            Your booking
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {vehicle ? (
              <>
                {vehicle.name} ·{" "}
                <span className="text-emerald-300">{formatINR(ride.fare)}</span>
              </>
            ) : (
              "Live booking"
            )}
          </p>
        </div>
        {!completed &&
          (ride.status === "requested" || ride.status === "matched") && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-400/20"
            >
              <X className="size-3.5" /> Cancel booking
            </button>
          )}
      </div>

      <StatusTimeline status={ride.status} />

      {searching ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <span className="relative grid size-20 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full border border-emerald-400/40" />
            <span className="absolute inset-3 animate-ping rounded-full border border-emerald-400/30 [animation-delay:400ms]" />
            <span className="relative grid size-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40">
              <Radar className="size-7 animate-pulse" />
            </span>
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-white">
              {scheduled
                ? `Scheduled for ${format(new Date(ride.scheduledFor!), "h:mm a")}`
                : "Matching you with a driver…"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {scheduled
                ? "Your booking is open to nearby drivers and will be confirmed shortly."
                : nearbyCount > 0
                  ? `Broadcasting to ${nearbyCount} EV driver${nearbyCount === 1 ? "" : "s"} within 5 km of your pickup`
                  : "Broadcasting to drivers within 5 km — waiting for one to come online"}
            </p>
          </div>
        </div>
      ) : completed ? (
        <CheckoutCard ride={ride} vehicle={vehicle} userId={userId} />
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12 ring-2 ring-emerald-400/40">
                <AvatarFallback className="bg-emerald-400/15 text-base font-bold text-emerald-300">
                  {driverInfo?.name.slice(0, 1) ?? "D"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  {driverInfo?.name ?? "Connecting…"}
                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-300">
                    <Star className="size-3 fill-current" />
                    {driverInfo?.rating ?? "—"}
                  </span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <CarFront className="size-3.5 text-emerald-300" />
                  {driverInfo?.vehicleNo ?? "EV rickshaw"} ·{" "}
                  <Zap className="size-3 text-emerald-300" /> electric
                </p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                LIVE
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {ride.status === "in_progress" ? "Heading to" : "Pickup"}
                </p>
                <p className="mt-0.5 truncate text-xs font-medium text-slate-200">
                  {ride.status === "in_progress" ? ride.dropoff.address : ride.pickup.address}
                </p>
              </div>
              <div className="rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Fare
                </p>
                <p className="mt-0.5 text-xs font-semibold text-emerald-300">
                  {formatINR(ride.fare)} · {formatKm(ride.distanceKm)}
                </p>
              </div>
            </div>

            {driverInfo && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Clock className="size-3.5 text-emerald-300" /> {driverInfo.msg}
              </p>
            )}

            {assigned && (
              <a
                href={waHref ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!waHref}
                onClick={(e) => {
                  if (!waHref) {
                    e.preventDefault();
                    toast.info(
                      "Your driver hasn't added a WhatsApp number yet — message them here instead.",
                    );
                  }
                }}
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[13px] font-semibold transition-all",
                  waHref
                    ? "bg-[#25D366] text-emerald-950 shadow-lg shadow-[#25D366]/20 hover:brightness-110"
                    : "cursor-not-allowed bg-white/10 text-slate-400",
                )}
              >
                <MessageCircle className="size-4" />
                Chat with driver on WhatsApp
              </a>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-200 transition-colors hover:text-emerald-300"
              >
                <MessageSquare className="size-4 text-emerald-300" />
                Message your driver
              </button>
            </div>
            {chatOpen && (
              <ChatPanel rideId={ride._id} selfUserId={userId} className="min-h-[220px] flex-1" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---- checkout -------------------------------------------------------------

const PAY_METHODS = [
  { id: "upi" as const, label: "UPI" },
  { id: "card" as const, label: "Card" },
  { id: "cash" as const, label: "Cash" },
];

function CheckoutCard({
  ride,
  vehicle,
  userId,
}: {
  ride: Doc<"rides">;
  vehicle: FleetVehicle | null;
  userId: string;
}) {
  const payRide = useMutation(api.rides.payRide);
  const [method, setMethod] = useState<"upi" | "card" | "cash">("upi");
  const [paying, setPaying] = useState(false);

  const rates = vehicle ?? vehicleById("classic");
  const baseShown = ride.fare >= rates.baseFare ? rates.baseFare : ride.fare;
  const distancePortion = ride.fare - baseShown;
  const receiptId = `SW-${ride._id.slice(-6).toUpperCase()}`;

  const handlePay = async () => {
    setPaying(true);
    try {
      // Simulated gateway handshake for the demo.
      await new Promise((r) => setTimeout(r, 900));
      await payRide({ rideId: ride._id, method });
      toast.success("Payment successful — receipt issued.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment could not be processed.");
    }
    setPaying(false);
  };

  if (ride.paid) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-6">
        <span className="grid size-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40">
          <CheckCircle2 className="size-7" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold text-white">Trip settled</p>
          <p className="mt-1 text-xs text-slate-400">
            {formatINR(ride.fare)} · {formatKm(ride.distanceKm)} ·{" "}
            {PAY_METHODS.find((m) => m.id === ride.paymentMethod)?.label ?? "Paid"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Receipt</span>
            <span className="font-mono font-semibold text-emerald-300">{receiptId}</span>
          </div>
          <div className="mt-2 flex justify-between text-slate-400">
            <span>Base fare · {rates.name}</span>
            <span className="text-slate-200">{formatINR(rates.baseFare)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Distance · {formatKm(ride.distanceKm)}</span>
            <span className="text-slate-200">{formatINR(distancePortion)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-white">
            <span>Total paid</span>
            <span className="text-emerald-300">{formatINR(ride.fare)}</span>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-500">
          Thank you for riding electric with SAWAARI.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Checkout
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-white">
          Trip complete — settle your fare
        </h2>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/50 p-4 text-xs">          <div className="flex justify-between text-slate-400">
            <span>Base fare · {rates.name}</span>
            <span className="text-slate-200">{formatINR(baseShown)}</span>
          </div>
          {distancePortion > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Distance · {formatKm(ride.distanceKm)}</span>
              <span className="text-slate-200">{formatINR(distancePortion)}</span>
            </div>
          )}
        <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-white">
          <span>Total</span>
          <span className="text-emerald-300">{formatINR(ride.fare)}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Payment method
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PAY_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={cn(
                "rounded-xl border py-2.5 text-xs font-semibold transition-all",
                method === m.id
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handlePay()}
        disabled={paying}
        className="mt-auto w-full bg-emerald-500 py-5 text-[15px] font-semibold text-emerald-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
      >
        {paying ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Processing payment…
          </>
        ) : (
          <>
            Pay {formatINR(ride.fare)} <ChevronRight className="size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-[11px] text-slate-500">
        A receipt is issued instantly. Cash is settled directly with your driver.
      </p>
    </div>
  );
}
