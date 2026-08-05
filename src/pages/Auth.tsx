import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { SawaariMark } from "@/components/SawaariLogo";
import { useAction } from "convex/react";
import {
  ArrowRight,
  CarFront,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
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
type Method = "phone" | "email";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const sendOtp = useAction(api.phoneOtp.sendOtp);
  const verifyOtp = useAction(api.phoneOtp.verifyOtp);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [role, setRole] = useState<RoleChoice>(null);
  const [method, setMethod] = useState<Method>("phone");

  // phone OTP
  const [phone, setPhone] = useState("");
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [otpMode, setOtpMode] = useState<"sms" | "demo" | null>(null);
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);

  // email OTP (real provider — freebuff email gateway)
  const [emailStep, setEmailStep] = useState<"signIn" | { email: string }>("signIn");
  const [emailOtp, setEmailOtp] = useState("");

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

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(
      () => setResendIn((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(t);
  }, [resendIn]);

  // Random night-sky positions, generated once via a lazy initializer so the
  // component stays a pure function of props/state (Math.random only at init).
  const [stars] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      top: Math.random() * 72,
      left: Math.random() * 100,
      size: Math.random() * 1.8 + 0.8,
      delay: Math.random() * 6,
      duration: 3 + Math.random() * 5,
      opacity: 0.25 + Math.random() * 0.6,
    })),
  );

  const isStart = method === "phone" ? phoneStep === "input" : emailStep === "signIn";

  const title =
    method === "phone"
      ? phoneStep === "otp"
        ? "Enter your code"
        : "Sign in to Sawaari"
      : emailStep === "signIn"
        ? "Sign in with email"
        : "Check your email";

  const subtitle =
    method === "phone"
      ? phoneStep === "otp"
        ? `We sent a 6-digit code to ${maskedPhone || `+91 ${phone}`}`
        : "Sign in to continue to Sawaari"
      : emailStep === "signIn"
        ? "No password needed — we email a one-time code."
        : `We've sent a code to ${emailStep.email}`;

  // ---- phone OTP ----------------------------------------------------------

  const sendPhoneOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const result = await sendOtp({ phone });
      setOtpMode(result.mode);
      setSentCode(result.mode === "demo" ? result.code : null);
      setMaskedPhone(result.maskedPhone);
      setPhoneOtp("");
      setResendIn(60);
      setPhoneStep("otp");
    } catch (error) {
      console.error("Send OTP error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send the code. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await sendOtp({ phone });
      setOtpMode(result.mode);
      setSentCode(result.mode === "demo" ? result.code : null);
      setMaskedPhone(result.maskedPhone);
      setPhoneOtp("");
      setResendIn(60);
    } catch (error) {
      console.error("Resend OTP error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to resend the code. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const verifyPhoneOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phoneOtp.length !== 6) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await verifyOtp({ phone, code: phoneOtp });
      if (!result.valid) {
        setError("The code you entered doesn't match. Please try again.");
        setPhoneOtp("");
        setShakeKey((k) => k + 1);
        setIsLoading(false);
        return;
      }
      await signIn("anonymous");
      navigate(target);
    } catch (error) {
      console.error("Phone OTP sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Sign-in failed. Please try again.",
      );
      setIsLoading(false);
    }
  };

  // ---- email OTP (existing working flow) -----------------------------------

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setEmailStep({ email: formData.get("email") as string });
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
      setEmailOtp("");
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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05070d] px-4 py-10">
      {/* night sky */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(22,32,52,0.85),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_75%,rgba(16,26,44,0.5),transparent_60%)]" />

      {/* stars */}
      <div className="pointer-events-none absolute inset-0">
        {stars.map((s) => (
          <span
            key={s.id}
            className="sawa-star absolute rounded-full bg-white"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      {/* glowing moon */}
      <div className="pointer-events-none absolute -right-10 -top-6 sm:right-[9%] sm:top-[5%]">
        <div className="relative">
          <div className="absolute -inset-8 rounded-full bg-[#c9d4e8]/20 blur-3xl" />
          <div className="relative size-24 rounded-full bg-gradient-to-br from-[#f6f9fd] via-[#dde6f2] to-[#a9bad2] shadow-[0_0_70px_24px_rgba(201,212,232,0.28)] sm:size-32">
            <span className="absolute left-5 top-6 size-3.5 rounded-full bg-[#c3cfe2]/70" />
            <span className="absolute right-6 top-12 size-2.5 rounded-full bg-[#c3cfe2]/60" />
            <span className="absolute bottom-5 left-9 size-1.5 rounded-full bg-[#c3cfe2]/50" />
            <span className="absolute left-12 top-3 size-1 rounded-full bg-[#c3cfe2]/50" />
          </div>
        </div>
      </div>

      {/* desert dunes silhouette */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 h-[34vh] w-full"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0,192 C240,128 480,64 720,96 C960,128 1200,192 1440,128 L1440,320 L0,320 Z"
          fill="#0a0f1a"
        />
        <path
          d="M0,256 C300,192 640,224 960,192 C1200,168 1320,224 1440,208 L1440,320 L0,320 Z"
          fill="#060a12"
        />
      </svg>

      {/* horizon glow + grain */}
      <div className="pointer-events-none absolute bottom-[-8%] left-1/2 h-72 w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="grain pointer-events-none absolute inset-0" />

      {/* glass card */}
      <div className="relative w-full max-w-[430px]">
        <div className="absolute -inset-1 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-400/20 via-transparent to-teal-400/20 blur-lg" />
        <div
          className="relative rounded-[2rem] bg-white/[0.055] p-7 sm:p-8"
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), 0 40px 90px -24px rgba(0,0,0,0.85)",
          }}
        >
          {/* sheen */}
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

          {/* brand */}
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
              {title}
            </h1>
            <p className="mt-1.5 font-serif text-base italic text-slate-400">
              {subtitle}
            </p>
          </div>

          {/* method tabs */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => {
                setMethod("phone");
                setError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all",
                method === "phone"
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Phone className="size-3.5" />
              Phone OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod("email");
                setError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all",
                method === "email"
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Mail className="size-3.5" />
              Email OTP
            </button>
          </div>

          {isStart && (
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <RoleCard
                icon={<MapPin className="size-4" />}
                title="Book a rickshaw"
                sub="Customer"
                selected={role === "rider"}
                onClick={() => setRole(role === "rider" ? null : "rider")}
              />
              <RoleCard
                icon={<CarFront className="size-4" />}
                title="Drive with SAWAARI"
                sub="Driver"
                selected={role === "driver"}
                onClick={() => setRole(role === "driver" ? null : "driver")}
              />
            </div>
          )}

          {/* ---- phone flow ---- */}
          {method === "phone" && phoneStep === "input" && (
            <form onSubmit={sendPhoneOtp} className="mt-5">
              <div className="flex items-center gap-2">
                <div className="flex h-12 flex-1 items-center rounded-full border border-white/10 bg-white/[0.05] pl-4 transition-colors focus-within:border-emerald-400/40">
                  <Phone className="size-4 shrink-0 text-slate-500" />
                  <span className="ml-2 text-sm font-semibold text-slate-300">+91</span>
                  <Input
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))
                    }
                    placeholder="Mobile number"
                    inputMode="numeric"
                    autoComplete="tel"
                    className="h-full border-0 bg-transparent pl-2 text-slate-100 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isLoading}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="glass-strong h-12 shrink-0 rounded-full px-5 font-semibold text-white hover:bg-white/15"
                  disabled={isLoading || phone.replace(/\D/g, "").length < 10}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </div>
              {error && (
                <p className="mt-2 text-center text-xs text-rose-300">{error}</p>
              )}
            </form>
          )}

          {method === "phone" && phoneStep === "otp" && (
            <form
              onSubmit={verifyPhoneOtp}
              key={shakeKey}
              className={cn("mt-5", shakeKey > 0 && "sawa-shake")}
            >
              {otpMode === "demo" ? (
                /* no Vonage credentials yet — surface the code for testing */
                <div className="mx-auto rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-center text-xs text-emerald-200">
                  Demo mode — your code is{" "}
                  <span className="font-mono text-sm font-bold tracking-[0.2em]">
                    {sentCode}
                  </span>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-500">
                  An SMS with your code is on its way to {maskedPhone}.
                </p>
              )}

              <div className="mt-4 flex justify-center">
                <InputOTP
                  value={phoneOtp}
                  onChange={setPhoneOtp}
                  maxLength={6}
                  disabled={isLoading}
                  containerClassName="gap-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phoneOtp.length === 6 && !isLoading) {
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
                        className="size-11 rounded-xl border-white/15 bg-white/[0.05] text-slate-100 data-[active=true]:border-emerald-400/50 data-[active=true]:ring-emerald-400/20"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && (
                <p className="mt-2 text-center text-xs text-rose-300">{error}</p>
              )}

              <div className="mt-4 text-center text-xs text-slate-500">
                {resendIn > 0 ? (
                  <span>
                    Resend code in{" "}
                    <span className="font-mono font-semibold text-slate-300">
                      0:{String(resendIn).padStart(2, "0")}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={resendCode}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-300 transition-colors hover:text-emerald-200"
                  >
                    <RefreshCw className="size-3" />
                    Resend code
                  </button>
                )}
              </div>

              <Button
                type="submit"
                className="mt-5 h-12 w-full rounded-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                disabled={isLoading || phoneOtp.length !== 6}
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
                onClick={() => {
                  setPhoneStep("input");
                  setError(null);
                }}
                disabled={isLoading}
                className="mt-2 w-full text-slate-400 hover:text-white"
              >
                Use a different number
              </Button>
            </form>
          )}

          {/* ---- email flow ---- */}
          {method === "email" && emailStep === "signIn" && (
            <form onSubmit={handleEmailSubmit} className="mt-5">
              <div className="flex items-center gap-2">
                <div className="flex h-12 flex-1 items-center rounded-full border border-white/10 bg-white/[0.05] pl-4 transition-colors focus-within:border-emerald-400/40">
                  <Mail className="size-4 shrink-0 text-slate-500" />
                  <Input
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    className="h-full border-0 bg-transparent pl-3 text-slate-100 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isLoading}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  disabled={isLoading}
                  className="glass-strong size-12 shrink-0 rounded-full text-emerald-300 hover:bg-white/15 hover:text-emerald-200"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </div>
              {error && (
                <p className="mt-2 text-center text-xs text-rose-300">{error}</p>
              )}
            </form>
          )}

          {method === "email" && emailStep !== "signIn" && (
            <form onSubmit={handleOtpSubmit} className="mt-6">
              <input type="hidden" name="email" value={emailStep.email} />
              <input type="hidden" name="code" value={emailOtp} />
              <div className="flex justify-center">
                <InputOTP
                  value={emailOtp}
                  onChange={setEmailOtp}
                  maxLength={6}
                  disabled={isLoading}
                  containerClassName="gap-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && emailOtp.length === 6 && !isLoading) {
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
                        className="size-11 rounded-xl border-white/15 bg-white/[0.05] text-slate-100 data-[active=true]:border-emerald-400/50 data-[active=true]:ring-emerald-400/20"
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
                  onClick={() => setEmailStep("signIn")}
                  className="font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  Try again
                </button>
              </p>
              <Button
                type="submit"
                className="mt-5 h-12 w-full rounded-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                disabled={isLoading || emailOtp.length !== 6}
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
                onClick={() => setEmailStep("signIn")}
                disabled={isLoading}
                className="mt-2 w-full text-slate-400 hover:text-white"
              >
                Use a different email
              </Button>
            </form>
          )}

          {/* guest alternative */}
          {isStart && (
            <>
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
                className="h-11 w-full rounded-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={handleGuestLogin}
                disabled={isLoading}
              >
                <UserX className="mr-2 size-4 text-emerald-300" />
                Continue as guest
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
                {role
                  ? `You'll land in the ${
                      role === "rider" ? "customer" : "driver"
                    } area.`
                  : "Pick a role above to choose where you land."}
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Secured by{" "}
          <a
            href="https://freebuff.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
          >
            freebuff.com
          </a>
        </p>
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
