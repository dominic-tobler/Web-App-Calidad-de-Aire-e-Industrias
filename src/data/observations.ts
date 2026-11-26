import measurementsUrl from "../../Data/datos_24_25.csv?url"
import type { Pollutant } from "../domain/airQuality"
import { colombiaFromUtc } from "../domain/time"

export type Observation = {
  pollutant: Pollutant
  stationId: string
  year: number
  month: number
  day: number
  hour: number
  value: number
}

const VARIABLE_POLLUTANT: Record<string, Pollutant> = {
  PM2: "pm25",
  PM10: "pm10",
  No2: "no2",
  So2: "so2",
  Co: "co",
  O3: "o3",
}

// Los valores inválidos (9999, saturación 985, fuera de rango) ya se quitan en
// Preprocessing/Limpiar_datos.ipynb: aquí cada fila del CSV es una medición válida.

const readingsByHour = new Map<string, Record<string, number>>()
const seriesByStation = new Map<string, Array<number | null>>()
const totalsByDay = new Map<string, { sum: number[]; count: number[] }>()
const directionByHour = new Map<string, Record<string, number>>()
const speedByHour = new Map<string, Record<string, number>>()
// Meses (año * 12 + mes) con al menos una medición de algún contaminante.
const monthsWithData = new Set<number>()

export type WindHour = {
  hour: number
  direction: number
  speed: number | null
}

let pending: Promise<void> | null = null

