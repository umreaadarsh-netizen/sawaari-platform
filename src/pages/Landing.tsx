import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
import {
  ArrowRight,
  Battery,
  CarFront,
  Clock,
  Flag,
  Leaf,
  MapPin,
  MessageSquare,
  Navigation,
  Radar,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
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

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[#070b14] text-slate-100">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[140px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-teal-500/10 blur-[120px]" />
        <div className="absolute -right-32 top-1/4 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[300px] w-[500px] rounded-full bg-emerald-600/10 blur-[120px]" />
        <div className="grain absolute inset-0" />
      </div>

      <Nav />
      <Hero />
      <Stats />
      <Features />
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
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how" },
    { label: "Drivers", href: "#drivers" },
    { label: "FAQ", href: "#faq" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070b14]/70 backdrop-blur-2xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" aria-label="Sawaari home">
          <SawaariLogo />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Link to="/auth?returnTo=%2Fapp%2Frider">
            <Button
              variant="ghost"
              className="text-slate-300 hover:bg-white/5 hover:text-white"
            >
              Sign in
            </Button>
          </Link>
          <Link to="/auth?returnTo=%2Fapp%2Frider">
            <Button className="bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-300">
              Book a ride
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ---- hero -----------------------------------------------------------------

function Hero() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:pb-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300"
          >
            <Battery className="size-3.5" />
            100% electric · zero emissions
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl"
          >
            Every auto in your city,{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
              now electric.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg"
          >
            Sawaari matches you with a nearby EV auto in seconds — transparent
            fares, live driver tracking, and in-ride chat. The ride-hailing
            experience that breathes clean.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link to="/auth?returnTo=%2Fapp%2Frider">
              <Button
                size="lg"
                className="h-12 bg-emerald-400 px-6 text-[15px] font-semibold text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-300"
              >
                Book a ride <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/auth?returnTo=%2Fapp%2Fdriver">
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white backdrop-blur hover:bg-white/10"
              >
                <CarFront className="size-4" /> Drive with Sawaari
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-slate-500"
          >
            <span className="flex items-center gap-1.5">
              <Zap className="size-4 text-emerald-400" /> 50,000+ rides
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="size-4 fill-amber-400 text-amber-400" /> 4.9 rider
              rating
            </span>
            <span className="flex items-center gap-1.5">
              <Leaf className="size-4 text-emerald-400" /> 12 clean-air cities
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative"
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <MapPreview />
          </div>
          <div className="absolute -inset-px -z-10 rounded-3xl bg-gradient-to-br from-emerald-400/20 via-transparent to-teal-400/20 blur-sm" />
        </motion.div>
      </div>
    </section>
  );
}

const PREVIEW_PICKUP: [number, number] = [12.9784, 77.6408];
const PREVIEW_DROPOFF: [number, number] = [12.9352, 77.6247];

function MapPreview() {
  const [driverPos, setDriverPos] = useState<[number, number]>([12.959, 77.633]);
  const target = useRef<[number, number]>(PREVIEW_DROPOFF);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDriverPos((prev) => {
        const [lat, lng] = prev;
        const dLat = target.current[0] - lat;
        const dLng = target.current[1] - lng;
        const step = 0.00045;
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
    { id: "p", kind: "pickup", position: PREVIEW_PICKUP, label: "Indiranagar 100 Ft Road" },
    { id: "d", kind: "dropoff", position: PREVIEW_DROPOFF, label: "Koramangala 5th Block" },
    { id: "drv", kind: "driver", position: driverPos, label: "Priya · EV 4821" },
    { id: "idle1", kind: "driver-idle", position: [12.951, 77.649] },
    { id: "idle2", kind: "driver-idle", position: [12.988, 77.613] },
  ];

  return (
    <div className="relative">
      <SawaariMap
        center={[12.955, 77.633]}
        zoom={13}
        markers={markers}
        interactive={false}
        className="h-[380px] sm:h-[440px]"
      />

      {/* floating ride card */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-[300px]">
        <div className="rounded-2xl border border-white/15 bg-slate-950/80 p-4 shadow-2xl shadow-black/50 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-bold text-emerald-950">
              P
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Priya · EV 4821</p>
              <p className="flex items-center gap-1 text-[11px] text-emerald-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Arriving in 4 min
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
              ₹84
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3 text-emerald-300" /> Indiranagar
            </span>
            <ArrowRight className="size-3 text-slate-600" />
            <span className="flex items-center gap-1.5">
              <Flag className="size-3 text-rose-300" /> Koramangala
            </span>
          </div>
        </div>
      </div>

      {/* fare chip */}
      <div className="absolute right-4 top-4">
        <div className="rounded-full border border-white/15 bg-slate-950/80 px-3.5 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur-xl">
          ₹84 · 3.2 km · 14 min
        </div>
      </div>
    </div>
  );
}

// ---- stats ----------------------------------------------------------------

function Stats() {
  const items = [
    { icon: Zap, value: "50k+", label: "Electric rides completed" },
    { icon: Leaf, value: "1,820 t", label: "CO₂ saved since launch" },
    { icon: Timer, value: "< 15s", label: "Average driver match" },
    { icon: Star, value: "4.9★", label: "Rated by riders" },
  ];
  return (
    <section className="relative mx-auto max-w-7xl px-5 sm:px-8">
      <div className="grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-6 lg:grid-cols-4">
        {items.map(({ icon: Icon, value, label }, i) => (
          <motion.div
            key={label}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            className="flex items-center gap-3.5 rounded-2xl p-3 transition-colors hover:bg-white/5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block font-display text-xl font-semibold text-white">
                {value}
              </span>
              <span className="block text-[11px] text-slate-500">{label}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- features -------------------------------------------------------------

function Features() {
  const items = [
    {
      icon: Zap,
      title: "All-electric fleet",
      body: "Every auto on Sawaari is a battery-powered EV — quiet rides, no fumes, and charging included for drivers.",
    },
    {
      icon: Receipt,
      title: "Fare upfront",
      body: "A transparent ₹30 base + ₹14/km. The price you see is the price you pay. No surge, no surprises.",
    },
    {
      icon: Radar,
      title: "Live driver tracking",
      body: "Watch your driver approach in real time over a live WebSocket link between both dashboards.",
    },
    {
      icon: MessageSquare,
      title: "In-ride chat",
      body: "Message your driver the moment you're matched — share pin drops and updates without phone calls.",
    },
    {
      icon: Timer,
      title: "Match in seconds",
      body: "Ride requests stream straight to nearby online drivers and get accepted in under 15 seconds.",
    },
    {
      icon: ShieldCheck,
      title: "Verified & safe",
      body: "Document-verified drivers, trip sharing, SOS support and a 4.9★ community rating on every ride.",
    },
  ];
  return (
    <section id="features" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Features
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Ride-hailing, reimagined for a{" "}
          <span className="text-emerald-300">cleaner city</span>
        </h2>
        <p className="mt-4 text-slate-400">
          Everything you'd expect from a modern mobility platform — minus the
          noise, fumes and surge pricing.
        </p>
      </motion.div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }, i) => (
          <motion.div
            key={title}
            {...fadeUp}
            transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-white/[0.05]"
          >
            <div className="absolute -right-10 -top-10 size-28 rounded-full bg-emerald-400/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20 transition-transform group-hover:scale-110">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-base font-semibold text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
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
      icon: MapPin,
      step: "01",
      title: "Set pickup & drop-off",
      body: "Type your locations with instant suggestions, or just tap the map. Your fare appears before you book.",
    },
    {
      icon: UserCheck,
      step: "02",
      title: "Match with a driver",
      body: "Your request streams live to nearby online drivers over WebSocket — the first to accept gets the ride.",
    },
    {
      icon: Navigation,
      step: "03",
      title: "Track & ride",
      body: "Follow your driver on the map, chat along the way, pay a fixed fare, and rate the trip when it's done.",
    },
  ];
  return (
    <section id="how" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          How it works
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          From curb to curb in three steps
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {steps.map(({ icon: Icon, step, title, body }, i) => (
          <motion.div
            key={step}
            {...fadeUp}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl"
          >
            <span className="absolute right-5 top-4 font-display text-4xl font-semibold text-white/5">
              {step}
            </span>
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-emerald-950 shadow-lg shadow-emerald-500/25">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-5 font-display text-lg font-semibold text-white">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
            {i < steps.length - 1 && (
              <ArrowRight className="absolute -right-3.5 top-1/2 hidden size-5 -translate-y-1/2 text-emerald-400/60 lg:block" />
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
    { icon: Wallet, title: "Keep 100% of fares", body: "No commissions, no hidden cuts. Every rupee you earn is yours." },
    { icon: Battery, title: "Zero fuel costs", body: "Your EV charges at Sawaari partner stations — included, not deducted." },
    { icon: Clock, title: "Your hours, your rules", body: "Go online whenever suits you. Requests stream in live while you're on duty." },
  ];
  return (
    <section id="drivers" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            For drivers
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Own your earnings,{" "}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
              drive electric
            </span>
          </h2>
          <p className="mt-4 max-w-md text-slate-400">
            Join India's most driver-friendly EV fleet. Free onboarding, instant
            payouts, and a live request feed that keeps you moving.
          </p>

          <div className="mt-8 space-y-3">
            {perks.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl transition-colors hover:bg-white/[0.05]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
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
              className="h-12 bg-emerald-400 px-6 text-[15px] font-semibold text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-300"
            >
              Become a driver <ArrowRight className="size-4" />
            </Button>
          </Link>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  This week
                </p>
                <p className="mt-1 font-display text-4xl font-semibold text-white">
                  ₹28,400
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-300">
                <Sparkles className="size-3.5" /> 62 rides
              </span>
            </div>
            <div className="mt-6 space-y-4">
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
      q: "What exactly is Sawaari?",
      a: "Sawaari is a full-stack EV auto ride-hailing platform. Riders book electric autos with transparent fares and live tracking, while drivers get a live request feed with real-time communication between both dashboards.",
    },
    {
      q: "How are fares calculated?",
      a: "Fares are fully transparent: ₹30 base plus ₹14 per kilometre, with a ₹35 minimum. The estimate shown before booking is exactly what you pay — there's no surge pricing on Sawaari.",
    },
    {
      q: "Are the autos really electric?",
      a: "Yes. Our entire fleet is battery-electric, which means quieter rides, zero tailpipe emissions, and no fuel costs — a benefit we pass on to both riders and drivers.",
    },
    {
      q: "How does live tracking work?",
      a: "Rider and driver dashboards stay in sync over a live WebSocket connection. When a driver accepts, starts moving, or sends a chat message, it appears on the other side instantly — no refreshing required.",
    },
  ];
  return (
    <section id="faq" className="relative mx-auto max-w-3xl px-5 py-24 sm:px-8">
      <motion.div {...fadeUp} className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          FAQ
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Questions, answered
        </h2>
      </motion.div>
      <motion.div {...fadeUp} className="mt-10">
        <Accordion type="single" collapsible className="space-y-3">
          {items.map((item) => (
            <AccordionItem
              key={item.q}
              value={item.q}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 backdrop-blur-xl data-[state=open]:border-emerald-400/25"
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
        className="relative overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent p-10 text-center backdrop-blur-xl sm:p-14"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[480px] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-[100px]" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Ready when you are
        </p>
        <h2 className="relative mx-auto mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Your city just got quieter, cleaner,{" "}
          <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
            and faster.
          </span>
        </h2>
        <p className="relative mx-auto mt-4 max-w-md text-sm text-slate-400">
          Sign in with your email — or jump in as a guest — and take your first
          electric ride in under a minute.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth?returnTo=%2Fapp%2Frider">
            <Button
              size="lg"
              className="h-12 bg-emerald-400 px-7 text-[15px] font-semibold text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-300"
            >
              Book a ride <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to="/auth?returnTo=%2Fapp%2Fdriver">
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-white/15 bg-white/5 px-7 text-[15px] font-semibold text-white hover:bg-white/10"
            >
              I want to drive
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
        <div className="flex items-center gap-3">
          <SawaariMark className="size-8" />
          <div>
            <p className="font-display text-sm font-semibold text-white">Sawaari</p>
            <p className="text-[11px] text-slate-500">Electric autos, on demand.</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} Sawaari Mobility · Built for cleaner cities
        </p>
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <a href="#features" className="transition-colors hover:text-slate-300">Features</a>
          <a href="#drivers" className="transition-colors hover:text-slate-300">Drivers</a>
          <a href="#faq" className="transition-colors hover:text-slate-300">FAQ</a>
        </div>
      </div>
    </footer>
  );
}
