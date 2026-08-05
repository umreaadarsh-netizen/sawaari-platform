import { useEffect, useState } from "react";

/**
 * Current epoch-ms timestamp as state, ticking on an interval. Lets
 * time-dependent UI (scheduled pickups, min/max bounds) stay a pure function
 * of state instead of calling Date.now() during render — the same tick is
 * shared by every check in a component, so the UI flips together.
 */
export function useNow(tickMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}
