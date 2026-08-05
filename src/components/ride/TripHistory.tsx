import { useMemo, useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatINR, formatKm } from "@/lib/geo";
import { vehicleById } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarDays,
  CarFront,
  CheckCircle2,
  History,
  MapPin,
  Receipt,
  XCircle,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  requested: "Booked",
  accepted: "Assigned",
  arriving: "Arrived",
  in_progress: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function receiptId(rideId: string): string {
  return `SW-${rideId.slice(-6).toUpperCase()}`;
}

type Filter = "all" | "completed" | "cancelled";

/**
 * Full trip history log for a rider or driver: every past ride with its date,
 * route, vehicle, fare and receipt status. Completed rides carry their receipt
 * number, so this doubles as the receipt log.
 */
export function TripHistory({
  trips,
  perspective,
}: {
  trips: Doc<"rides">[];
  perspective: "rider" | "driver";
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (filter === "completed") return trips.filter((t) => t.status === "completed");
    if (filter === "cancelled") return trips.filter((t) => t.status === "cancelled");
    return trips;
  }, [trips, filter]);

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-white">
            <History className="size-4 text-emerald-300" />
            Trip history
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {trips.length} trip{trips.length === 1 ? "" : "s"} · receipts issued on
            every completed fare
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { id: "all", label: "All" },
            { id: "completed", label: "Completed" },
            { id: "cancelled", label: "Cancelled" },
          ] as { id: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
              filter === f.id
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <CalendarDays className="size-6 text-slate-600" />
          <p className="text-xs text-slate-500">
            {trips.length === 0
              ? "No trips yet. Your completed rides will appear here with their receipts."
              : "No trips match this filter."}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
          {rows.map((t) => {
            const vehicle = vehicleById(t.vehicleType);
            const done = t.status === "completed";
            const cancelled = t.status === "cancelled";
            return (
              <div
                key={t._id}
                className="rounded-2xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {perspective === "driver" && t.riderName ? (
                      <span className="flex items-center gap-1.5 text-slate-300 normal-case">
                        <MapPin className="size-3 text-emerald-300" />
                        {t.riderName}
                      </span>
                    ) : t.driverName ? (
                      <span className="flex items-center gap-1.5 text-slate-300 normal-case">
                        <CarFront className="size-3 text-emerald-300" />
                        {t.driverName}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1 text-slate-500">
                      · {format(new Date(t.createdAt), "EEE, d MMM yyyy · h:mm a")}
                    </span>
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      done
                        ? "bg-emerald-400/15 text-emerald-300"
                        : cancelled
                          ? "bg-rose-400/15 text-rose-300"
                          : "bg-white/10 text-slate-400",
                    )}
                  >
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>

                <div className="mt-2 space-y-1.5 text-[12px]">
                  <p className="flex items-start gap-2 text-slate-300">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate">{t.pickup.address}</span>
                  </p>
                  <p className="flex items-start gap-2 text-slate-300">
                    <span className="mt-1 size-2 shrink-0 rounded-[3px] bg-rose-400" />
                    <span className="truncate">{t.dropoff.address}</span>
                  </p>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <CarFront className="size-3 text-emerald-300" />
                      {vehicle.name}
                    </span>
                    <span className="text-[11px] text-slate-500">{formatKm(t.distanceKm)}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {done && t.paid && (
                      <span className="flex items-center gap-1 rounded-md bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        <Receipt className="size-3" />
                        {receiptId(t._id)}
                      </span>
                    )}
                    {done && !t.paid && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                        <XCircle className="size-3" /> Due
                      </span>
                    )}
                    <span className="font-display text-sm font-semibold text-white">
                      {formatINR(t.fare)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
        <CheckCircle2 className="size-3 text-emerald-300" />
        Receipts are numbered per trip and never change.
      </p>
    </div>
  );
}
