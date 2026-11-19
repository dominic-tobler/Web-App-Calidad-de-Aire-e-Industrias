import { placeWithDepartment, type Industry } from "./industry"

export type Station = {
  id: string
  active: boolean
  latitude: number
  longitude: number
  municipality: string | null
  department: string | null
}

export type StationLink = {
  industry: Industry
  distanceKm: number
}

export function stationPlace(station: Station): string {
  if (!station.municipality) return "Municipio sin asignar"
  return placeWithDepartment(station.municipality, station.department)
}

export function stationTitle(station: Station): string {
  return `Estación ${station.id}`
}

export function stationStatusLabel(station: Station): string {
  return station.active ? "Activa" : "Inactiva"
}
