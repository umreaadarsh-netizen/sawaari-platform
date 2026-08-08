import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { SawaariMark } from "@/components/SawaariLogo";
import { SawaariMap, MapMarker } from "@/components/map/SawaariMap";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEFAULT_FLEET } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import {
  buildRoutePath,
  estimateFare,
  etaMinutes,
  formatKm,
  haversineKm,
} from "@/lib/geo";
import {
  ArrowUpRight,
  CalendarClock,
  CarFront,
  Clock,
  Leaf,
  Lock,
  MapPin,
  Navigation,
  Radar,
  Receipt,
  Search,
  UserCheck,
  Wallet,
  Zap,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

// Gotegaon, Narsinghpur district, Madhya Pradesh
const GOTEGAON: [number, number] = [22.7568, 79.1696];

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-black text-slate-100">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/2 h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute top-1/3 -left-44 h-[440px] w-[440px] rounded-full bg-orange-500/[0.07] blur-[130px]" />
        <div className="absolute -right-36 top-1/4 h-[400px] w-[400px] rounded-full bg-amber-600/[0.08] blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[320px] w-[520px] rounded-full bg-orange-600/[0.07] blur-[130px]" />
        <div className="grain absolute inset-0" />
      </div>

      <Nav />
      <Hero />
      <LocalRoutes />
      <Capabilities />
      <FleetSection />
      <HowItWorks />
      <DriverSection />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ---- nav ------------------------------------------------------------------

function Nav() {
  const links = [
    { label: "Rides", href: "#rides" },
    { label: "EV Fleet", href: "#fleet" },
    { label: "Wallet", href: "#how" },
    { label: "Driver Partner", href: "#drivers" },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-6 pt-6 md:px-12 lg:px-16">
      <div className="liquid-glass flex items-center justify-between rounded-xl px-4 py-2">
        <Link
          to="/"
          className="shrink-0 text-2xl font-semibold tracking-tight text-white"
        >
          SAWAARI
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-white transition-colors hover:text-gray-300"
            >
              {l.label}
            </a>
          ))}
        </div>
        <Link
          to="/auth?returnTo=%2Fapp%2Frider"
          className="shrink-0 rounded-lg bg-white px-6 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-100"
        >
          Book a Ride
        </Link>
      </div>
    </header>
  );
}

// ---- hero -----------------------------------------------------------------

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4";

/** Two lines, revealed character-by-character on load. */
const HERO_LINES = ["Shaping electric transit", "with vision and action."];

