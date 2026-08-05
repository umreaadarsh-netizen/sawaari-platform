import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

export type MarkerKind = "pickup" | "dropoff" | "driver" | "driver-idle";

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  position: [number, number];
  label?: string;
}

interface SawaariMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  /** The trip route (e.g. pickup → drop-off). Drawn as the solid emerald line. */
  route?: [number, number][];
  /** Live approach vector (e.g. driver → pickup). Drawn as the dashed amber line. */
  approachRoute?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  interactive?: boolean;
  /** When this key changes, the map flies/fits to the current markers + routes. */
  focusKey?: string;
}

const ICON_HTML: Record<MarkerKind, string> = {
  pickup: `<div class="sawa-pin"><span class="sawa-pin__ring"></span><span class="sawa-pin__core sawa-pin__core--pickup"></span></div>`,
  dropoff: `<div class="sawa-pin"><span class="sawa-pin__core sawa-pin__core--dropoff"></span></div>`,
  driver: `<div class="sawa-pin"><span class="sawa-pin__ring"></span><span class="sawa-pin__core sawa-pin__core--driver"><svg viewBox="0 0 24 24" class="sawa-pin__bolt" fill="currentColor"><path d="M13.2 1.8 3.4 14.2h6.4l-1 8 9.8-12.4h-6.4l1-8z"/></svg></span></div>`,
  "driver-idle": `<div class="sawa-pin"><span class="sawa-pin__ring sawa-pin__ring--slow"></span><span class="sawa-pin__core sawa-pin__core--idle"></span></div>`,
};

const ICON_SIZE: Record<MarkerKind, [number, number]> = {
  pickup: [30, 30],
  dropoff: [30, 30],
  driver: [38, 38],
  "driver-idle": [22, 22],
};

function markerIcon(kind: MarkerKind): L.DivIcon {
  return L.divIcon({
    className: "",
    html: ICON_HTML[kind],
    iconSize: ICON_SIZE[kind],
    iconAnchor: [ICON_SIZE[kind][0] / 2, ICON_SIZE[kind][1] / 2],
    tooltipAnchor: [0, -18],
  });
}

export function SawaariMap({
  center = [12.9716, 77.5946],
  zoom = 13,
  markers = [],
  route,
  approachRoute,
  onMapClick,
  className,
  interactive = true,
  focusKey,
}: SawaariMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeRef = useRef<L.Polyline[]>([]);
  const approachRef = useRef<L.Polyline[]>([]);
  const onMapClickRef = useRef(onMapClick);
  const latestRef = useRef({ markers, route, approachRoute });
  // Keep the latest props reachable from effects without re-running them.
  // Runs after every render — and before the focus effect below — so a
  // focusKey change always sees the freshest markers/routes.
  useEffect(() => {
    onMapClickRef.current = onMapClick;
    latestRef.current = { markers, route, approachRoute };
  });

  const svgRenderer = useMemo(() => L.svg(), []);

  // ---- init ---------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    const t = window.setTimeout(() => map.invalidateSize(), 180);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- markers ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    markers.forEach((mk) => {
      const marker = L.marker(mk.position, {
        icon: markerIcon(mk.kind),
        interactive: false,
      });
      if (mk.label) {
        marker.bindTooltip(mk.label, {
          direction: "top",
          className: "sawa-tooltip",
          opacity: 1,
        });
      }
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [markers]);

  // ---- trip route ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeRef.current.forEach((p) => p.remove());
    routeRef.current = [];
    if (route && route.length >= 2) {
      const casing = L.polyline(route, {
        color: "#065f46",
        weight: 9,
        opacity: 0.85,
        lineCap: "round",
        renderer: svgRenderer,
      }).addTo(map);
      const line = L.polyline(route, {
        color: "#34d399",
        weight: 4,
        opacity: 0.95,
        lineCap: "round",
        renderer: svgRenderer,
      }).addTo(map);
      routeRef.current = [casing, line];
    }
  }, [route, svgRenderer]);

  // ---- approach vector ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    approachRef.current.forEach((p) => p.remove());
    approachRef.current = [];
    if (approachRoute && approachRoute.length >= 2) {
      const casing = L.polyline(approachRoute, {
        color: "#78350f",
        weight: 7,
        opacity: 0.7,
        dashArray: "1 10",
        lineCap: "round",
        renderer: svgRenderer,
      }).addTo(map);
      const line = L.polyline(approachRoute, {
        color: "#fbbf24",
        weight: 3,
        opacity: 0.95,
        dashArray: "6 8",
        lineCap: "round",
        renderer: svgRenderer,
      }).addTo(map);
      approachRef.current = [casing, line];
    }
  }, [approachRoute, svgRenderer]);

  // ---- focus --------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusKey) return;
    const { markers: ms, route: rt, approachRoute: ar } = latestRef.current;
    const points = [...ms.map((m) => m.position), ...(rt ?? []), ...(ar ?? [])];
    const t = window.setTimeout(() => {
      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points), {
          padding: [56, 56],
          maxZoom: 16,
        });
      } else if (points.length === 1) {
        map.flyTo(points[0], Math.max(map.getZoom(), 14), { duration: 0.9 });
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusKey]);

  return (
    <div
      ref={containerRef}
      className={cn("z-0 h-full w-full", className)}
      aria-label="Interactive map"
    />
  );
}