export function loadObservations(): Promise<void> {
  pending ??= fetch(measurementsUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo leer datos_24_25.csv (${response.status})`)
      return response.text()
    })
    .then(parseObservations)
  return pending
}

export function readingAt(
  pollutant: Pollutant,
  stationId: string,
  year: number,
  month: number,
  day: number,
  hour: number,
): number | null {
  return readingsByHour.get(hourKey(pollutant, year, month, day, hour))?.[stationId] ?? null
}

export function readingsAtHour(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  hour: number,
): Record<string, number> {
  return readingsByHour.get(hourKey(pollutant, year, month, day, hour)) ?? {}
}

export function hourlySeries(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  stationId: string | null,
): Array<number | null> {
  if (stationId) {
    return seriesByStation.get(dayKey(pollutant, year, month, day, stationId)) ?? emptyHours()
  }
  return averageOfAllStations(pollutant, year, month, day)
}

// Null: promedio de todas las estaciones. Lista: promedio de esas estaciones
// (por ejemplo las de un municipio). Una lista vacía no tiene mediciones.
export function hourlySeriesForStations(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  stationIds: readonly string[] | null,
): Array<number | null> {
  if (stationIds == null) return averageOfAllStations(pollutant, year, month, day)
  if (stationIds.length === 0) return emptyHours()
  if (stationIds.length === 1) return hourlySeries(pollutant, year, month, day, stationIds[0])

  const sum = Array<number>(24).fill(0)
  const count = Array<number>(24).fill(0)
  for (const stationId of stationIds) {
    const series = seriesByStation.get(dayKey(pollutant, year, month, day, stationId))
    if (!series) continue
    for (let hour = 0; hour < 24; hour += 1) {
      const value = series[hour]
      if (value == null) continue
      sum[hour] += value
      count[hour] += 1
    }
  }
  return sum.map((total, hour) => (count[hour] === 0 ? null : total / count[hour]))
}

export type MonthRef = { year: number; month: number }

// Meses con mediciones de cualquier contaminante, en orden. Vacío mientras el CSV no ha cargado.
// No depende del contaminante elegido para que la navegación del calendario no cambie al filtrar.
export function monthsWithReadings(): MonthRef[] {
  return [...monthsWithData]
    .sort((left, right) => left - right)
    .map((cursor) => ({ year: Math.floor(cursor / 12), month: cursor % 12 }))
}

export function daysWithReadings(pollutant: Pollutant, year: number, month: number): number[] {
  return Object.keys(dailyAverageReadings(pollutant, year, month))
    .map(Number)
    .sort((left, right) => left - right)
}

// Misma cuenta que el nivel del día: media de las medias horarias.
export function dailyAverageReadings(
  pollutant: Pollutant,
  year: number,
  month: number,
): Record<number, number> {
  const averages: Record<number, number> = {}
  for (let day = 1; day <= 31; day += 1) {
    const totals = totalsByDay.get(dayKey(pollutant, year, month, day))
    if (!totals) continue
    const hourly = totals.sum.map((sum, hour) => (totals.count[hour] === 0 ? null : sum / totals.count[hour]))
    const average = averageReading(hourly)
    if (average != null) averages[day] = average
  }
  return averages
}

export function windOnDay(
  stationId: string,
  year: number,
  month: number,
  day: number,
): WindHour[] {
  const hours: WindHour[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    const key = windKey(year, month, day, hour)
    const direction = directionByHour.get(key)?.[stationId]
    if (direction == null || !Number.isFinite(direction)) continue
    const speed = speedByHour.get(key)?.[stationId]
    hours.push({
      hour,
      direction,
      speed: speed == null || !Number.isFinite(speed) ? null : speed,
    })
  }
  return hours
}

export function averageReading(values: Array<number | null>): number | null {
  let sum = 0
  let count = 0
  for (const value of values) {
    if (value == null) continue
    sum += value
    count += 1
  }
  return count === 0 ? null : sum / count
}

function parseObservations(csv: string): void {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/)
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    const cells = line.split(",")
    const code = cells[1]?.trim()
    const value = Number(cells[2])
    const stationId = cells[5]?.trim()
    const stamp = cells[0]
    if (!code || !stationId || !Number.isFinite(value)) continue
    const year = Number(stamp.slice(0, 4))
    const month = Number(stamp.slice(5, 7)) - 1
    const day = Number(stamp.slice(8, 10))
    const hour = Number(stamp.slice(11, 13))
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
    const local = colombiaFromUtc(year, month, day, hour)
    if (code === "WDD" || code === "WDS") {
      addWind(code, stationId, local.year, local.month, local.day, local.hour, value)
      continue
    }
    const pollutant = VARIABLE_POLLUTANT[code]
    if (!pollutant) continue
    addReading(pollutant, stationId, local.year, local.month, local.day, local.hour, value)
  }
}

function addReading(
  pollutant: Pollutant,
  stationId: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  value: number,
): void {
  monthsWithData.add(year * 12 + month)
  const atHour = hourKey(pollutant, year, month, day, hour)
  let stations = readingsByHour.get(atHour)
  if (!stations) {
    stations = {}
    readingsByHour.set(atHour, stations)
  }
  const previous = stations[stationId]
  stations[stationId] = value

  const seriesKey = dayKey(pollutant, year, month, day, stationId)
  let series = seriesByStation.get(seriesKey)
  if (!series) {
    series = emptyHours()
    seriesByStation.set(seriesKey, series)
  }
  series[hour] = value

  const totalsKey = dayKey(pollutant, year, month, day)
  let totals = totalsByDay.get(totalsKey)
  if (!totals) {
    totals = { sum: Array(24).fill(0), count: Array(24).fill(0) }
    totalsByDay.set(totalsKey, totals)
  }
  if (previous == null) {
    totals.sum[hour] += value
    totals.count[hour] += 1
  } else {
    totals.sum[hour] += value - previous
  }
}

function addWind(
  code: "WDD" | "WDS",
  stationId: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  value: number,
): void {
  const store = code === "WDD" ? directionByHour : speedByHour
  const key = windKey(year, month, day, hour)
  let stations = store.get(key)
  if (!stations) {
    stations = {}
    store.set(key, stations)
  }
  stations[stationId] = value
}

function windKey(year: number, month: number, day: number, hour: number): string {
  return `${year}|${month}|${day}|${hour}`
}

function hourKey(pollutant: Pollutant, year: number, month: number, day: number, hour: number): string {
  return `${pollutant}|${year}|${month}|${day}|${hour}`
}

function dayKey(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  stationId?: string,
): string {
  const key = `${pollutant}|${year}|${month}|${day}`
  return stationId ? `${key}|${stationId}` : key
}

function averageOfAllStations(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
): Array<number | null> {
  const totals = totalsByDay.get(dayKey(pollutant, year, month, day))
  if (!totals) return emptyHours()
  return totals.sum.map((sum, hour) => (totals.count[hour] === 0 ? null : sum / totals.count[hour]))
}

function emptyHours(): Array<number | null> {
  return Array.from({ length: 24 }, () => null)
}
