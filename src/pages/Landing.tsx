import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { SawaariLogo, SawaariMark } from "@/components/SawaariLogo";
import { SawaariMap, MapMarker } from "@/components/map/SawaariMap";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEFAULT_FLEET } from "@/lib/fleet";
import { estimateFare, etaMinutes, formatKm, haversineKm } from "@/lib/geo";
import {
  ArrowUpRight,
  Battery,
  CalendarClock,
  CarFront,
  Clock,
  Leaf,
  Map,
  MapPin,
  Navigation,
  Radar,
  Receipt,
  Search,
  Timer,
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
        <div className="absolute -top-44 left-1/2 h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[150px]" />
        <div className="absolute top-1/3 -left-44 h-[440px] w-[440px] rounded-full bg-teal-500/[0.07] blur-[130px]" />
        <div className="absolute -right-36 top-1/4 h-[400px] w-[400px] rounded-full bg-emerald-600/[0.08] blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[320px] w-[520px] rounded-full bg-teal-600/[0.07] blur-[130px]" />
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
    { label: "Home", href: "#home" },
    { label: "Rides", href: "#rides" },
    { label: "Gotegaon Routes", href: "#routes" },
    { label: "Fleet", href: "#fleet" },
  ];
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav className="glass flex w-full max-w-5xl items-center justify-between rounded-full py-2 pl-4 pr-2">
        <Link to="/" aria-label="Sawaari home" className="shrink-0">
          <SawaariLogo markClassName="size-8" />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
        <Link to="/auth?returnTo=%2Fapp%2Frider" className="shrink-0">
          <Button className="glass-strong h-10 rounded-full px-5 text-sm font-semibold text-white hover:bg-white/15">
            Book Now
          </Button>
        </Link>
      </nav>
    </header>
  );
}

// ---- hero -----------------------------------------------------------------

function Hero() {
  return (
    <section id="home" className="relative mx-auto max-w-7xl px-5 pb-16 pt-36 sm:px-8 sm:pt-44 lg:pb-24">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-chip inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-emerald-300"
          >
            <Battery className="size-3.5" />
            All-electric · Gotegaon &amp; nearby villages
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-6 font-serif text-5xl italic leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            Venture across Gotegaon with{" "}
            <span className="bg-gradient-to-r from-emerald-200 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
              seamless rides.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-6 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg"
          >
            Discover fast, reliable, and smooth local auto transportation across
            Gotegaon and nearby villages — transparent fares, live driver
            tracking and scheduled pickups, all on your phone.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link to="/auth?returnTo=%2Fapp%2Frider">
              <Button
                size="lg"
                className="glass-strong h-12 rounded-full px-7 text-[15px] font-semibold text-white hover:bg-white/15"
              >
                Book a Sawaari
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Button>
            </Link>
            <a href="#routes">
              <Button
                size="lg"
                variant="ghost"
                className="h-12 rounded-full px-6 text-[15px] font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <Map className="size-4" />
                Explore Routes
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="mt-10 grid max-w-lg grid-cols-2 gap-3"
          >
            <div className="glass rounded-2xl p-5">
              <p className="flex items-center gap-2 font-serif text-3xl italic leading-none text-white">
                <Timer className="size-5 text-emerald-300" />
                &lt; 10 min
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Average pickup time in Gotegaon
              </p>
            </div>
            <div className="glass rounded-2xl p-5">
              <p className="flex items-center gap-2 font-serif text-3xl italic leading-none text-white">
                <MapPin className="size-5 text-emerald-300" />
                Local &amp; Reliable
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Serving Gotegaon &amp; nearby villages
              </p>
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500"
          >
            <span className="size-1 rounded-full bg-emerald-400" />
            Connecting local routes across Madhya Pradesh
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative"
        >
          <div className="glass-strong relative overflow-hidden rounded-[2rem] p-2">
            <div className="overflow-hidden rounded-[1.5rem]">
              <MapPreview />
            </div>
          </div>
          <div className="absolute -inset-px -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-400/20 via-transparent to-teal-400/20 blur-sm" />
        </motion.div>
      </div>
    </section>
  );
}

