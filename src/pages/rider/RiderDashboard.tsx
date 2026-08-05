import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  BENGALURU,
  Place,
  buildRoutePath,
  estimateFare,
  etaMinutes,
  formatINR,
  formatKm,
  haversineKm,
} from "@/lib/geo";
import { reverseGeocode, useLocationSuggest } from "@/hooks/use-location-suggest";
import { AppShell, DashMode } from "@/components/AppShell";
import { SawaariMap, MapMarker } from "@/components/map/SawaariMap";
import { StatusTimeline } from "@/components/ride/StatusTimeline";
import { ChatPanel } from "@/components/ride/ChatPanel";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  Clock,
  Flag,
  Loader2,
  LocateFixed,
  MapPin,
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
  requested: { label: "Matching driver…", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  accepted: { label: "Driver assigned", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  arriving: { label: "Driver arrived", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  in_progress: { label: "On the move", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  completed: { label: "Completed", cls: "border-white/15 bg-white/5 text-slate-300" },
};

export default function RiderDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const activeRide = useQuery(api.rides.activeRide, { side: "rider" });
  const nearby = useQuery(api.drivers.nearbyDrivers);
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
  const [requesting, setRequesting] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [locating, setLocating] = useState(false);
  const suggest = useLocationSuggest();

  const ride = activeRide ?? null;

  // ---- booking helpers ----------------------------------------------------
  const farePreview = useMemo(() => {
    if (!pickup || !dropoff) return null;
    const dist = haversineKm(pickup, dropoff);
    return { dist, fare: estimateFare(dist), eta: etaMinutes(dist) };
  }, [pickup, dropoff]);

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

  const handleLocate = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      const { latitude, longitude } = pos.coords;
      const address = await reverseGeocode(latitude, longitude);
      setPickup({ address, lat: latitude, lng: longitude });
      setPickupText(address);
    } catch {
      toast.error("Couldn't find your location. Tap the map instead.");
    }
    setLocating(false);
  };

  const handleRequest = async () => {
    if (!pickup || !dropoff) return;
    setRequesting(true);
    try {
      await requestRide({ pickup, dropoff });
      toast.success("Ride requested — matching you with a driver…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't request the ride.");
    }
    setRequesting(false);
  };

  const handleCancel = async () => {
    if (!ride) return;
    try {
      await cancelRide({ rideId: ride._id });
      toast.info("Ride cancelled.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel.");
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
        ["accepted", "arriving", "in_progress"].includes(ride.status)
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

  const route = useMemo(() => {
    if (ride) return buildRoutePath(ride.pickup, ride.dropoff);
    if (pickup && dropoff) return buildRoutePath(pickup, dropoff);
    return undefined;
  }, [ride, pickup, dropoff]);

  const focusKey = ride
    ? `ride-${ride._id}-${ride.status}-${driverDoc?.location?.lat ?? ""}`
    : pickup && dropoff
      ? "booked"
      : pickup
        ? "pickup"
        : "idle";

  // ---- driver ETA ---------------------------------------------------------
  const driverInfo = useMemo(() => {
    if (!ride || !driverDoc?.location) return null;
    if (!["accepted", "arriving", "in_progress"].includes(ride.status)) return null;
    const target =
      ride.status === "in_progress" ? ride.dropoff : ride.pickup;
    const dist = haversineKm(driverDoc.location, target);
    const msg =
      ride.status === "in_progress"
        ? `Arriving in ~${etaMinutes(dist)} min`
        : `Driver is ${formatKm(dist)} away`;
    return { name: driverDoc.name, vehicleNo: driverDoc.vehicleNo, rating: driverDoc.rating, msg };
  }, [ride, driverDoc]);

  const statusPill = ride ? STATUS_PILL[ride.status] : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppShell
        mode="rider"
        onSwitchMode={(m: DashMode) => navigate(m === "driver" ? "/app/driver" : "/app/rider")}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Map */}
        <main className="relative h-[42vh] lg:order-2 lg:h-auto lg:flex-1">
          <SawaariMap
            center={[BENGALURU.lat, BENGALURU.lng]}
            zoom={13}
            markers={markers}
            route={route}
            onMapClick={handleMapClick}
            focusKey={focusKey}
            className="h-full"
          />

          {/* floating chips */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-wrap items-center justify-center gap-2 px-3">
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
              driverInfo={driverInfo}
              searching={ride.status === "requested"}
              nearbyCount={nearby?.length ?? 0}
              chatOpen={chatOpen}
              setChatOpen={setChatOpen}
              onCancel={handleCancel}
              userId={user?._id ?? ""}
            />
          ) : (
            <BookingView
              pickup={pickup}
              dropoff={dropoff}
              pickupText={pickupText}
              dropoffText={dropoffText}
              activeField={activeField}
              suggestions={suggest.suggestions}
              suggestLoading={suggest.loading}
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
    farePreview,
    requesting,
    locating,
  } = props;

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-white">
          Where to, today?
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Transparent fares · 100% electric · live tracking
        </p>
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
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-emerald-300 disabled:opacity-50"
              title="Use my current location"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
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

      {/* fare preview */}
      {farePreview ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-teal-400/5 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                Estimated fare
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
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Sparkles className="size-3 text-emerald-300" /> All-electric EV auto ·
            ₹30 base + ₹14/km
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-xs text-slate-500">
          Set pickup and drop-off to see your fare — <span className="text-emerald-300">or tap the map</span>
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
              <Loader2 className="size-4 animate-spin" /> Matching you…
            </>
          ) : (
            <>
              Request Sawaari <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="mt-2.5 text-center text-[11px] text-slate-500">
          No surge pricing. Pay the driver at the end of the trip.
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
  driverInfo,
  searching,
  nearbyCount,
  chatOpen,
  setChatOpen,
  onCancel,
  userId,
}: {
  ride: Doc<"rides">;
  driverInfo: { name: string; vehicleNo: string; rating: number; msg: string } | null;
  searching: boolean;
  nearbyCount: number;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  onCancel: () => void;
  userId: string;
}) {
  const completed = ride.status === "completed";
  const duration =
    ride.completedAt && ride.startedAt
      ? Math.max(1, Math.round((ride.completedAt - ride.startedAt) / 60000))
      : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-white">
            Your ride
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Live over WebSocket · both dashboards stay in sync
          </p>
        </div>
        {!completed &&
          (ride.status === "requested" || ride.status === "accepted") && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-400/20"
            >
              <X className="size-3.5" /> Cancel
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
              Finding your Sawaari…
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {nearbyCount > 0
                ? `${nearbyCount} EV driver${nearbyCount === 1 ? "" : "s"} online nearby`
                : "Waiting for a nearby driver to go online"}
            </p>
          </div>
        </div>
      ) : completed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-8 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40">
            <CheckCircle2 className="size-8" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-white">
              Trip complete
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {formatINR(ride.fare)} · {formatKm(ride.distanceKm)}
              {duration ? ` · ${duration} min` : ""} — thanks for riding electric ⚡
            </p>
          </div>
          <p className="text-[11px] text-slate-500">
            You can book another ride from the panel above.
          </p>
        </div>
      ) : (
        <>
          {/* driver card */}
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
                  {driverInfo?.vehicleNo ?? "EV auto"} ·{" "}
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
          </div>

          {/* chat */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <button
                type="button"
                onClick={() => setChatOpen(!chatOpen)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-200 transition-colors hover:text-emerald-300"
              >
                <MessageSquare className="size-4 text-emerald-300" />
                Chat with driver
                <span className={cn("text-[10px] text-slate-500", chatOpen && "hidden")}>
                  (tap to open)
                </span>
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
