import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LogOut, MapPinned, CarTaxiFront, ShieldCheck, Wifi } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SawaariLogo } from "@/components/SawaariLogo";

export type DashMode = "rider" | "driver" | "admin";

export function AppShell({
  mode,
  onSwitchMode,
}: {
  mode: DashMode;
  onSwitchMode: (mode: DashMode) => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const modes: { key: DashMode; label: string; icon: typeof MapPinned }[] = [
    { key: "rider", label: "Rider", icon: MapPinned },
    { key: "driver", label: "Driver", icon: CarTaxiFront },
  ];
  if (isAdmin) {
    modes.push({ key: "admin", label: "Admin", icon: ShieldCheck });
  }

  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "Guest";
  const initial = displayName.slice(0, 1).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/70 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="transition-opacity hover:opacity-80"
          aria-label="Go to landing page"
        >
          <SawaariLogo markClassName="size-8" />
        </button>
        <span
          className={cn(
            "hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider sm:inline-flex",
            mode === "admin"
              ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
              : "border-amber-400/30 bg-amber-400/10 text-amber-300",
          )}
        >
          {mode} mode
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="mr-1 hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-300 md:inline-flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
          </span>
          <Wifi className="size-3 text-amber-300" />
          Live · WebSocket
        </span>

        <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
          {modes.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSwitchMode(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                mode === key
                  ? key === "admin"
                    ? "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30"
                    : "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-l border-white/10 pl-3">
          <Avatar className="size-8 ring-1 ring-white/15">
            <AvatarFallback className="bg-amber-400/15 text-xs font-bold text-amber-300">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="hidden leading-tight lg:block">
            <p className="max-w-[140px] truncate text-xs font-semibold text-slate-200">
              {displayName}
            </p>
            <p className="text-[10px] text-slate-500">
              {mode === "rider" ? "Customer" : mode === "driver" ? "EV driver" : "Administrator"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleSignOut}
            className="text-slate-400 hover:text-rose-300"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