function Hero() {
  return (
    <section id="home" className="relative flex min-h-dvh flex-col overflow-hidden bg-black">
      {/* Raw cinematic background video — full-bleed, autoplaying, with no
          overlays, gradients or dimming on top of it. */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />

      <div className="relative flex flex-1 flex-col justify-end px-6 pb-12 md:px-12 lg:grid lg:grid-cols-2 lg:items-end lg:px-16 lg:pb-16">
        <div>
          <h1
            className="mb-4 text-4xl font-normal text-white md:text-5xl lg:text-6xl xl:text-7xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            {HERO_LINES.map((line, lineIndex) => (
              <span key={lineIndex} className="block">
                {line.split("").map((ch, charIndex) => (
                  <motion.span
                    key={charIndex}
                    className="inline-block"
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.5,
                      delay:
                        0.2 +
                        lineIndex * line.length * 0.03 +
                        charIndex * 0.03,
                      ease: "easeOut",
                    }}
                  >
                    {ch === " " ? "\u00A0" : ch}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mb-5 max-w-xl text-base text-gray-300 md:text-lg"
          >
            We power silent, eco-friendly EV auto rides that define what comes
            next.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.2 }}
            className="flex flex-wrap gap-4"
          >
            <Link
              to="/auth?returnTo=%2Fapp%2Frider"
              className="rounded-lg bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-gray-100"
            >
              Book Now
            </Link>
            <Link
              to="/auth?returnTo=%2Fapp%2Fdriver"
              className="liquid-glass rounded-lg border border-white/20 px-8 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
            >
              Driver Portal
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="flex items-end justify-start pt-10 lg:justify-end lg:pt-0"
        >
          <div className="liquid-glass rounded-xl border border-white/20 px-6 py-3">
            <p className="text-lg font-light text-white md:text-xl lg:text-2xl">
              Zero Emission. Electric. Seamless.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---- local routes ---------------------------------------------------------

const ROUTES: {
  id: string;
  from: string;
  to: string;
  pos: [number, number];
  note: string;
  tags: string[];
}[] = [
  { id: "nsr", from: "Gotegaon Bus Stand", to: "Narsinghpur", pos: [22.891, 79.19], note: "District HQ · NH-26", tags: ["station", "district", "nh-26"] },
  { id: "cha", from: "Gotegaon Market", to: "Chhapara", pos: [22.683, 79.233], note: "Village route", tags: ["village", "market"] },
  { id: "ten", from: "Gotegaon", to: "Tendukheda", pos: [22.913, 79.052], note: "Weekly market day", tags: ["market", "weekly"] },
  { id: "kar", from: "Gotegaon", to: "Kareli", pos: [22.85, 79.253], note: "Near NH-26", tags: ["nh-26", "village"] },
  { id: "gad", from: "Gotegaon", to: "Gadarwara", pos: [22.92, 78.783], note: "Tehsil town · long trip", tags: ["town", "long"] },
  { id: "bab", from: "Gotegaon", to: "Babai", pos: [22.775, 79.055], note: "Village route", tags: ["village"] },
  { id: "sai", from: "Gotegaon", to: "Saikheda", pos: [22.795, 79.148], note: "Village route", tags: ["village"] },
  { id: "dun", from: "Gotegaon", to: "Dungariya", pos: [22.738, 79.223], note: "Village route", tags: ["village"] },
  { id: "chi", from: "Gotegaon", to: "Chichli", pos: [22.742, 79.097], note: "Village route", tags: ["village"] },
  { id: "amg", from: "Gotegaon", to: "Amgaon", pos: [22.905, 79.292], note: "Village route", tags: ["village"] },
];

function LocalRoutes() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ROUTES[0].id);
  const [vehicleId, setVehicleId] = useState(DEFAULT_FLEET[0].id);

  const vehicles = useMemo(() => DEFAULT_FLEET.filter((v) => v.enabled), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = ROUTES.map((r) => {
      const dist = haversineKm(
        { lat: GOTEGAON[0], lng: GOTEGAON[1] },
        { lat: r.pos[0], lng: r.pos[1] },
      );
      return { ...r, dist, eta: etaMinutes(dist) };
    });
    if (!q) return base;
    return base.filter(
      (r) =>
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q)),
    );
  }, [query]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];
  const fare = selected ? estimateFare(selected.dist, vehicle) : 0;
  const rawFare = selected ? vehicle.baseFare + vehicle.perKm * selected.dist : 0;

  const markers: MapMarker[] = selected
    ? [
        { id: "p", kind: "pickup", position: GOTEGAON, label: selected.from },
        { id: "d", kind: "dropoff", position: selected.pos, label: selected.to },
      ]
    : [];
  const routePath = selected
    ? buildRoutePath(
        { lat: GOTEGAON[0], lng: GOTEGAON[1] },
        { lat: selected.pos[0], lng: selected.pos[1] },
      )
    : undefined;

  return (
    <section id="routes" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="glass-chip inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Gotegaon routes
        </p>
        <h2 className="mt-6 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Every village, on time, every time
        </h2>
        <p className="mt-4 text-slate-400">
          Search the full catalogue of local runs — from the bus stand to the
          weekly market and every village in between — and preview your exact
          fare before you book.
        </p>
      </motion.div>

      <motion.div {...fadeUp} className="mx-auto mt-10 max-w-md">
        <div className="liquid-glass border border-white/20 relative rounded-full">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes — village, market, town…"
            className="h-12 w-full rounded-full border border-transparent bg-transparent pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400/40 focus:outline-none"
          />
        </div>
      </motion.div>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        {/* route list */}
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-500">
              No routes match your search.
            </p>
          )}
          {rows.map((r, i) => {
            const vehicleFare = estimateFare(r.dist, vehicle);
            const active = selected?.id === r.id;
            return (
              <motion.button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className={cn(
                  "liquid-glass border border-white/20 group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-300",
                  active
                    ? "border-amber-300/45 bg-amber-400/5 ring-1 ring-amber-300/20"
                    : "hover:-translate-y-0.5 hover:border-amber-300/25",
                )}
              >
                <div
                  className={cn(
                    "absolute -right-10 -top-10 size-28 rounded-full bg-amber-400/10 blur-2xl transition-opacity",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                />
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <MapPin className="size-3.5" /> {r.from}
                  </p>
                  {active && (
                    <span className="glass-chip rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
                  <ArrowUpRight className="size-3.5 text-slate-500" /> {r.to}
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">{r.note}</p>
                <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
                  <div>
                    <p className="font-serif text-2xl italic text-white">₹{vehicleFare}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatKm(r.dist)} · ~{r.eta} min
                    </p>
                  </div>
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full transition-all",
                      active
                        ? "bg-amber-400/25 text-amber-300"
                        : "glass-chip text-amber-300 group-hover:bg-amber-400/20",
                    )}
                  >
                    <ArrowUpRight className="size-4" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* live fare preview */}
        <div className="liquid-glass border border-white/20 sticky top-28 overflow-hidden rounded-3xl p-6">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-amber-400" />
                  </span>
                  Live fare preview
                </p>
                <span className="glass-chip rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                  {formatKm(selected.dist)} · ~{selected.eta} min
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <SawaariMap
                  center={GOTEGAON}
                  zoom={12}
                  markers={markers}
                  route={routePath}
                  interactive={false}
                  focusKey={selected.id}
                  className="h-48"
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {selected.from} → {selected.to}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{selected.note}</p>
                </div>
              </div>

              <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Choose your rickshaw
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleId(v.id)}
                    className={cn(
                      "glass-chip rounded-full px-3.5 py-2 text-xs font-semibold transition-all",
                      v.id === vehicle.id
                        ? "border-amber-300/45 bg-amber-400/15 text-amber-300"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {v.name} · ₹{v.baseFare}+₹{v.perKm}/km
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-2 border-t border-white/10 pt-5">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Base fare</span>
                  <span>₹{vehicle.baseFare}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                  <span>
                    ₹{vehicle.perKm}/km × {selected.dist.toFixed(1)} km
                  </span>
                  <span>₹{Math.round(vehicle.perKm * selected.dist)}</span>
                </div>
                {fare > Math.round(rawFare) && (
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Minimum fare applied</span>
                    <span>₹{vehicle.minFare}</span>
                  </div>
                )}
                <div className="flex items-end justify-between border-t border-white/10 pt-4">
                  <span className="text-sm font-semibold text-white">Estimated fare</span>
                  <span className="font-serif text-4xl italic text-amber-300">₹{fare}</span>
                </div>
              </div>

              <Link to="/auth?returnTo=%2Fapp%2Frider" className="mt-6 block">
                <Button className="glass-strong h-12 w-full rounded-full text-[15px] font-semibold text-white hover:bg-white/15">
                  Book this route <ArrowUpRight className="size-4" />
                </Button>
              </Link>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              Select a route to preview its fare.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- capabilities ---------------------------------------------------------

function Capabilities() {
  const items = [
    {
      icon: Navigation,
      title: "Local Navigation",
      body: "Fast routes optimized for Gotegaon and surrounding village areas — the short cuts, lanes and byroads that maps often miss.",
    },
    {
      icon: Radar,
      title: "Real-time Dispatch",
      body: "Instant driver matching with live location updates. Watch your driver approach over a live connection between both dashboards.",
    },
    {
      icon: Receipt,
      title: "Fixed & Fair Rates",
      body: "Transparent pricing with no hidden charges. The fare shown before you book is the fare you pay — every single trip.",
    },
  ];
  return (
    <section id="rides" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          Capabilities
        </p>
        <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Transportation evolved
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }, i) => (
          <motion.div
            key={title}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="liquid-glass border border-white/20 group relative overflow-hidden rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/30"
          >
            <div className="absolute -right-14 -top-14 size-36 rounded-full bg-amber-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <span className="glass-strong grid size-13 w-13 place-items-center rounded-2xl text-amber-300 transition-transform duration-300 group-hover:scale-105">
              <Icon className="size-6" />
            </span>
            <h3 className="mt-6 font-serif text-2xl italic text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- fleet catalogue ------------------------------------------------------

function FleetSection() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_FLEET.filter((v) => v.enabled);
    return DEFAULT_FLEET.filter(
      (v) =>
        v.enabled &&
        (v.name.toLowerCase().includes(q) ||
          v.tagline.toLowerCase().includes(q) ||
          String(v.seats).includes(q)),
    );
  }, [query]);

  return (
    <section id="fleet" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          The fleet
        </p>
        <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Choose your rickshaw
        </h2>
        <p className="mt-4 text-slate-400">
          Every vehicle is battery-electric, and every fare is published
          upfront — base rate plus a per-kilometre charge, nothing hidden.
        </p>
      </motion.div>

      <motion.div {...fadeUp} className="mx-auto mt-10 max-w-md">
        <div className="liquid-glass border border-white/20 relative rounded-full">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue — comfort, luggage, seats…"
            className="h-12 w-full rounded-full border border-transparent bg-transparent pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400/40 focus:outline-none"
          />
        </div>
      </motion.div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {results.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-500">
            No rickshaws match your search.
          </p>
        )}
        {results.map((v, i) => (
          <motion.div
            key={v.id}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="liquid-glass border border-white/20 group relative overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/30"
          >
            <div className="flex items-start justify-between">
              <span className="glass-strong grid size-12 place-items-center rounded-2xl text-amber-300">
                <Zap className="size-5" />
              </span>
              <span className="glass-chip rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                {v.seats} seats
              </span>
            </div>
            <h3 className="mt-5 font-serif text-2xl italic text-white">{v.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{v.tagline}</p>
            <div className="mt-6 flex items-end justify-between border-t border-white/10 pt-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Fare
                </p>
                <p className="font-serif text-2xl italic text-amber-300">
                  ₹{v.baseFare} <span className="text-sm text-slate-400">+ ₹{v.perKm}/km</span>
                </p>
              </div>
              <Link to="/auth?returnTo=%2Fapp%2Frider">
                <Button
                  size="sm"
                  className="glass-strong h-9 rounded-full px-4 text-white hover:bg-white/15"
                >
                  Book <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- how it works ---------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      icon: UserCheck,
      step: "01",
      title: "Choose your ride",
      body: "Browse the fleet, set your pickup and drop-off anywhere in Gotegaon, and see your final fare before you book.",
    },
    {
      icon: CalendarClock,
      step: "02",
      title: "Book now or schedule",
      body: "Ride immediately or schedule a pickup up to 48 hours ahead. Your request streams live to nearby drivers.",
    },
    {
      icon: Receipt,
      step: "03",
      title: "Track, ride and settle",
      body: "Follow your driver live, chat along the way, and pay by UPI, card or cash — with a numbered receipt.",
    },
  ];
  return (
    <section id="how" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          How it works
        </p>
        <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          From booking to drop-off in three steps
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {steps.map(({ icon: Icon, step, title, body }, i) => (
          <motion.div
            key={step}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="liquid-glass border border-white/20 relative overflow-hidden rounded-3xl p-8"
          >
            <span className="absolute right-6 top-4 font-serif text-6xl italic text-white/[0.06]">
              {step}
            </span>
            <span className="glass-strong grid size-12 place-items-center rounded-2xl text-amber-300">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-6 font-serif text-2xl italic text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
            {i < steps.length - 1 && (
              <ArrowUpRight className="absolute -right-2 top-1/2 hidden size-6 -translate-y-1/2 text-amber-400/60 lg:block" />
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- drivers --------------------------------------------------------------

function DriverSection() {
  const perks = [
    {
      icon: Wallet,
      title: "Keep 100% of every fare",
      body: "No commissions and no hidden cuts. Every rupee you earn is yours to keep.",
    },
    {
      icon: Leaf,
      title: "Zero fuel costs",
      body: "Your rickshaw charges at SAWAARI partner stations — included, never deducted.",
    },
    {
      icon: Clock,
      title: "Work on your own hours",
      body: "Go online whenever it suits you. Bookings stream in live while you're on duty.",
    },
  ];
  return (
    <section id="drivers" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            For drivers
          </p>
          <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
            Own your earnings,{" "}
            <span className="bg-gradient-to-r from-amber-200 to-orange-200 bg-clip-text text-transparent">
              drive electric
            </span>
          </h2>
          <p className="mt-5 max-w-md text-slate-400">
            Join the region's most driver-friendly electric fleet. Free
            onboarding, instant receipts and a live booking feed that keeps you
            moving across Gotegaon and nearby villages.
          </p>

          <div className="mt-8 space-y-3">
            {perks.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="liquid-glass border border-white/20 flex items-start gap-3.5 rounded-2xl p-4 transition-colors hover:border-amber-300/25"
              >
                <span className="glass-strong grid size-10 shrink-0 place-items-center rounded-xl text-amber-300">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-[13px] text-slate-400">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <Link to="/auth?returnTo=%2Fapp%2Fdriver" className="mt-8 inline-block">
            <Button
              size="lg"
              className="glass-strong h-12 rounded-full px-7 text-[15px] font-semibold text-white hover:bg-white/15"
            >
              <CarFront className="size-4" />
              Become a driver
            </Button>
          </Link>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="liquid-glass border border-white/20 rounded-[2rem] p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  This week
                </p>
                <p className="mt-1 font-serif text-5xl italic text-white">₹28,400</p>
              </div>
              <span className="glass-chip flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-amber-300">
                <Zap className="size-3.5" /> 62 rides
              </span>
            </div>
            <div className="mt-8 space-y-4">
              {[
                { day: "Mon", amt: "₹4,120", rides: "9" },
                { day: "Tue", amt: "₹3,860", rides: "8" },
                { day: "Wed", amt: "₹5,240", rides: "11" },
                { day: "Thu", amt: "₹4,730", rides: "10" },
                { day: "Fri", amt: "₹5,610", rides: "12" },
                { day: "Sat", amt: "₹4,840", rides: "12" },
              ].map((d, i) => (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="w-8 text-[11px] font-semibold text-slate-500">{d.day}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${55 + i * 6}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.08 }}
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-semibold text-slate-300">
                    {d.amt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---- faq ------------------------------------------------------------------

function Faq() {
  const items = [
    {
      q: "Where does SAWAARI operate?",
      a: "SAWAARI serves Gotegaon and the surrounding villages of Narsinghpur district, Madhya Pradesh — including runs to the bus stand, weekly markets, Chhapara, Tendukheda, Kareli and Narsinghpur town.",
    },
    {
      q: "How are fares calculated?",
      a: "Every rickshaw in the catalogue shows a fixed base rate plus a per-kilometre charge, with a minimum fare. The estimate you see before booking is final — SAWAARI never applies surge pricing.",
    },
    {
      q: "Can I schedule a ride for later?",
      a: "Yes. Choose 'Schedule' when booking and pick a pickup time up to 48 hours ahead. A driver is confirmed for your scheduled pickup, and you're notified when it's time to leave.",
    },
    {
      q: "How do payments work?",
      a: "Settle your fare at the end of the trip by UPI, card or cash. Every payment issues a numbered receipt, and paid trips are reflected in your recent trips list.",
    },
    {
      q: "How does live tracking work?",
      a: "The customer and driver dashboards stay in sync over a live connection. When a driver accepts, starts moving or sends a message, it appears on the other side instantly — no refreshing required.",
    },
  ];
  return (
    <section id="faq" className="relative mx-auto max-w-3xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          FAQ
        </p>
        <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Questions, answered
        </h2>
      </motion.div>
      <motion.div {...fadeUp} className="mt-12">
        <Accordion type="single" collapsible className="space-y-3">
          {items.map((item) => (
            <AccordionItem
              key={item.q}
              value={item.q}
              className="liquid-glass border border-white/20 rounded-2xl px-6 data-[state=open]:border-amber-300/25"
            >
              <AccordionTrigger className="text-left text-sm font-semibold text-white hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-slate-400">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
}

// ---- CTA + footer ---------------------------------------------------------

function FinalCta() {
  return (
    <section className="relative mx-auto max-w-5xl px-5 pb-24 pt-4 sm:px-8">
      <motion.div
        {...fadeUp}
        className="liquid-glass border border-white/20 relative overflow-hidden rounded-[2.5rem] p-10 text-center sm:p-14"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-amber-400/20 blur-[100px]" />
        <p className="glass-chip relative inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Ready when you are
        </p>
        <h2 className="relative mx-auto mt-6 max-w-2xl font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Gotegaon moves quieter,{" "}
          <span className="bg-gradient-to-r from-amber-200 to-orange-200 bg-clip-text text-transparent">
            cleaner and faster.
          </span>
        </h2>
        <p className="relative mx-auto mt-5 max-w-md text-sm text-slate-400">
          Sign in with your email — or continue as a guest — and take your first
          electric ride in under a minute.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth?returnTo=%2Fapp%2Frider">
            <Button
              size="lg"
              className="glass-strong h-12 rounded-full px-8 text-[15px] font-semibold text-white hover:bg-white/15"
            >
              Book a Sawaari <ArrowUpRight className="size-4" />
            </Button>
          </Link>
          <Link to="/auth?returnTo=%2Fapp%2Fdriver">
            <Button
              size="lg"
              variant="ghost"
              className="h-12 rounded-full px-7 text-[15px] font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <CarFront className="size-4" /> I want to drive
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-3">
          <SawaariMark className="size-8" />
          <div>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-white">
              Sawaari
            </p>
            <p className="text-[11px] text-slate-500">
              Electric rickshaws, on demand in Gotegaon.
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
          <span className="size-1 rounded-full bg-amber-400" />
          Connecting local routes across Madhya Pradesh
        </p>
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} SAWAARI Mobility · Narsinghpur, Madhya Pradesh
        </p>
        <Link
          to="/admin"
          className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:text-slate-300"
        >
          <Lock className="size-3" />
          Admin
        </Link>
      </div>
    </footer>
  );
}
