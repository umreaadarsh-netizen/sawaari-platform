import { cn } from "@/lib/utils";
import { CarFront, Check, Navigation, Radar, UserCheck } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";

type RideStatus = Doc<"rides">["status"];

const STEPS = [
  { key: "requested", label: "Requested", icon: Radar },
  { key: "matched", label: "Matched", icon: UserCheck },
  { key: "arriving", label: "At pickup", icon: CarFront },
  { key: "in_progress", label: "On the way", icon: Navigation },
] as const;

const ORDER = ["requested", "matched", "arriving", "in_progress"];
const ACTIVE = ["requested", "matched", "arriving", "in_progress"];

export function StatusTimeline({ status }: { status: RideStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-300">
        Ride cancelled
      </div>
    );
  }
  const doneCount =
    status === "completed" ? STEPS.length : ORDER.indexOf(status);

  return (
    <div className="flex items-start">
      {STEPS.map(({ key, label, icon: Icon }, i) => {
        const done = i < doneCount || status === "completed";
        const current = !done && ACTIVE.includes(status) && i === doneCount;
        return (
          <div key={key} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-px flex-1",
                  i === 0 ? "bg-transparent" : done ? "bg-emerald-400/70" : "bg-white/10",
                )}
              />
              <span
                className={cn(
                  "relative grid size-9 shrink-0 place-items-center rounded-full border transition-all duration-500",
                  done
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                    : current
                      ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/5 text-slate-500",
                )}
              >
                {current && (
                  <span className="absolute inset-0 animate-ping rounded-full border border-emerald-400/50" />
                )}
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span
                className={cn(
                  "h-px flex-1",
                  i === STEPS.length - 1
                    ? "bg-transparent"
                    : done
                      ? "bg-emerald-400/70"
                      : "bg-white/10",
                )}
              />
            </div>
            <span
              className={cn(
                "text-center text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]",
                done || current ? "text-slate-200" : "text-slate-500",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
