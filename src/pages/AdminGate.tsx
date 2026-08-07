import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRole } from "@/components/RequireRole";
import AdminDashboard from "./AdminDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SawaariMark } from "@/components/SawaariLogo";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";

// ---- password & session ---------------------------------------------------

const ADMIN_PASSWORD = "SAFESAWAARI10)";
const SESSION_KEY = "sawaari_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Derive a SHA-256 digest (hex) of a string. Used to sign the session token
 * with the password so a forged token is rejected.
 */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Issue a signed token: `sha256(password . issuedAt) . issuedAt`. */
async function issueToken(): Promise<string> {
  const issuedAt = Date.now();
  const signature = await sha256Hex(`${ADMIN_PASSWORD}.${issuedAt}`);
  return `${signature}.${issuedAt}`;
}

/** Validate a stored token: correct signature and not expired. */
async function isValidToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const [signature, issuedAtRaw] = token.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (!signature || !Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_TTL_MS) return false;
  const expected = await sha256Hex(`${ADMIN_PASSWORD}.${issuedAt}`);
  return signature === expected;
}

// ---- gate -----------------------------------------------------------------

export default function AdminGate() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Restore a valid session on load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const valid = await isValidToken(sessionStorage.getItem(SESSION_KEY));
      if (!cancelled) {
        setUnlocked(valid);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnlock = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      if (password !== ADMIN_PASSWORD) {
        setError("Incorrect password. Redirecting to the main page…");
        setShakeKey((k) => k + 1);
        setPassword("");
        window.setTimeout(() => navigate("/"), 1400);
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        const token = await issueToken();
        sessionStorage.setItem(SESSION_KEY, token);
        setUnlocked(true);
      } catch {
        setError("Could not start a session. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting, navigate],
  );

  const handleLock = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false);
    setPassword("");
    setError(null);
  }, []);

  if (checking) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center bg-[#05070d]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[380px] w-[640px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[130px]" />
          <div className="grain absolute inset-0" />
        </div>
        <Loader2 className="relative size-6 animate-spin text-amber-300" />
      </div>
    );
  }

  if (unlocked) {
    return (
      <div className="relative min-h-dvh bg-background">
        {/* The password gate is UX-only — the backend admin functions still
            require the `admin` role, and this guard bounces non-admins back
            to the landing page instead of showing error states. */}
        <RequireAuth>
          <RequireRole role="admin" fallback="/">
            <AdminDashboard />
          </RequireRole>
        </RequireAuth>
        <button
          type="button"
          onClick={handleLock}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/80 px-4 py-2.5 text-xs font-semibold text-slate-300 shadow-2xl shadow-black/50 backdrop-blur-xl transition-all hover:border-rose-400/30 hover:text-rose-300"
          title="Lock the admin panel"
        >
          <Lock className="size-3.5" />
          Lock panel
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#05070d] px-4">
      {/* ambient night background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute bottom-0 -left-32 h-[340px] w-[340px] rounded-full bg-orange-500/[0.06] blur-[120px]" />
        <div className="absolute -right-24 top-1/3 h-[300px] w-[300px] rounded-full bg-sky-500/[0.06] blur-[110px]" />
        <div className="grain absolute inset-0" />
      </div>

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-2 py-5 sm:px-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="transition-opacity hover:opacity-80"
          aria-label="Back to home"
        >
          <SawaariMark className="size-9" />
        </button>
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Button>
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-[400px]">
          <div className="absolute -inset-1 -z-10 rounded-[2rem] bg-gradient-to-br from-amber-400/20 via-transparent to-orange-400/20 blur-lg" />
          <div
            key={shakeKey}
            className={cn(
              "relative rounded-[2rem] bg-white/[0.055] p-7 sm:p-8",
              shakeKey > 0 && "sawa-shake",
            )}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.12), 0 40px 90px -24px rgba(0,0,0,0.85)",
            }}
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            <div className="flex flex-col items-center text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
                <ShieldCheck className="size-7" />
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-white">
                Admin console
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                This area is restricted. Enter the administrator password to
                continue.
              </p>
            </div>

            <form onSubmit={(e) => void handleUnlock(e)} className="mt-6">
              <div className="flex h-12 items-center rounded-full border border-white/10 bg-white/[0.05] pl-4 transition-colors focus-within:border-amber-400/40">
                <KeyRound className="size-4 shrink-0 text-slate-500" />
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Administrator password"
                  autoComplete="current-password"
                  autoFocus
                  className="h-full border-0 bg-transparent pl-3 text-slate-100 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="mr-2 rounded-full p-1.5 text-slate-400 transition-colors hover:text-amber-300"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {error && (
                <p className="mt-2.5 text-center text-xs text-rose-300">{error}</p>
              )}

              <Button
                type="submit"
                disabled={submitting || !password}
                className="mt-5 h-12 w-full rounded-full bg-amber-400 text-[15px] font-semibold text-amber-950 hover:bg-amber-300"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <Lock className="size-4" /> Unlock admin panel
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-500">
              Authorized personnel only. Session expires automatically after 12
              hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
