import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { SawaariMark } from "@/components/SawaariLogo";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#070b14] px-4 text-center"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[380px] w-[600px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[130px]" />
        <div className="grain absolute inset-0" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative"
      >
        <div className="flex justify-center">
          <SawaariMark className="size-14" />
        </div>
        <p className="mt-6 font-display text-7xl font-semibold tracking-tight text-white">
          404
        </p>
        <p className="mt-3 text-slate-400">
          This road doesn't lead anywhere — even our autos won't take you here.
        </p>
        <Link to="/" className="mt-8 inline-block">
          <Button className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300">
            <ArrowLeft className="size-4" /> Back to Sawaari
          </Button>
        </Link>
      </motion.div>
    </motion.div>
  );
}
