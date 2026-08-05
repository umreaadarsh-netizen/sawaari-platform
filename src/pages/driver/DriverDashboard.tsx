import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { GOTEGAON, buildRoutePath, formatINR, formatKm, haversineKm } from "@/lib/geo";
import { useRoadRoute } from "@/hooks/use-road-route";
import { vehicleById } from "@/lib/fleet";
import { AppShell, DashMode } from "@/components/AppShell";
import { SawaariMap, MapMarker } from "@/components/map/SawaariMap";
import { StatusTimeline } from "@/components/ride/StatusTimeline";
import { ChatPanel } from "@/components/ride/ChatPanel";
import { TripHistory } from "@/components/ride/TripHistory";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import {
  ArrowUpCircle,
  BadgeCheck,
  CalendarClock,
  CarFront,
  CheckCircle2,
  Flag,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  MessageCircle,
  Navigation,
  Pencil,
  Play,
  Wallet,
  Zap,
} from "lucide-react";

export default function DriverDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const myProfile = useQuery(api.drivers.myProfile);
  const activeRide = useQuery(api.rides.activeRide, { side: "driver" });
  const openRequests = useQuery(api.rides.openRides);
  const myTrips = useQuery(api.rides.myRides);
  const saveProfile = useMutation(api.drivers.saveProfile);
  const setOnline = useMutation(api.drivers.setOnline);
  const updateLocation = useMutation(api.drivers.updateLocation);
  const acceptRide = useMutation(api.rides.acceptRide);
  const updateRideStatus = useMutation(api.rides.updateRideStatus);

  const [form, setForm] = useState({
    name: user?.name ?? "",
    vehicleNo: "",
    phone: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Id<"rides"> | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"duty" | "history">("duty");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [justCompleted, setJustCompleted] = useState<{
    fare: number;
    distanceKm: number;
  } | null>(null);

  const ride = activeRide ?? null;
  const online = myProfile?.online ?? false;

  // ---- simulated live drive ----------------------------------------------
  const locationRef = useRef<{ lat: number; lng: number }>(myProfile?.location ?? null);
  useEffect(() => {
    if (myProfile) locationRef.current = myProfile.location;
  }, [myProfile]);

  const [leg, setLeg] = useState<{
    from: [number, number];
    to: [number, number];
    progress: number;
  } | null>(null);

  // Start a drive leg whenever a ride moves into accepted / in_progress,
  // respecting the scheduled pickup time (auto-starts when it arrives).
  useEffect(() => {
    if (!online || !ride) {
      setLeg(null);
      return;
    }
    const target =
      ride.status === "in_progress"
        ? ([ride.dropoff.lat, ride.dropoff.lng] as [number, number])
        : ride.status === "matched"
          ? ([ride.pickup.lat, ride.pickup.lng] as [number, number])
          : null;
    if (!target) {
      setLeg(null);
      return;
    }
    const startLeg = () => {
      const from = locationRef.current ?? { lat: GOTEGAON.lat, lng: GOTEGAON.lng };
      setLeg({ from: [from.lat, from.lng], to: target, progress: 0 });
    };
    const delay = ride.scheduledFor ? Math.max(0, ride.scheduledFor - Date.now()) : 0;
    if (delay > 0) {
      setLeg(null);
      const t = window.setTimeout(startLeg, delay + 2000);
      return () => window.clearTimeout(t);
    }
    startLeg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, ride?._id, ride?.status]);

  useEffect(() => {
    if (!leg || !ride) return;
    const interval = window.setInterval(() => {
      const next = Math.min(1, leg.progress + 0.06);
      const lat = leg.from[0] + (leg.to[0] - leg.from[0]) * next;
      const lng = leg.from[1] + (leg.to[1] - leg.from[1]) * next;
      void updateLocation({ lat, lng });
      locationRef.current = { lat, lng };
      if (next >= 1) {
        window.clearInterval(interval);
        if (ride.status === "matched") {
          void updateRideStatus({ rideId: ride._id, status: "arriving" });
        } else if (ride.status === "in_progress") {
          void updateRideStatus({ rideId: ride._id, status: "completed" });
          setJustCompleted({ fare: ride.fare, distanceKm: ride.distanceKm });
          window.setTimeout(() => setJustCompleted(null), 7000);
        }
        setLeg(null);
      } else {
        setLeg({ from: leg.from, to: leg.to, progress: next });
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [leg, ride, updateLocation, updateRideStatus]);

  // Gentle drift while online & idle so the marker stays fresh on the rider map.
  useEffect(() => {
    if (!online || ride) return;
    const hb = window.setInterval(() => {
      const base = locationRef.current ?? { lat: GOTEGAON.lat, lng: GOTEGAON.lng };
      const lat = base.lat + (Math.random() - 0.5) * 0.0012;
      const lng = base.lng + (Math.random() - 0.5) * 0.0012;
      void updateLocation({ lat, lng });
      locationRef.current = { lat, lng };
    }, 8000);
    return () => window.clearInterval(hb);
  }, [online, ride, updateLocation]);

  // ---- actions ------------------------------------------------------------
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await saveProfile({ name: form.name, vehicleNo: form.vehicleNo, phone: form.phone });
      toast.success("Driver profile created — welcome to SAWAARI.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save profile.");
    }
    setSavingProfile(false);
  };

  /** Save (or clear) the WhatsApp number from the profile card. */
  const handleSavePhone = async () => {
    if (!myProfile) return;
    setSavingPhone(true);
    try {
      await saveProfile({
        name: myProfile.name,
        vehicleNo: myProfile.vehicleNo,
        phone: phoneDraft.trim(),
      });
      setEditingPhone(false);
      toast.success(
        phoneDraft.trim()
          ? "WhatsApp number saved — customers can now chat with you."
          : "WhatsApp number removed.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the number.");
    }
    setSavingPhone(false);
  };

  const handleToggleOnline = async (next: boolean) => {
    try {
      await setOnline({ online: next });
      if (next) {
        const base = myProfile?.location ?? { lat: GOTEGAON.lat, lng: GOTEGAON.lng };
        await updateLocation({ lat: base.lat, lng: base.lng });
        toast.success("You're online — ride requests will stream in live.");
      } else {
        toast.info("You're offline.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const handleAccept = async (rideId: Id<"rides">) => {
    try {
      await acceptRide({ rideId });
      setSelectedRequest(null);
      toast.success("Booking accepted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't accept the booking.");
    }
  };

  const handleStatus = async (status: "arriving" | "in_progress" | "completed") => {
    if (!ride) return;
    try {
      await updateRideStatus({ rideId: ride._id, status });
      if (status === "completed") {
        setJustCompleted({ fare: ride.fare, distanceKm: ride.distanceKm });
        window.setTimeout(() => setJustCompleted(null), 7000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the trip.");
    }
  };

  // ---- map data -----------------------------------------------------------
  const focusRequest =
    !ride && selectedRequest
      ? (openRequests ?? []).find((r) => r._id === selectedRequest) ?? null
      : null;

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (ride) {
      list.push({ id: "pickup", kind: "pickup", position: [ride.pickup.lat, ride.pickup.lng] });
      list.push({ id: "dropoff", kind: "dropoff", position: [ride.dropoff.lat, ride.dropoff.lng] });
    } else if (focusRequest) {
      list.push({ id: "pickup", kind: "pickup", position: [focusRequest.pickup.lat, focusRequest.pickup.lng] });
      list.push({ id: "dropoff", kind: "dropoff", position: [focusRequest.dropoff.lat, focusRequest.dropoff.lng] });
    }
    if (online && myProfile?.location) {
      list.push({
        id: "me",
        kind: "driver",
        position: [myProfile.location.lat, myProfile.location.lng],
        label: myProfile.name,
      });
    }
    return list;
  }, [ride, focusRequest, online, myProfile]);

  // Real road route (OSRM) once the trip is active; fall back to the curved
  // estimate while it loads or when previewing a request.
  const roadRoute = useRoadRoute(
    ride ? ride.pickup : null,
    ride ? ride.dropoff : null,
    Boolean(ride),
  );
  const route = useMemo(() => {
    if (ride) return roadRoute ?? buildRoutePath(ride.pickup, ride.dropoff);
    if (focusRequest) return buildRoutePath(focusRequest.pickup, focusRequest.dropoff);
    return undefined;
  }, [ride, roadRoute, focusRequest]);

  // Live approach vector: this driver's own position → pickup while heading
  // over — the same vector the rider sees, kept in sync over the live stream.
  const approachRoute = useMemo(() => {
    if (!ride || !myProfile?.location) return undefined;
    if (!["matched", "arriving"].includes(ride.status)) return undefined;
    return buildRoutePath(myProfile.location, ride.pickup);
  }, [ride, myProfile?.location]);

  const focusKey = ride
    ? `ride-${ride._id}-${ride.status}-${myProfile?.location?.lat ?? ""}`
    : focusRequest
      ? `req-${focusRequest._id}`
      : "idle";

  const displayName = myProfile?.name ?? user?.name ?? user?.email?.split("@")[0] ?? "Guest";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppShell mode="driver" onSwitchMode={(m: DashMode) => navigate(`/app/${m}`)} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Map */}
        <main className="relative h-[40vh] lg:order-2 lg:h-auto lg:flex-1">
          <SawaariMap
            center={[GOTEGAON.lat, GOTEGAON.lng]}
            zoom={13}
            markers={markers}
            route={route}
            approachRoute={approachRoute}
            focusKey={focusKey}
            className="h-full"
          />
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-xl",
                online
                  ? "border-emerald-400/30 bg-slate-950/75 text-emerald-300"
                  : "border-white/15 bg-slate-950/75 text-slate-400",
              )}
            >
              {online ? (
                <>
                  <span className="relative mr-1.5 inline-flex size-1.5 align-middle">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Online · receiving requests
                </>
              ) : (
                "Offline — go online to receive requests"
              )}
            </span>
          </div>
        </main>

        {/* Panel */}
        <aside className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 bg-slate-950/60 backdrop-blur-xl lg:order-1 lg:w-[400px] lg:flex-none lg:border-r lg:border-t-0 xl:w-[430px]">
          <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
            {!myProfile ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
                    <CarFront className="size-5" />
                  </span>
                  <div>
                    <h1 className="font-display text-base font-semibold text-white">
                      Driver profile
                    </h1>
                    <p className="text-[11px] text-slate-400">
                      One profile to accept bookings across the city.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="border-white/10 bg-white/5 text-slate-200 placeholder:text-slate-500"
                  />
                  <Input
                    value={form.vehicleNo}
                    onChange={(e) => setForm({ ...form, vehicleNo: e.target.value.toUpperCase() })}
                    placeholder="Vehicle no. (e.g. KA 01 EV 4821)"
                    className="border-white/10 bg-white/5 text-slate-200 placeholder:text-slate-500"
                  />
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="WhatsApp number (e.g. 98765 43210) — optional"
                    inputMode="tel"
                    className="border-white/10 bg-white/5 text-slate-200 placeholder:text-slate-500"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={savingProfile || !form.name.trim() || !form.vehicleNo.trim()}
                    className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  >
                    {savingProfile ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-4" />
                    )}
                    Create profile
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-11 ring-2 ring-emerald-400/40">
                      <AvatarFallback className="bg-emerald-400/15 text-base font-bold text-emerald-300">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Zap className="size-3 text-emerald-300" />
                        {myProfile.vehicleNo} · EV rickshaw
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          online ? "text-emerald-300" : "text-slate-500",
                        )}
                      >
                        {online ? "Online" : "Offline"}
                      </span>
                      <Switch
                        checked={online}
                        onCheckedChange={(v) => void handleToggleOnline(v)}
                        aria-label="Toggle online status"
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="Trips" value={String(myProfile.trips)} />
                    <Stat label="Rating" value={`${myProfile.rating}★`} />
                    <Stat label="Vehicle" value="EV" accent />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/5">
                    {editingPhone ? (
                      <>
                        <input
                          value={phoneDraft}
                          onChange={(e) => setPhoneDraft(e.target.value)}
                          placeholder="WhatsApp number"
                          inputMode="tel"
                          autoFocus
                          className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSavePhone()}
                          disabled={savingPhone}
                          className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {savingPhone ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
                          <MessageCircle className="size-3.5 shrink-0 text-emerald-300" />
                          {myProfile.phone ? (
                            <span className="truncate font-semibold text-slate-200">
                              +91 {myProfile.phone.slice(2).replace(/(\d{5})(\d{5})/, "$1 $2")}
                            </span>
                          ) : (
                            <span className="truncate">
                              Add a WhatsApp number so customers can chat with you
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneDraft(myProfile.phone ?? "");
                            setEditingPhone(true);
                          }}
                          className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-300 transition-colors hover:text-emerald-200"
                        >
                          <Pencil className="size-3" />
                          {myProfile.phone ? "Edit" : "Add"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {justCompleted && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                    <CheckCircle2 className="size-6 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Trip completed</p>
                      <p className="text-[11px] text-emerald-300/90">
                        {formatINR(justCompleted.fare)} earned · {formatKm(justCompleted.distanceKm)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                  {(
                    [
                      { id: "duty", label: "Duty" },
                      { id: "history", label: "Trip history" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPanelTab(t.id)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all",
                        panelTab === t.id
                          ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                          : "text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {t.id === "history" && <History className="size-3.5" />}
                      {t.label}
                    </button>
                  ))}
                </div>

                {panelTab === "history" ? (
                  <TripHistory trips={myTrips ?? []} perspective="driver" />
                ) : ride ? (
                  <DriverRideCard
                    ride={ride}
                    chatOpen={chatOpen}
                    setChatOpen={setChatOpen}
                    onStatus={(s) => void handleStatus(s)}
                    userId={user?._id ?? ""}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-sm font-semibold text-white">
                        Live bookings
                      </h2>
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                        <span className="relative flex size-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                        </span>
                        {openRequests?.length ?? 0} waiting
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Broadcasting within 5 km of your location — new requests
                      stream in live, no refresh needed.
                    </p>

                    {!online ? (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-xs text-slate-500">
                        <MapPin className="mx-auto mb-2 size-5 text-slate-600" />
                        Go online to see customer bookings stream in live.
                      </div>
                    ) : (openRequests ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center text-xs text-slate-500">
                        <Navigation className="mx-auto mb-2 size-5 text-slate-600" />
                        No bookings right now. As soon as a customer books, it
                        appears here instantly — no refresh needed.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {(openRequests ?? []).map((r) => {
                          const selected = selectedRequest === r._id;
                          const scheduled = r.scheduledFor && r.scheduledFor > Date.now();
                          return (
                            <button
                              key={r._id}
                              type="button"
                              onClick={() => setSelectedRequest(r._id)}
                              className={cn(
                                "w-full rounded-2xl border p-3.5 text-left transition-all",
                                selected
                                  ? "border-emerald-400/40 bg-emerald-400/10"
                                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {r.riderName}
                                </p>
                                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                                  {formatINR(r.fare)}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                                  {vehicleById(r.vehicleType).name}
                                </span>
                                {scheduled && (
                                  <span className="flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                    <CalendarClock className="size-3" />
                                    {format(new Date(r.scheduledFor!), "h:mm a")}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2.5 space-y-1.5 text-[12px]">
                                <p className="flex items-start gap-2 text-slate-300">
                                  <span className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-400" />
                                  <span className="truncate">{r.pickup.address}</span>
                                </p>
                                <p className="flex items-start gap-2 text-slate-300">
                                  <span className="mt-0.5 size-2 shrink-0 rounded-[3px] bg-rose-400" />
                                  <span className="truncate">{r.dropoff.address}</span>
                                </p>
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-[11px] text-slate-500">
                                  {formatKm(r.distanceKm)} trip ·{" "}
                                  {formatKm(
                                    haversineKm(
                                      myProfile?.location ?? GOTEGAON,
                                      r.pickup,
                                    ),
                                  )}{" "}
                                  from you
                                </span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleAccept(r._id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void handleAccept(r._id);
                                    }
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-emerald-950 transition-all hover:bg-emerald-400 active:scale-95"
                                >
                                  Accept <ArrowUpCircle className="size-3.5 rotate-45" />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-950/50 px-3 py-2.5 text-center ring-1 ring-white/5">
      <p className={cn("font-display text-lg font-semibold", accent ? "text-emerald-300" : "text-white")}>
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function DriverRideCard({
  ride,
  chatOpen,
  setChatOpen,
  onStatus,
  userId,
}: {
  ride: Doc<"rides">;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  onStatus: (s: "arriving" | "in_progress" | "completed") => void;
  userId: string;
}) {
  const vehicle = vehicleById(ride.vehicleType);
  const scheduled = ride.scheduledFor && ride.scheduledFor > Date.now();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Active booking
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {ride.riderName} · {vehicle.name} · {formatINR(ride.fare)}
            </p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
              ride.paid
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/15 bg-white/5 text-slate-400",
            )}
          >
            {ride.paid ? "Paid" : "Due"}
          </span>
        </div>

        <StatusTimeline status={ride.status} />

        <div className="mt-3 space-y-1.5 text-[12px]">
          <p className="flex items-start gap-2 text-slate-300">
            <span className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-400" />
            <span className="truncate">{ride.pickup.address}</span>
          </p>
          <p className="flex items-start gap-2 text-slate-300">
            <span className="mt-0.5 size-2 shrink-0 rounded-[3px] bg-rose-400" />
            <span className="truncate">{ride.dropoff.address}</span>
          </p>
        </div>

        {scheduled && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-300">
            <CalendarClock className="size-3.5" />
            Pickup scheduled for {format(new Date(ride.scheduledFor!), "h:mm a")} — you'll
            be notified when it's time to leave.
          </p>
        )}

        <div className="mt-4 grid gap-2">
          {ride.status === "matched" && (
            <Button
              type="button"
              onClick={() => onStatus("arriving")}
              className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            >
              <Flag className="size-4" /> Arrived at pickup
            </Button>
          )}
          {ride.status === "arriving" && (
            <Button
              type="button"
              onClick={() => onStatus("in_progress")}
              className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            >
              <Play className="size-4" /> Start trip
            </Button>
          )}
          {ride.status === "in_progress" && (
            <Button
              type="button"
              onClick={() => onStatus("completed")}
              className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            >
              <CheckCircle2 className="size-4" /> Complete trip
            </Button>
          )}
          {(ride.status === "matched" || ride.status === "in_progress") && !scheduled && (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <Zap className="size-3 text-emerald-300" />
              {ride.status === "matched"
                ? "Driving to pickup — your customer sees you move live"
                : "On the way — the customer is tracking you in real time"}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-200 transition-colors hover:text-emerald-300"
          >
            <MessageSquare className="size-4 text-emerald-300" />
            Message the customer
          </button>
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-300">
            <Wallet className="size-3" /> {formatINR(ride.fare)}
          </span>
        </div>
        {chatOpen && (
          <ChatPanel rideId={ride._id} selfUserId={userId} className="min-h-[220px] flex-1" />
        )}
      </div>
    </div>
  );
}
