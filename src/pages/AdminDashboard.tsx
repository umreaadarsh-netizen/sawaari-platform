import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, DashMode } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SawaariLogo } from "@/components/SawaariLogo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { format, formatDistanceToNow } from "date-fns";
import { formatINR } from "@/lib/geo";
import { vehicleById, type FleetVehicle } from "@/lib/fleet";
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  CircleDollarSign,
  Landmark,
  LayoutGrid,
  Loader2,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  matched: "Matched",
  arriving: "Arrived",
  in_progress: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CLS: Record<string, string> = {
  requested: "bg-orange-400/15 text-orange-300",
  matched: "bg-amber-400/15 text-amber-300",
  arriving: "bg-amber-400/15 text-amber-300",
  in_progress: "bg-sky-400/15 text-sky-300",
  completed: "bg-white/10 text-slate-300",
  cancelled: "bg-rose-400/15 text-rose-300",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const becomeAdmin = useMutation(api.admin.becomeAdmin);
  const [claiming, setClaiming] = useState(false);

  if (!isAdmin) {
    const handleClaim = async () => {
      setClaiming(true);
      try {
        await becomeAdmin();
        toast.success("You are now the SAWAARI administrator.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't claim admin access.");
      }
      setClaiming(false);
    };

    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#070b14]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[380px] w-[640px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[130px]" />
          <div className="grain absolute inset-0" />
        </div>
        <div className="relative flex items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="transition-opacity hover:opacity-80"
          >
            <SawaariLogo markClassName="size-8" />
          </button>
          <Button
            variant="ghost"
            onClick={() => navigate("/app/rider")}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="size-4" /> Back to app
          </Button>
        </div>
        <div className="relative flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-2xl">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
              <ShieldCheck className="size-7" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-white">
              Administrator access
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              SAWAARI workspaces have a single administrator who manages
              bookings, drivers, the fleet catalogue and customer accounts.
              If you're setting this up for your business, claim it now.
            </p>
            <Button
              type="button"
              onClick={() => void handleClaim()}
              disabled={claiming}
              className="mt-6 w-full bg-amber-400 py-6 text-[15px] font-semibold text-amber-950 shadow-xl shadow-amber-500/25 hover:bg-amber-300"
            >
              {claiming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Claim administrator role
            </Button>
            <p className="mt-3 text-[11px] text-slate-500">
              Only the first claim succeeds; admins can grant the role later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppShell mode="admin" onSwitchMode={(m: DashMode) => navigate(`/app/${m}`)} />
      <AdminWorkspace />
    </div>
  );
}

function AdminWorkspace() {
  const stats = useQuery(api.admin.adminStats);
  const [filter, setFilter] = useState("all");

  const statCards = useMemo(
    () =>
      stats
        ? [
            { label: "Revenue", value: formatINR(stats.revenue), icon: CircleDollarSign, accent: true },
            { label: "Platform fees", value: formatINR(stats.platformRevenue), icon: Landmark, accent: true },
            { label: "Driver payouts", value: formatINR(stats.driverPayouts), icon: Wallet },
            { label: "Active bookings", value: String(stats.activeRides), icon: Ticket },
            { label: "Completed", value: String(stats.completedRides), icon: BadgeCheck },
            { label: "Drivers online", value: `${stats.onlineDrivers}/${stats.totalDrivers}`, icon: CarFront },
            { label: "Customers", value: String(stats.totalUsers), icon: Users },
            { label: "Total bookings", value: String(stats.totalRides), icon: LayoutGrid },
          ]
        : [],
    [stats],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Admin console
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
            Manage your fleet
          </h1>
          <p className="text-sm text-slate-400">
            Bookings, drivers, the catalogue and customer accounts — all in one place.
          </p>
        </div>

        {/* stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map(({ label, value, icon: Icon, accent }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl"
            >
              <Icon
                className={cn("size-4", accent ? "text-amber-300" : "text-slate-500")}
              />
              <p
                className={cn(
                  "mt-2 font-display text-xl font-semibold",
                  accent ? "text-amber-300" : "text-white",
                )}
              >
                {value}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* commission ledger — the 75/25 split, straight from the receipts */}
        {stats && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Commission ledger · 75 / 25
              </p>
              <span className="text-[11px] text-slate-400">
                {formatINR(stats.faresCollected)} collected across {stats.paidRides}{" "}
                settled ride{stats.paidRides === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="w-[75%] rounded-full bg-amber-400/90" />
              <div className="flex-1 rounded-full bg-amber-400/25" />
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                <p className="text-slate-500">Fares collected</p>
                <p className="mt-0.5 font-display text-base font-semibold text-white">
                  {formatINR(stats.faresCollected)}
                </p>
              </div>
              <div className="rounded-lg bg-amber-400/5 px-3 py-2 ring-1 ring-amber-400/15">
                <p className="text-slate-400">Driver payouts · 75%</p>
                <p className="mt-0.5 font-display text-base font-semibold text-amber-300">
                  {formatINR(stats.driverPayouts)}
                </p>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                <p className="text-slate-400">Platform retained · 25%</p>
                <p className="mt-0.5 font-display text-base font-semibold text-white">
                  {formatINR(stats.platformRevenue)}
                </p>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="bookings" className="mt-8">
          <TabsList className="border border-white/10 bg-white/5 text-slate-400">
            <TabsTrigger value="bookings" className="data-[state=active]:bg-amber-400/15 data-[state=active]:text-amber-300">
              Bookings
            </TabsTrigger>
            <TabsTrigger value="drivers" className="data-[state=active]:bg-amber-400/15 data-[state=active]:text-amber-300">
              Drivers
            </TabsTrigger>
            <TabsTrigger value="fleet" className="data-[state=active]:bg-amber-400/15 data-[state=active]:text-amber-300">
              Fleet catalogue
            </TabsTrigger>
            <TabsTrigger value="customers" className="data-[state=active]:bg-amber-400/15 data-[state=active]:text-amber-300">
              Customers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="mt-4">
            <BookingsTab filter={filter} setFilter={setFilter} />
          </TabsContent>
          <TabsContent value="drivers" className="mt-4">
            <DriversTab />
          </TabsContent>
          <TabsContent value="fleet" className="mt-4">
            <FleetTab />
          </TabsContent>
          <TabsContent value="customers" className="mt-4">
            <CustomersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---- bookings -------------------------------------------------------------

function BookingsTab({
  filter,
  setFilter,
}: {
  filter: string;
  setFilter: (f: string) => void;
}) {
  const rides = useQuery(api.admin.listAllRides, { status: filter === "all" ? undefined : filter });
  const cancelRide = useMutation(api.admin.adminCancelRide);
  const ACTIVE = ["requested", "matched", "arriving", "in_progress"];

  const filters = ["all", "requested", "matched", "in_progress", "completed", "cancelled"];

  const handleCancel = async (rideId: Id<"rides">) => {
    try {
      await cancelRide({ rideId });
      toast.info("Booking cancelled by administrator.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel.");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 p-3">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-all",
              filter === f
                ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            {f === "all" ? "All" : STATUS_LABEL[f] ?? f}
          </button>
        ))}
      </div>
      <div className="divide-y divide-white/5">
        {(rides ?? []).length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500">No bookings match this filter.</p>
        )}
        {(rides ?? []).map((r) => (
          <div key={r._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">
                {r.pickup.address} → {r.dropoff.address}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {format(new Date(r.createdAt), "d MMM, h:mm a")} · {vehicleById(r.vehicleType).name} ·{" "}
                {r.riderName}
                {r.driverName ? ` · ${r.driverName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  STATUS_CLS[r.status] ?? "bg-white/10 text-slate-400",
                )}
              >
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  r.paid ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-slate-500",
                )}
              >
                {r.paid ? "Paid" : "Due"}
              </span>
              <span className="w-14 text-right text-xs font-semibold text-slate-200">
                {formatINR(r.fare)}
              </span>
              {ACTIVE.includes(r.status) && (
                <button
                  type="button"
                  onClick={() => void handleCancel(r._id)}
                  className="rounded-full border border-rose-400/25 bg-rose-400/10 p-1.5 text-rose-300 transition-colors hover:bg-rose-400/20"
                  title="Cancel booking"
                >
                  <XCircle className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- drivers --------------------------------------------------------------

function DriversTab() {
  const drivers = useQuery(api.admin.listAllDrivers);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="divide-y divide-white/5">
        {(drivers ?? []).length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500">
            No drivers have created profiles yet.
          </p>
        )}
        {(drivers ?? []).map((d) => (
          <div key={d._id} className="flex items-center gap-4 px-4 py-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full text-xs font-bold",
                d.online
                  ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
                  : "bg-white/5 text-slate-400 ring-1 ring-white/10",
              )}
            >
              {d.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                {d.name}
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    d.online
                      ? "bg-amber-400/15 text-amber-300"
                      : "bg-white/5 text-slate-500",
                  )}
                >
                  {d.online ? "Online" : "Offline"}
                </span>
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                <Zap className="size-3 text-amber-300" /> {d.vehicleNo} · EV rickshaw
              </p>
            </div>
            <div className="flex items-center gap-5 text-right">
              <div>
                <p className="text-sm font-semibold text-white">{d.trips}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Trips</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{d.rating}★</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Rating</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(d.lastSeen), { addSuffix: true })}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Last seen</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- fleet ----------------------------------------------------------------

function FleetTab() {
  const fleet = useQuery(api.fleet.listFleet);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Wrench className="size-3.5 text-amber-300" />
        Edits here override the built-in catalogue and apply to every customer
        booking immediately.
      </p>
      {(fleet ?? []).map((v) => (
        <FleetRow key={v.id} vehicle={v} />
      ))}
    </div>
  );
}

function FleetRow({ vehicle }: { vehicle: FleetVehicle }) {
  const save = useMutation(api.fleet.saveFleetVehicle);
  const setEnabled = useMutation(api.fleet.setVehicleEnabled);
  const [draft, setDraft] = useState<FleetVehicle>(vehicle);
  const [saving, setSaving] = useState(false);

  const dirty =
    draft.name !== vehicle.name ||
    draft.tagline !== vehicle.tagline ||
    draft.seats !== vehicle.seats ||
    draft.baseFare !== vehicle.baseFare ||
    draft.perKm !== vehicle.perKm ||
    draft.minFare !== vehicle.minFare;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ ...draft, enabled: vehicle.enabled, sort: vehicle.sort });
      toast.success(`${draft.name} updated in the catalogue.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full bg-transparent font-display text-base font-semibold text-white focus:outline-none"
          />
          <input
            value={draft.tagline}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            className="w-full bg-transparent text-xs text-slate-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500">Available</span>
          <Switch
            checked={vehicle.enabled}
            onCheckedChange={(v) => void setEnabled({ id: vehicle.id, enabled: v })}
            aria-label={`Toggle ${vehicle.name}`}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="Base fare (₹)" value={draft.baseFare} onChange={(n) => setDraft({ ...draft, baseFare: n })} />
        <Field label="Per km (₹)" value={draft.perKm} onChange={(n) => setDraft({ ...draft, perKm: n })} />
        <Field label="Minimum (₹)" value={draft.minFare} onChange={(n) => setDraft({ ...draft, minFare: n })} />
        <Field label="Seats" value={draft.seats} onChange={(n) => setDraft({ ...draft, seats: n })} />
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
            className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:from-amber-300 hover:to-orange-400"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <Input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="mt-1 h-9 border-white/10 bg-white/5 text-xs text-slate-200"
      />
    </label>
  );
}

// ---- customers ------------------------------------------------------------

function CustomersTab() {
  const { user } = useAuth();
  const customers = useQuery(api.admin.listAllUsers);
  const setRole = useMutation(api.admin.setUserRole);

  const handleRole = async (userId: Id<"users">, makeAdmin: boolean) => {
    try {
      await setRole({ userId, role: makeAdmin ? "admin" : "user" });
      toast.success(makeAdmin ? "Administrator role granted." : "Role removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the role.");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="divide-y divide-white/5">
        {(customers ?? []).length === 0 && (
          <p className="p-8 text-center text-xs text-slate-500">No customers yet.</p>
        )}
        {(customers ?? []).map((c) => (
          <div key={c._id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">
                {c.name ?? c.email ?? "Guest"}
                {c._id === user?._id && (
                  <span className="ml-2 text-[10px] font-semibold text-amber-300">(you)</span>
                )}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {c.email ?? "Anonymous guest"}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                c.role === "admin"
                  ? "bg-sky-400/15 text-sky-300"
                  : "bg-white/5 text-slate-400",
              )}
            >
              {c.role === "admin" ? "Admin" : "Customer"}
            </span>
            {c._id !== user?._id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRole(c._id, c.role !== "admin")}
                className="border-white/10 bg-white/5 text-xs text-slate-300 hover:text-white"
              >
                {c.role === "admin" ? "Remove admin" : "Make admin"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
