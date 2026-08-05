import { useCallback, useRef, useState } from "react";

export interface PlaceSuggestion {
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
let lastRequest = 0;

// India bounding box (left, top, right, bottom) so autocomplete and reverse
// geocoding always resolve inside the country — never placeholder regions.
const INDIA_VIEWBOX = "68.0,37.1,97.4,6.5";

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
          )}&limit=6&countrycodes=in&addressdetails=1&viewbox=${INDIA_VIEWBOX}&bounded=1`,
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

/**
 * Reverse-geocode a coordinate pair (GPS fix or tapped map point) into a
 * short, readable address — e.g. the street/village/town line rather than
 * the full international display name. Falls back to raw coordinates.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as { display_name?: string };
    if (!data.display_name) return fallback;
    const parts = data.display_name
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.slice(0, 3).join(", ");
  } catch {
    return fallback;
  }
}
