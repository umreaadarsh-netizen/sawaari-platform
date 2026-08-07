import { cn } from "@/lib/utils";

export function SawaariMark({
  className,
}: {
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-amber-950 shadow-lg shadow-amber-500/30 ring-1 ring-white/20",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[58%]"
        fill="currentColor"
        aria-hidden
      >
        <path d="M13.2 1.8 3.4 14.2h6.4l-1 8 9.8-12.4h-6.4l1-8z" />
      </svg>
    </span>
  );
}

export function SawaariLogo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SawaariMark className={cn("size-9", markClassName)} />
      <span className="font-display text-[15px] font-semibold uppercase tracking-[0.18em] text-foreground">
        Sawaari
      </span>
    </span>
  );
}
