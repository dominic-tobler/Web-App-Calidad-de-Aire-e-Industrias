import type { Industry } from "./industry"

export type Station = {
  id: string
  active: boolean
  latitude: number
  longitude: number
  municipality: string | null
}

export type StationLink = {
  industry: Industry
  distanceKm: number
}

export function stationTitle(station: Station): string {
  return `Estación ${station.id}`
}

export function stationStatusLabel(station: Station): string {
  return station.active ? "Activa" : "Inactiva"
}
