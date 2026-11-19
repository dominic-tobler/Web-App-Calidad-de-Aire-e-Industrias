import measurementsUrl from "../../Data/datos_24_25.csv?url"
import type { Pollutant } from "../domain/airQuality"

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

const MISSING_AT_OR_ABOVE = 9000

const readingsByHour = new Map<string, Record<string, number>>()
const seriesByStation = new Map<string, Array<number | null>>()
const totalsByDay = new Map<string, { sum: number[]; count: number[] }>()

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
  const totals = totalsByDay.get(dayKey(pollutant, year, month, day))
  if (!totals) return emptyHours()
  return totals.sum.map((sum, hour) => (totals.count[hour] === 0 ? null : sum / totals.count[hour]))
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
    const pollutant = VARIABLE_POLLUTANT[cells[1]]
    const value = Number(cells[2])
    const stationId = cells[5]?.trim()
    const stamp = cells[0]
    if (!pollutant || !stationId || !Number.isFinite(value) || value >= MISSING_AT_OR_ABOVE) continue
    const year = Number(stamp.slice(0, 4))
    const month = Number(stamp.slice(5, 7)) - 1
    const day = Number(stamp.slice(8, 10))
    const hour = Number(stamp.slice(11, 13))
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
    addReading(pollutant, stationId, year, month, day, hour, value)
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

function emptyHours(): Array<number | null> {
  return Array.from({ length: 24 }, () => null)
}
