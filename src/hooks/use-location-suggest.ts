import { useCallback, useRef, useState } from "react";

export interface PlaceSuggestion {
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
let lastRequest = 0;

/**
 * Debounced forward-geocoding autocomplete (OpenStreetMap Nominatim).
 * No API key needed; queries are rate-limited to ~1/sec and cached per query.
 */
export function useLocationSuggest() {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const cache = useRef(new Map<string, PlaceSuggestion[]>());

  const search = useCallback((raw: string) => {
    const q = raw.trim();
    if (timer.current) window.clearTimeout(timer.current);
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const cached = cache.current.get(q);
      if (cached) {
        setSuggestions(cached);
        setLoading(false);
        return;
      }
      const wait = Math.max(0, 500 - (Date.now() - lastRequest));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequest = Date.now();
      try {
        const res = await fetch(
          `${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(
            q,
          )}&limit=6&countrycodes=in&addressdetails=1`,
        );
        if (!res.ok) throw new Error("geocoding failed");
        const data = (await res.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
        }>;
        const list: PlaceSuggestion[] = data.map((d) => {
          const parts = d.display_name.split(",");
          return {
            label: parts.slice(0, 2).join(","),
            sublabel: d.display_name,
            lat: parseFloat(d.lat),
            lng: parseFloat(d.lon),
          };
        });
        cache.current.set(q, list);
        setSuggestions(list);
      } catch {
        setSuggestions([]);
      }
      setLoading(false);
    }, 380);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSuggestions([]);
    setLoading(false);
  }, []);

  return { suggestions, loading, search, clear };
}

/** Reverse-geocode a tapped map point into a readable address. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    );
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
