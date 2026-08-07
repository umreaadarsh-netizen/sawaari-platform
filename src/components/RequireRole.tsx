import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export type ProtectedRole = "rider" | "driver" | "admin";

/**
 * Role-based route guard. Renders nothing until Convex Auth's loading state
 * settles (so children never mount mid-authentication and fire queries or
 * mutations with a half-initialized session), then:
 *
 *  - unauthenticated → `/auth?returnTo=<current path>` (preserving the intent)
 *  - wrong role      → `fallback`
 *  - otherwise       → children
 *
 * Driver rule: a confirmed *rider* is kept out of the driver workspace, but
 * users without a role yet may enter it — the driver dashboard's onboarding
 * (saveProfile) is what grants the `driver` role in the first place.
 */
export function RequireRole({
  role,
  fallback,
  children,
}: {
  role: ProtectedRole;
  fallback: string;
  children: ReactNode;
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  const allowed =
    role === "driver"
      ? user.role !== "rider" // riders bounce; everyone else may onboard
      : user.role === role;

  if (!allowed) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}
