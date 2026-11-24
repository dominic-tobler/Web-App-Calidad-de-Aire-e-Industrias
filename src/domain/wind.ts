import type { WindHour } from "../data/observations"
import { haversineKm } from "./geo"
import type { Industry } from "./industry"
import type { Station, StationLink } from "./station"

// Radio con el que el mapa común elige industrias alrededor de la estación.
export const SEARCH_RADIUS_KM = 15
// Por debajo de esta velocidad la dirección no es confiable.
const CALM_MS = 0.5

// Misma rosa de 16 rumbos que la vista experta, para poder separar lados vecinos
// como oeste, oeste-suroeste y suroeste.
export const WIND_SECTORS = [
  { short: "N", name: "norte" },
  { short: "NNE", name: "nornoreste" },
  { short: "NE", name: "noreste" },
  { short: "ENE", name: "estenoreste" },
  { short: "E", name: "este" },
  { short: "ESE", name: "estesureste" },
  { short: "SE", name: "sureste" },
  { short: "SSE", name: "sursureste" },
  { short: "S", name: "sur" },
  { short: "SSO", name: "sursuroeste" },
  { short: "SO", name: "suroeste" },
  { short: "OSO", name: "oestesuroeste" },
  { short: "O", name: "oeste" },
  { short: "ONO", name: "oestenoroeste" },
  { short: "NO", name: "noroeste" },
  { short: "NNO", name: "nornoroeste" },
] as const

export const WIND_SECTOR_DEG = 360 / WIND_SECTORS.length
// Las regiones que concentran el viento, igual que el abanico de la vista experta.
export const MAIN_REGION_COUNT = 3

export type WindRegion = {
  sector: number
  hours: number
  share: number
}

export type DailyWind = {
  counts: number[]
  directed: number
  calm: number
  regions: WindRegion[]
}

export function dailyWind(hours: WindHour[]): DailyWind {
  const counts = Array<number>(WIND_SECTORS.length).fill(0)
  let calm = 0
  for (const sample of hours) {
    if (sample.speed != null && sample.speed < CALM_MS) {
      calm += 1
      continue
    }
    counts[sectorOf(sample.direction)] += 1
  }
  const directed = counts.reduce((sum, count) => sum + count, 0)
  const regions = counts
    .map((hours, sector) => ({ sector, hours, share: directed ? hours / directed : 0 }))
    .filter((item) => item.hours > 0)
    .sort((left, right) => right.hours - left.hours)
    .slice(0, MAIN_REGION_COUNT)
  return { counts, directed, calm, regions }
}

export function industriesInWindRadius(
  station: Station,
  candidates: Industry[],
  regions: readonly WindRegion[],
): StationLink[] {
  return candidates
    .map((industry) => ({
      industry,
      distanceKm: haversineKm(
        station.latitude,
        station.longitude,
        industry.latitude,
        industry.longitude,
      ),
      bearing: bearingTo(
        station.latitude,
        station.longitude,
        industry.latitude,
        industry.longitude,
      ),
    }))
    .filter((item) => item.distanceKm <= SEARCH_RADIUS_KM)
    .filter((item) => regions.length === 0 || regions.some((region) => inSector(item.bearing, region.sector)))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map(({ industry, distanceKm }) => ({ industry, distanceKm }))
}

export function destination(
  latitude: number,
  longitude: number,
  bearing: number,
  kilometers: number,
): [number, number] {
  const radius = 6371
  const delta = kilometers / radius
  const theta = (bearing * Math.PI) / 180
  const phi1 = (latitude * Math.PI) / 180
  const lambda1 = (longitude * Math.PI) / 180
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    )
  return [(phi2 * 180) / Math.PI, (lambda2 * 180) / Math.PI]
}

function sectorOf(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return Math.floor(((normalized + WIND_SECTOR_DEG / 2) % 360) / WIND_SECTOR_DEG)
}

function inSector(bearing: number, sector: number): boolean {
  return angularGap(bearing, sector * WIND_SECTOR_DEG) <= WIND_SECTOR_DEG / 2
}

function angularGap(left: number, right: number): number {
  const gap = Math.abs(left - right) % 360
  return gap > 180 ? 360 - gap : gap
}

function bearingTo(
  latitude: number,
  longitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const phi1 = (latitude * Math.PI) / 180
  const phi2 = (toLatitude * Math.PI) / 180
  const deltaLambda = ((toLongitude - longitude) * Math.PI) / 180
  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