const PREVIEW_PICKUP: [number, number] = [22.7568, 79.1696];
const PREVIEW_DROPOFF: [number, number] = [22.791, 79.216];

function MapPreview() {
  const [driverPos, setDriverPos] = useState<[number, number]>([22.748, 79.163]);
  const target = useRef<[number, number]>(PREVIEW_DROPOFF);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDriverPos((prev) => {
        const [lat, lng] = prev;
        const dLat = target.current[0] - lat;
        const dLng = target.current[1] - lng;
        const step = 0.00042;
        if (Math.abs(dLat) < step && Math.abs(dLng) < step) {
          target.current = PREVIEW_PICKUP;
          return prev;
        }
        return [lat + Math.sign(dLat) * step, lng + Math.sign(dLng) * step];
      });
    }, 550);
    return () => window.clearInterval(t);
  }, []);

  const markers: MapMarker[] = [
    { id: "p", kind: "pickup", position: PREVIEW_PICKUP, label: "Gotegaon Bus Stand" },
    { id: "d", kind: "dropoff", position: PREVIEW_DROPOFF, label: "Chhapara More Road" },
    { id: "drv", kind: "driver", position: driverPos, label: "Ramesh · MP 04 EV 4821" },
    { id: "idle1", kind: "driver-idle", position: [22.771, 79.178] },
    { id: "idle2", kind: "driver-idle", position: [22.743, 79.152] },
  ];

  return (
    <div className="relative">
      <SawaariMap
        center={[22.766, 79.19]}
        zoom={13}
        markers={markers}
        interactive={false}
        className="h-[380px] sm:h-[460px]"
      />

      {/* live ride card */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-[300px]">
        <div className="glass-strong rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-bold text-emerald-950">
              R
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Ramesh · MP 04 EV 4821</p>
              <p className="flex items-center gap-1 text-[11px] text-emerald-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Arriving in 4 min
              </p>
            </div>
            <span className="glass-chip rounded-full px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              ₹115
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3 text-emerald-300" /> Gotegaon
            </span>
            <ArrowUpRight className="size-3 text-slate-600" />
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3 text-rose-300" /> Chhapara More
            </span>
          </div>
        </div>
      </div>

      {/* fare chip */}
      <div className="absolute right-4 top-4">
        <div className="glass-chip rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-slate-200">
          ₹115 · 5.9 km · 20 min
        </div>
      </div>
    </div>
  );
}

// ---- local routes ---------------------------------------------------------

const ROUTES: {
  id: string;
  from: string;
  to: string;
  pos: [number, number];
  note: string;
}[] = [
  { id: "nsr", from: "Gotegaon Bus Stand", to: "Narsinghpur", pos: [22.891, 79.19], note: "District HQ · NH-26" },
  { id: "cha", from: "Gotegaon Market", to: "Chhapara", pos: [22.683, 79.233], note: "Village route" },
  { id: "ten", from: "Gotegaon", to: "Tendukheda", pos: [22.913, 79.052], note: "Weekly market day" },
  { id: "kar", from: "Gotegaon", to: "Kareli", pos: [22.85, 79.253], note: "Near NH-26" },
];

