import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { GOTEGAON, buildRoutePath, formatINR, formatKm, haversineKm, splitFare } from "@/lib/geo";
import { useRoadRoute } from "@/hooks/use-road-route";
import { useNow } from "@/hooks/use-now";
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
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  MessageCircle,
  Navigation,
  Pencil,
  Play,
  Star,
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
  const wallet = useQuery(api.wallet.myWallet);
  const feedback = useQuery(api.ratings.driverRatings);
  const connect = useQuery(api.stripeQueries.myConnectAccount);
  const payouts = useQuery(api.wallet.myPayouts);
  const saveProfile = useMutation(api.drivers.saveProfile);
  const setOnline = useMutation(api.drivers.setOnline);
  const updateLocation = useMutation(api.drivers.updateLocation);
  const acceptRide = useMutation(api.rides.acceptRide);
  const updateRideStatus = useMutation(api.rides.updateRideStatus);
  const createConnectAccount = useAction(api.stripe.createConnectAccount);
  const getConnectAccountLink = useAction(api.stripe.getConnectAccountLink);
  const requestPayout = useAction(api.stripe.requestPayout);

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
    driverShare: number;
    platformShare: number;
  } | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);

  // ---- Stripe Connect onboarding + payouts --------------------------------
  const handleConnect = async () => {
    setOnboarding(true);
    try {
      const { url } = await createConnectAccount({
        origin: window.location.origin,
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start Stripe onboarding.");
      setOnboarding(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setOnboarding(true);
    try {
      const { url } = await getConnectAccountLink({
        origin: window.location.origin,
      });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open Stripe onboarding.");
      setOnboarding(false);
    }
  };

  const handleRequestPayout = async () => {
    setPayoutBusy(true);
    try {
      const res = await requestPayout();
      toast.success(
        `Payout of ${formatINR(res.amountPaise / 100)} initiated — on its way to your bank.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payout failed.");
    }
    setPayoutBusy(false);
  };

  const ride = activeRide ?? null;
  const online = myProfile?.online ?? false;
  const now = useNow();

  // rideId → stars this driver earned, so trip history can show them.
  const ratingsByRide = useMemo(() => {
    const map: Record<string, number> = {};
    (feedback ?? []).forEach((f) => {
      map[f.rideId] = f.rating;
    });
    return map;
  }, [feedback]);

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

  // Where a drive leg points right now: pickup while matched, drop-off while
  // in progress — null outside those states (or without a ride).
  const legTarget = useMemo(() => {
    if (!ride) return null;
    if (ride.status === "in_progress")
      return [ride.dropoff.lat, ride.dropoff.lng] as [number, number];
    if (ride.status === "matched")
      return [ride.pickup.lat, ride.pickup.lng] as [number, number];
    return null;
  }, [ride]);

  // A leg is only live while online with a real target; deriving it in render
  // keeps the "no leg" state in sync without resetting state inside an effect.
  const activeLeg = online && legTarget ? leg : null;

  // Start a drive leg whenever a ride moves into matched / in_progress,
  // respecting the scheduled pickup time (auto-starts when it arrives).
  useEffect(() => {
    if (!online || !legTarget) return;
    const startLeg = () => {
      const from = locationRef.current ?? { lat: GOTEGAON.lat, lng: GOTEGAON.lng };
      setLeg({ from: [from.lat, from.lng], to: legTarget, progress: 0 });
    };
    const delay = ride?.scheduledFor ? Math.max(0, ride.scheduledFor - Date.now()) : 0;
    if (delay > 0) {
      const t = window.setTimeout(startLeg, delay + 2000);
      return () => window.clearTimeout(t);
    }
    startLeg();
  }, [online, legTarget, ride?.scheduledFor]);

  useEffect(() => {
    if (!activeLeg || !ride) return;
    const interval = window.setInterval(() => {
      const next = Math.min(1, activeLeg.progress + 0.06);
      const lat = activeLeg.from[0] + (activeLeg.to[0] - activeLeg.from[0]) * next;
      const lng = activeLeg.from[1] + (activeLeg.to[1] - activeLeg.from[1]) * next;
      void updateLocation({ lat, lng });
      locationRef.current = { lat, lng };
      if (next >= 1) {
        window.clearInterval(interval);
        if (ride.status === "matched") {
          // Arrived at pickup — the driver then enters the pickup code the
          // customer shows to start the trip.
          void updateRideStatus({ rideId: ride._id, status: "arriving" });
        }
        // At the drop-off the leg simply ends: the trip stays in progress until
        // the driver enters the completion code shared by the customer.
        setLeg(null);
      } else {
        setLeg({ from: activeLeg.from, to: activeLeg.to, progress: next });
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeLeg, ride, updateLocation, updateRideStatus]);

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

  const handleStatus = async (
    status: "arriving" | "in_progress" | "completed",
    otp?: string,
  ) => {
    if (!ride) return;
    try {
      await updateRideStatus({ rideId: ride._id, status, otp });
      if (status === "completed") {
        const split = splitFare(ride.fare);
        setJustCompleted({
          fare: ride.fare,
          distanceKm: ride.distanceKm,
          driverShare: split.driverShare,
          platformShare: split.platformShare,
        });
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
  const myLocation = myProfile?.location;
  const approachRoute = useMemo(() => {
    if (!ride || !myLocation) return undefined;
    if (!["matched", "arriving"].includes(ride.status)) return undefined;
    return buildRoutePath(myLocation, ride.pickup);
  }, [ride, myLocation]);

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
                  <p className="mt-1.5 text-center text-[10px] text-slate-500">
                    {myProfile.ratingCount ?? 0} rider rating
                    {(myProfile.ratingCount ?? 0) === 1 ? "" : "s"} · updated live
                  </p>

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

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <Wallet className="size-3.5 text-emerald-300" />
                      Earnings wallet
                    </p>
                    <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      75 / 25 split
                    </span>
                  </div>
                  <p className="mt-2 font-display text-2xl font-semibold text-white">
                    {formatINR(wallet?.driverEarnings ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Your 75% net earnings across {wallet?.settledRides ?? 0}{" "}
                    settled trip{(wallet?.settledRides ?? 0) === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="w-[75%] rounded-full bg-emerald-400" />
                    <div className="flex-1 rounded-full bg-white/15" />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-emerald-300">
                      You get 75% · {formatINR(wallet?.driverEarnings ?? 0)}
                    </span>
                    <span className="text-slate-500">
                      Platform fee 25% · {formatINR(wallet?.platformRetained ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <ArrowUpCircle className="size-3.5 text-emerald-300" />
                      Stripe payouts
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        connect?.payoutsEnabled
                          ? "bg-emerald-400/10 text-emerald-300"
                          : connect?.accountId
                            ? "bg-amber-400/10 text-amber-300"
                            : "bg-white/5 text-slate-400",
                      )}
                    >
                      {connect?.payoutsEnabled
                        ? "Ready"
                        : connect?.accountId
                          ? "Onboarding"
                          : "Not connected"}
                    </span>
                  </div>

                  {!connect ? (
                    <>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        Connect a Stripe account to have your 75% earnings paid
                        straight to your bank on withdrawal.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleConnect()}
                        disabled={onboarding}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-60"
                      >
                        {onboarding ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="size-3.5 text-emerald-300" />
                        )}
                        {onboarding ? "Opening Stripe…" : "Connect with Stripe"}
                      </button>
                    </>
                  ) : !connect.payoutsEnabled ? (
                    <>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        Finish Stripe onboarding to enable bank payouts — you
                        can keep earning in the meantime.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleFinishOnboarding()}
                        disabled={onboarding}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400/15 px-4 py-3 text-xs font-semibold text-amber-300 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/25 disabled:opacity-60"
                      >
                        {onboarding ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="size-3.5" />
                        )}
                        {onboarding ? "Opening Stripe…" : "Complete Stripe onboarding"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Available to withdraw
                      </p>
                      <p className="mt-0.5 font-display text-xl font-semibold text-white">
                        {formatINR(wallet?.driverEarnings ?? 0)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleRequestPayout()}
                        disabled={
                          payoutBusy || (wallet?.driverEarnings ?? 0) < 50
                        }
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {payoutBusy ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />{" "}
                            Transferring…
                          </>
                        ) : (
                          <>
                            <ArrowUpCircle className="size-3.5" /> Withdraw{" "}
                            {formatINR(wallet?.driverEarnings ?? 0)}
                          </>
                        )}
                      </button>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                        Transfers land in your connected bank via Stripe Connect.
                      </p>
                    </>
                  )}

                  {(payouts ?? []).length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                      {(payouts ?? []).slice(0, 3).map((p) => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="text-slate-500">
                            {format(new Date(p.createdAt), "d MMM · h:mm a")}
                          </span>
                          <span className="font-semibold text-slate-200">
                            {formatINR(p.amountPaise / 100)}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              p.status === "paid"
                                ? "bg-emerald-400/10 text-emerald-300"
                                : p.status === "pending"
                                  ? "bg-amber-400/10 text-amber-300"
                                  : "bg-rose-400/10 text-rose-300",
                            )}
                          >
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <Star className="size-3.5 text-amber-300" />
                      Recent feedback
                    </p>
                    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      {(feedback ?? []).length}
                    </span>
                  </div>
                  {(feedback ?? []).length === 0 ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      No feedback yet — riders are prompted to rate you after
                      every completed trip. New ratings stream in live.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-2">
                      {(feedback ?? []).slice(0, 3).map((f) => (
                        <div
                          key={f._id}
                          className="rounded-xl bg-slate-950/50 px-3 py-2.5 ring-1 ring-white/5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[11px] font-semibold text-slate-200">
                              {f.riderName}
                            </p>
                            <span className="flex shrink-0 items-center gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                  key={i}
                                  className={cn(
                                    "size-3",
                                    i < f.rating
                                      ? "fill-amber-300 text-amber-300"
                                      : "text-slate-600",
                                  )}
                                />
                              ))}
                            </span>
                          </div>
                          {f.comment && (
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                              {f.comment}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] text-slate-600">
                            {format(new Date(f.createdAt), "d MMM · h:mm a")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {justCompleted && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                    <CheckCircle2 className="size-6 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Trip completed</p>
                      <p className="text-[11px] text-emerald-300/90">
                        You earned {formatINR(justCompleted.driverShare)} (75%) ·{" "}
                        {formatKm(justCompleted.distanceKm)} · platform fee{" "}
                        {formatINR(justCompleted.platformShare)} (25%)
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
                  <TripHistory
                    trips={myTrips ?? []}
                    perspective="driver"
                    ratings={ratingsByRide}
                  />
                ) : ride ? (
                  <DriverRideCard
                    key={ride.status}
                    ride={ride}
                    chatOpen={chatOpen}
                    setChatOpen={setChatOpen}
                    onStatus={(s, otp) => void handleStatus(s, otp)}
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
                          const scheduled = r.scheduledFor && r.scheduledFor > now;
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
  onStatus: (s: "arriving" | "in_progress" | "completed", otp?: string) => void;
  userId: string;
}) {
  const vehicle = vehicleById(ride.vehicleType);
  const now = useNow();
  const scheduled = ride.scheduledFor && ride.scheduledFor > now;
  // The 4-digit code the customer shows — entered to start / complete the trip.
  const [otp, setOtp] = useState("");
  // 75/25 commission breakdown — the server freezes it on the ride at
  // completion; fall back to the shared arithmetic for older rides.
  const split =
    ride.driverShare !== undefined && ride.platformShare !== undefined
      ? { driverShare: ride.driverShare, platformShare: ride.platformShare }
      : splitFare(ride.fare);

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

        {ride.status === "completed" && (
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400">Your net earnings · 75%</span>
              <span className="font-semibold text-emerald-300">
                {formatINR(split.driverShare)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">SAWAARI platform fee · 25%</span>
              <span className="font-semibold text-slate-300">
                {formatINR(split.platformShare)}
              </span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="w-[75%] rounded-full bg-emerald-400/80" />
              <div className="flex-1 rounded-full bg-white/15" />
            </div>
          </div>
        )}

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
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                <KeyRound className="size-3.5" /> Ask your customer for the pickup code
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                They'll show a 4-digit code on their phone — enter it to start the
                trip.
              </p>
              <div className="mt-2.5 flex gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  inputMode="numeric"
                  autoFocus
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-center font-mono text-lg font-bold tracking-[0.35em] text-white placeholder:text-slate-600 focus:border-emerald-400/50 focus:outline-none"
                />
                <Button
                  type="button"
                  onClick={() => onStatus("in_progress", otp)}
                  disabled={otp.length !== 4}
                  className="h-11 shrink-0 bg-emerald-500 px-4 text-emerald-950 hover:bg-emerald-400"
                >
                  <Play className="size-4" /> Start trip
                </Button>
              </div>
            </div>
          )}
          {ride.status === "in_progress" && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                <KeyRound className="size-3.5" /> Ask your customer for the completion code
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                At the drop-off they'll share a 4-digit code — enter it to complete
                the trip and settle the fare.
              </p>
              <div className="mt-2.5 flex gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  inputMode="numeric"
                  autoFocus
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-center font-mono text-lg font-bold tracking-[0.35em] text-white placeholder:text-slate-600 focus:border-amber-400/50 focus:outline-none"
                />
                <Button
                  type="button"
                  onClick={() => onStatus("completed", otp)}
                  disabled={otp.length !== 4}
                  className="h-11 shrink-0 bg-emerald-500 px-4 text-emerald-950 hover:bg-emerald-400"
                >
                  <CheckCircle2 className="size-4" /> Complete trip
                </Button>
              </div>
            </div>
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
