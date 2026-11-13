import observationsCsv from "../../Data/observations-sample.csv?raw"
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
  Nox: "nox",
  So2: "so2",
}

const MISSING_AT_OR_ABOVE = 9000

export const observations: Observation[] = parseObservations(observationsCsv)

export function readingAt(
  pollutant: Pollutant,
  stationId: string,
  year: number,
  month: number,
  day: number,
  hour: number,
): number | null {
  const match = observations.find(
    (reading) =>
      reading.pollutant === pollutant &&
      reading.stationId === stationId &&
      reading.year === year &&
      reading.month === month &&
      reading.day === day &&
      reading.hour === hour,
  )
  return match?.value ?? null
}

export function readingsAtHour(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  hour: number,
): Record<string, number> {
  const readings: Record<string, number> = {}
  for (const reading of observations) {
    if (
      reading.pollutant === pollutant &&
      reading.year === year &&
      reading.month === month &&
      reading.day === day &&
      reading.hour === hour
    ) {
      readings[reading.stationId] = reading.value
    }
  }
  return readings
}

export function hourlySeries(
  pollutant: Pollutant,
  year: number,
  month: number,
  day: number,
  stationId: string | null,
): Array<number | null> {
  const buckets: number[][] = Array.from({ length: 24 }, () => [])
  for (const reading of observations) {
    if (
      reading.pollutant !== pollutant ||
      reading.year !== year ||
      reading.month !== month ||
      reading.day !== day
    ) {
      continue
    }
    if (stationId && reading.stationId !== stationId) continue
    buckets[reading.hour].push(reading.value)
  }
  return buckets.map((values) =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
  )
}

export function daysWithReadings(pollutant: Pollutant, year: number, month: number): number[] {
  const days = new Set<number>()
  for (const reading of observations) {
    if (reading.pollutant === pollutant && reading.year === year && reading.month === month) {
      days.add(reading.day)
    }
  }
  return [...days].sort((left, right) => left - right)
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

function parseObservations(csv: string): Observation[] {
  const [, ...rows] = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/)
  return rows.filter(Boolean).flatMap((row) => {
    const [dateTime, variable, rawValue, , , stationId] = row.split(",")
    const pollutant = VARIABLE_POLLUTANT[variable]
    const value = Number(rawValue)
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):/.exec(dateTime ?? "")
    if (!pollutant || !match || !stationId || !Number.isFinite(value) || value >= MISSING_AT_OR_ABOVE) {
      return []
    }
    return [
      {
        pollutant,
        stationId: stationId.trim(),
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3]),
        hour: Number(match[4]),
        value,
      },
    ]
  })
}