function LocalRoutes() {
  const classic = DEFAULT_FLEET[0];
  const rows = useMemo(
    () =>
      ROUTES.map((r) => {
        const dist = haversineKm(
          { lat: GOTEGAON[0], lng: GOTEGAON[1] },
          { lat: r.pos[0], lng: r.pos[1] },
        );
        return {
          ...r,
          dist,
          fare: estimateFare(dist, classic),
          eta: etaMinutes(dist),
        };
      }),
    [classic],
  );

  return (
    <section id="routes" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="glass-chip inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Gotegaon routes
        </p>
        <h2 className="mt-6 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Every village, on time, every time
        </h2>
        <p className="mt-4 text-slate-400">
          Popular local runs with fixed, transparent fares — from the bus stand
          to the weekly market and every village in between.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="glass group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/30"
          >
            <div className="absolute -right-10 -top-10 size-28 rounded-full bg-emerald-400/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <MapPin className="size-3.5" /> {r.from}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-white">
              <ArrowUpRight className="size-3.5 text-slate-500" /> {r.to}
            </p>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">{r.note}</p>
            <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
              <div>
                <p className="font-serif text-2xl italic text-white">₹{r.fare}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatKm(r.dist)} · ~{r.eta} min
                </p>
              </div>
              <Link to="/auth?returnTo=%2Fapp%2Frider" aria-label={`Book ${r.from} to ${r.to}`}>
                <span className="glass-chip grid size-9 place-items-center rounded-full text-emerald-300 transition-all group-hover:bg-emerald-400/20">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>
            </div>
          </motion.div>
        ))}
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
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
            className="glass group relative overflow-hidden rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/30"
          >
            <div className="absolute -right-14 -top-14 size-36 rounded-full bg-emerald-400/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <span className="glass-strong grid size-13 w-13 place-items-center rounded-2xl text-emerald-300 transition-transform duration-300 group-hover:scale-105">
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
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
        <div className="glass relative rounded-full">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue — comfort, luggage, seats…"
            className="h-12 w-full rounded-full border border-transparent bg-transparent pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
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
            className="glass group relative overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/30"
          >
            <div className="flex items-start justify-between">
              <span className="glass-strong grid size-12 place-items-center rounded-2xl text-emerald-300">
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
                <p className="font-serif text-2xl italic text-emerald-300">
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
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
            className="glass relative overflow-hidden rounded-3xl p-8"
          >
            <span className="absolute right-6 top-4 font-serif text-6xl italic text-white/[0.06]">
              {step}
            </span>
            <span className="glass-strong grid size-12 place-items-center rounded-2xl text-emerald-300">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-6 font-serif text-2xl italic text-white">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
            {i < steps.length - 1 && (
              <ArrowUpRight className="absolute -right-2 top-1/2 hidden size-6 -translate-y-1/2 text-emerald-400/60 lg:block" />
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            For drivers
          </p>
          <h2 className="mt-4 font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
            Own your earnings,{" "}
            <span className="bg-gradient-to-r from-emerald-200 to-teal-200 bg-clip-text text-transparent">
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
                className="glass flex items-start gap-3.5 rounded-2xl p-4 transition-colors hover:border-emerald-300/25"
              >
                <span className="glass-strong grid size-10 shrink-0 place-items-center rounded-xl text-emerald-300">
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
          <div className="glass-strong rounded-[2rem] p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  This week
                </p>
                <p className="mt-1 font-serif text-5xl italic text-white">₹28,400</p>
              </div>
              <span className="glass-chip flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-emerald-300">
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
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400"
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
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
              className="glass rounded-2xl px-6 data-[state=open]:border-emerald-300/25"
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
        className="glass-strong relative overflow-hidden rounded-[2.5rem] p-10 text-center sm:p-14"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-[100px]" />
        <p className="glass-chip relative inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Ready when you are
        </p>
        <h2 className="relative mx-auto mt-6 max-w-2xl font-serif text-4xl italic leading-[1.08] tracking-tight text-white sm:text-5xl">
          Gotegaon moves quieter,{" "}
          <span className="bg-gradient-to-r from-emerald-200 to-teal-200 bg-clip-text text-transparent">
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
          <span className="size-1 rounded-full bg-emerald-400" />
          Connecting local routes across Madhya Pradesh
        </p>
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} SAWAARI Mobility · Narsinghpur, Madhya Pradesh
        </p>
      </div>
    </footer>
  );
}
