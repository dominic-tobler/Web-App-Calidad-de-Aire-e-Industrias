import type { Map as LeafletMap, MapOptions } from "leaflet"

/** Zoom fraccionario y rueda más fina, para que el scroll no salte de nivel en nivel. */
export const smoothMapOptions = {
  zoomSnap: 0,
  zoomDelta: 0.5,
  wheelDebounceTime: 16,
  wheelPxPerZoomLevel: 80,
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  inertia: true,
  inertiaDeceleration: 2200,
  inertiaMaxSpeed: 1800,
  easeLinearity: 0.25,
} satisfies Pick<
  MapOptions,
  | "zoomSnap"
  | "zoomDelta"
  | "wheelDebounceTime"
  | "wheelPxPerZoomLevel"
  | "zoomAnimation"
  | "fadeAnimation"
  | "markerZoomAnimation"
  | "inertia"
  | "inertiaDeceleration"
  | "inertiaMaxSpeed"
  | "easeLinearity"
>

export function flyZoom(map: LeafletMap, delta: number) {
  const next = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta))
  map.flyTo(map.getCenter(), next, { duration: 0.35, easeLinearity: 0.25 })
}
