import type { Position } from "geojson"

const EARTH_RADIUS_KM = 6371

export function haversineKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latitudeDelta = toRadians(latitudeB - latitudeA)
  const longitudeDelta = toRadians(longitudeB - longitudeA)
  const start = toRadians(latitudeA)
  const end = toRadians(latitudeB)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(start) * Math.cos(end) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

export function formatDistance(kilometers: number): string {
  if (kilometers < 1) {
    return `${Math.round(kilometers * 1000).toLocaleString("es-CO")} m`
  }
  return `${kilometers.toLocaleString("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`
}

export function ringContains(ring: Position[], longitude: number, latitude: number): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLng, currentLat] = ring[index]
    const [previousLng, previousLat] = ring[previous]
    const crosses = currentLat > latitude !== previousLat > latitude
    if (!crosses) continue
    const intersection =
      ((previousLng - currentLng) * (latitude - currentLat)) / (previousLat - currentLat) +
      currentLng
    if (longitude < intersection) inside = !inside
  }
  return inside
}

export function polygonContains(
  rings: Position[][],
  longitude: number,
  latitude: number,
): boolean {
  const [exterior, ...holes] = rings
  if (!exterior || !ringContains(exterior, longitude, latitude)) return false
  return holes.every((hole) => !ringContains(hole, longitude, latitude))
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
