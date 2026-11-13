import stationsCsv from "../../Data/air_quality_stations.csv?raw"
import { haversineKm, polygonContains } from "../domain/geo"
import type { Industry } from "../domain/industry"
import type { Station, StationLink } from "../domain/station"
import { municipalities } from "./municipalities"

const NEAREST_LIMIT = 3

export const stations: Station[] = parseStations(stationsCsv)
  .map((station) => ({
    ...station,
    municipality: municipalityAt(station.longitude, station.latitude),
  }))
  .sort((left, right) => Number(left.id) - Number(right.id))

export function nearestIndustries(station: Station, candidates: Industry[]): StationLink[] {
  return candidates
    .map((industry) => ({
      industry,
      distanceKm: haversineKm(
        station.latitude,
        station.longitude,
        industry.latitude,
        industry.longitude,
      ),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, NEAREST_LIMIT)
}

function parseStations(csv: string): Omit<Station, "municipality">[] {
  const [header, ...rows] = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/)
  const columns = header.split(",").map((column) => column.trim())
  const idIndex = columns.indexOf("id")
  const stateIndex = columns.indexOf("state")
  const latitudeIndex = columns.indexOf("latitude")
  const longitudeIndex = columns.indexOf("longitude")

  return rows.filter(Boolean).flatMap((row) => {
    const cells = row.split(",")
    const latitude = Number(cells[latitudeIndex])
    const longitude = Number(cells[longitudeIndex])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
    return [
      {
        id: cells[idIndex].trim(),
        active: cells[stateIndex].trim() === "ACT",
        latitude,
        longitude,
      },
    ]
  })
}

function municipalityAt(longitude: number, latitude: number): string | null {
  for (const feature of municipalities.features) {
    const geometry = feature.geometry
    if (!geometry) continue
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
    const inside = polygons.some((polygon) => polygonContains(polygon, longitude, latitude))
    if (inside) return feature.properties.name
  }
  return null
}
