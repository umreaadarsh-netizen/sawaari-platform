import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo";
import { fetchOsrmRoute } from "@/lib/geo";

/**
 * Fetch a real road route between two points (OSRM, keyless) for an active
 * ride, exposing it as state. Returns null while loading/disabled; consumers
 * can fall back to the curved `buildRoutePath` estimate in the meantime.
 */
export function useRoadRoute(
  from: LatLng | null,
  to: LatLng | null,
  enabled = true,
): [number, number][] | null {
  // One result is kept at a time, tagged with the request key it belongs to.
  // Deriving the key during render keeps a stale route out of view the moment
  // the endpoints change — no state resets inside the effect.
  const [result, setResult] = useState<{
    key: string;
    path: [number, number][];
  } | null>(null);
  const key =
    !enabled || !from || !to
      ? null
      : `${from.lat},${from.lng}-${to.lat},${to.lng}`;

  useEffect(() => {
    if (!enabled || !from || !to || !key) return;
    let cancelled = false;
    void fetchOsrmRoute(from, to).then((path) => {
      if (!cancelled) setResult({ key, path });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, from, to, key]);

  return key && result?.key === key ? result.path : null;
}
