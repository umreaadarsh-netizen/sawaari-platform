import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { SawaariMark } from "@/components/SawaariLogo";
import {
  ArrowRight,
  CarFront,
  Loader2,
  Mail,
  MapPin,
  UserX,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { cn } from "@/lib/utils";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/app/rider",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type RoleChoice = "rider" | "driver" | null;

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [role, setRole] = useState<RoleChoice>(null);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(
    () => (role ? `/app/${role}` : redirect),
    [role, redirect],
  );

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(target);
    }
  }, [authLoading, isAuthenticated, navigate, target]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(target);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(target);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#070b14] px-4 py-10">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[130px]" />
        <div className="absolute bottom-0 -left-32 h-[340px] w-[340px] rounded-full bg-teal-500/10 blur-[110px]" />
        <div className="absolute -right-24 top-1/3 h-[300px] w-[300px] rounded-full bg-sky-500/10 blur-[110px]" />
        <div className="grain absolute inset-0" />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="absolute -inset-1 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-400/25 via-transparent to-teal-400/25 blur-lg" />
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-8">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="transition-transform hover:scale-105"
              aria-label="Back to home"
            >
              <SawaariMark className="size-12" />
            </button>
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-white">
              {step === "signIn" ? "Welcome to Sawaari" : "Check your email"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {step === "signIn"
                ? "Electric autos, on demand. Sign in or create your account."
                : `We've sent a code to ${step.email}`}
            </p>
          </div>

          {step === "signIn" ? (
            <>
              {/* role selection */}
              <div className="mt-6">
                <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  I want to…
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <RoleCard
                    icon={<MapPin className="size-4" />}
                    title="Book a ride"
                    sub="Rider"
                    selected={role === "rider"}
                    onClick={() => setRole(role === "rider" ? null : "rider")}
                  />
                  <RoleCard
                    icon={<CarFront className="size-4" />}
                    title="Drive & earn"
                    sub="Driver"
                    selected={role === "driver"}
                    onClick={() => setRole(role === "driver" ? null : "driver")}
                  />
                </div>
              </div>

              <form onSubmit={handleEmailSubmit} className="mt-5">
                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      name="email"
                      placeholder="name@example.com"
                      type="email"
                      className="h-11 border-white/10 bg-white/5 pl-10 text-slate-100 placeholder:text-slate-500"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="icon"
                    disabled={isLoading}
                    className="h-11 w-11 border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 hover:text-emerald-200"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                  </Button>
                </div>
                {error && <p className="mt-2 text-center text-xs text-rose-300">{error}</p>}
              </form>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  or
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={handleGuestLogin}
                disabled={isLoading}
              >
                <UserX className="mr-2 size-4 text-emerald-300" />
                Continue as guest
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
                No password needed — we email a one-time code.{" "}
                {role
                  ? `You'll land in the ${role} dashboard.`
                  : "Pick a role above to choose your dashboard."}
              </p>
            </>
          ) : (
            <form onSubmit={handleOtpSubmit} className="mt-6">
              <input type="hidden" name="email" value={step.email} />
              <input type="hidden" name="code" value={otp} />
              <div className="flex justify-center">
                <InputOTP
                  value={otp}
                  onChange={setOtp}
                  maxLength={6}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                      const form = (e.target as HTMLElement).closest("form");
                      if (form) form.requestSubmit();
                    }
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="border-white/10 bg-white/5 text-slate-100"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <p className="mt-2 text-center text-xs text-rose-300">{error}</p>
              )}
              <p className="mt-4 text-center text-xs text-slate-500">
                Didn't receive a code?{" "}
                <button
                  type="button"
                  onClick={() => setStep("signIn")}
                  className="font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  Try again
                </button>
              </p>
              <Button
                type="submit"
                className="mt-5 h-11 w-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    Verify & continue
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("signIn")}
                disabled={isLoading}
                className="mt-2 w-full text-slate-400 hover:text-white"
              >
                Use a different email
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-white/10 pt-4 text-center text-[11px] text-slate-500">
            Secured by{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
            >
              freebuff.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  sub,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3.5 text-left transition-all",
        selected
          ? "border-emerald-400/50 bg-emerald-400/10 ring-2 ring-emerald-400/20"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]",
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg",
          selected
            ? "bg-emerald-400/20 text-emerald-300"
            : "bg-white/5 text-slate-400",
        )}
      >
        {icon}
      </span>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </button>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
