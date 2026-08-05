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
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    if (!enabled || !from || !to) {
      setRoadRoute(null);
      return;
    }
    let cancelled = false;
    setRoadRoute(null);
    void fetchOsrmRoute(from, to).then((path) => {
      if (!cancelled) setRoadRoute(path);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, from?.lat, from?.lng, to?.lat, to?.lng]);

  return roadRoute;
}
