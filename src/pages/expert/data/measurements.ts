import measurementsUrl from "../../../../Data/datos_24_25.csv?url"

import { VARIABLE_BY_CODE, VARIABLES, type VariableId } from "../domain/variables"

// Cada medición se guarda por índice de hora desde el 1 de enero de 2024 a las 00:00 UTC.
export const BASE_MS = Date.UTC(2024, 0, 1)
export const HOUR_MS = 3_600_000
const MISSING_AT_OR_ABOVE = 9000
const MIN_CORRELATION_PAIRS = 24

export type MeasurementStore = {
  totalHours: number
  firstHour: number
  lastHour: number
  stationIds: string[]
  series: Map<string, Float32Array>
}

// Recorte temporal del usuario experto: días completos y una franja de horas del día.
export type TimeWindow = {
  startHour: number
  endHour: number
  hourFrom: number
  hourTo: number
}

export type SeriesPoint = { hour: number; value: number | null }

export type StationSeries = { stationId: string; points: SeriesPoint[] }

export type CorrelationResult = {
  variables: VariableId[]
  r: Array<Array<number | null>>
  n: number[][]
  hours: number
}

let pending: Promise<MeasurementStore> | null = null

export function loadMeasurements(): Promise<MeasurementStore> {
  pending ??= fetch(measurementsUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo leer datos_24_25.csv (${response.status})`)
      return response.text()
    })
    .then(parseMeasurements)
  return pending
}

export function seriesKey(stationId: string, variable: VariableId): string {
  return `${stationId}|${variable}`
}

export function hourOfDay(hour: number): number {
  return ((hour % 24) + 24) % 24
}

export function hourIncluded(hour: number, window: TimeWindow): boolean {
  const value = hourOfDay(hour)
  if (window.hourFrom <= window.hourTo) return value >= window.hourFrom && value <= window.hourTo
  return value >= window.hourFrom || value <= window.hourTo
}

export function hoursPerDay(window: TimeWindow): number {
  return window.hourFrom <= window.hourTo
    ? window.hourTo - window.hourFrom + 1
    : 24 - window.hourFrom + window.hourTo + 1
}

// Media del periodo por estación; colorea las estaciones del mapa.
export function stationMeans(
  store: MeasurementStore,
  variable: VariableId,
  window: TimeWindow,
): Record<string, number> {
  const means: Record<string, number> = {}
  for (const stationId of store.stationIds) {
    const values = store.series.get(seriesKey(stationId, variable))
    if (!values) continue
    let sum = 0
    let count = 0
    for (let hour = Math.max(0, window.startHour); hour <= Math.min(window.endHour, store.totalHours - 1); hour += 1) {
      const value = values[hour]
      if (Number.isNaN(value) || !hourIncluded(hour, window)) continue
      sum += value
      count += 1
    }
    if (count > 0) means[stationId] = variable === "wdd" ? circularMeanOf(values, window) : sum / count
  }
  return means
}

// Media móvil de 24 horas de reloj por estación. Solo cuentan las horas de la franja
// elegida y se pide al menos la mitad de ellas con dato para publicar el valor.
export function movingAverageSeries(
  store: MeasurementStore,
  stationIds: readonly string[],
  variable: VariableId,
  window: TimeWindow,
  windowHours = 24,
): StationSeries[] {
  const eligible = Math.round((hoursPerDay(window) * windowHours) / 24)
  const minimum = Math.max(1, Math.ceil(eligible / 2))
  const start = Math.max(0, window.startHour)
  const end = Math.min(window.endHour, store.totalHours - 1)

  return stationIds.flatMap((stationId) => {
    const values = store.series.get(seriesKey(stationId, variable))
    if (!values) return []
    const points: SeriesPoint[] = []
    let sum = 0
    let count = 0
    let any = false

    for (let hour = start - windowHours + 1; hour <= end; hour += 1) {
      const entering = valueAt(values, hour, window)
      if (entering != null) {
        sum += entering
        count += 1
      }
      const leaving = hour > start ? valueAt(values, hour - windowHours, window) : null
      if (leaving != null) {
        sum -= leaving
        count -= 1
      }
      if (hour < start) continue
      if (!hourIncluded(hour, window) || count < minimum) {
        points.push({ hour, value: null })
        continue
      }
      points.push({ hour, value: sum / count })
      any = true
    }
    return any ? [{ stationId, points }] : []
  })
}

// Correlación de Pearson entre variables con la serie horaria promedio de las estaciones.
// La dirección del viento se promedia como vector para no mezclar 359° con 1°.
export function correlationMatrix(
  store: MeasurementStore,
  stationIds: readonly string[],
  startHour: number,
  endHour: number,
): CorrelationResult {
  const variables = VARIABLES.map((item) => item.id)
  const start = Math.max(0, startHour)
  const end = Math.min(endHour, store.totalHours - 1)
  const length = Math.max(0, end - start + 1)
  const columns = variables.map((variable) => averageAcrossStations(store, stationIds, variable, start, length))

  const r: Array<Array<number | null>> = []
  const n: number[][] = []
  for (let row = 0; row < variables.length; row += 1) {
    r.push([])
    n.push([])
    for (let column = 0; column < variables.length; column += 1) {
      const [value, pairs] = pearson(columns[row], columns[column])
      r[row].push(pairs >= MIN_CORRELATION_PAIRS ? value : null)
      n[row].push(pairs)
    }
  }
  return { variables, r, n, hours: length }
}

export function hourToDate(hour: number): Date {
  return new Date(BASE_MS + hour * HOUR_MS)
}

export function dayStartHour(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - BASE_MS) / HOUR_MS)
}

export function hourToIsoDate(hour: number): string {
  return hourToDate(hour).toISOString().slice(0, 10)
}

function valueAt(values: Float32Array, hour: number, window: TimeWindow): number | null {
  if (hour < 0 || hour >= values.length || !hourIncluded(hour, window)) return null
  const value = values[hour]
  return Number.isNaN(value) ? null : value
}

function averageAcrossStations(
  store: MeasurementStore,
  stationIds: readonly string[],
  variable: VariableId,
  start: number,
  length: number,
): Float64Array {
  const result = new Float64Array(length).fill(Number.NaN)
  const sources = stationIds.flatMap((id) => store.series.get(seriesKey(id, variable)) ?? [])
  if (sources.length === 0) return result
  const circular = variable === "wdd"

  for (let offset = 0; offset < length; offset += 1) {
    let sum = 0
    let sin = 0
    let cos = 0
    let count = 0
    for (const values of sources) {
      const value = values[start + offset]
      if (Number.isNaN(value)) continue
      if (circular) {
        sin += Math.sin((value * Math.PI) / 180)
        cos += Math.cos((value * Math.PI) / 180)
      } else {
        sum += value
      }
      count += 1
    }
    if (count === 0) continue
    result[offset] = circular ? toDegrees(Math.atan2(sin, cos)) : sum / count
  }
  return result
}

function circularMeanOf(values: Float32Array, window: TimeWindow): number {
  let sin = 0
  let cos = 0
  for (let hour = Math.max(0, window.startHour); hour <= Math.min(window.endHour, values.length - 1); hour += 1) {
    const value = values[hour]
    if (Number.isNaN(value) || !hourIncluded(hour, window)) continue
    sin += Math.sin((value * Math.PI) / 180)
    cos += Math.cos((value * Math.PI) / 180)
  }
  return toDegrees(Math.atan2(sin, cos))
}

function toDegrees(radians: number): number {
  return ((radians * 180) / Math.PI + 360) % 360
}

function pearson(left: Float64Array, right: Float64Array): [number, number] {
  let count = 0
  let sumX = 0
  let sumY = 0
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index]
    const y = right[index]
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    sumX += x
    sumY += y
    count += 1
  }
  if (count < 3) return [Number.NaN, count]
  const meanX = sumX / count
  const meanY = sumY / count
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index]
    const y = right[index]
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    covariance += (x - meanX) * (y - meanY)
    varianceX += (x - meanX) ** 2
    varianceY += (y - meanY) ** 2
  }
  if (varianceX === 0 || varianceY === 0) return [Number.NaN, count]
  return [covariance / Math.sqrt(varianceX * varianceY), count]
}

function parseMeasurements(csv: string): MeasurementStore {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/)
  const rows: Array<[string, VariableId, number, number]> = []
  let lastHour = 0
  let firstHour = Number.POSITIVE_INFINITY

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    const cells = line.split(",")
    const variable = VARIABLE_BY_CODE.get(cells[1])
    const value = Number(cells[2])
    const stationId = cells[5]?.trim()
    const stamp = cells[0]
    if (!variable || !stationId || !Number.isFinite(value) || value >= MISSING_AT_OR_ABOVE) continue
    const ms = Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(5, 7)) - 1,
      Number(stamp.slice(8, 10)),
      Number(stamp.slice(11, 13)),
    )
    const hour = Math.round((ms - BASE_MS) / HOUR_MS)
    if (!Number.isFinite(hour) || hour < 0) continue
    rows.push([stationId, variable.id, hour, value])
    if (hour > lastHour) lastHour = hour
    if (hour < firstHour) firstHour = hour
  }

  const totalHours = lastHour + 1
  const series = new Map<string, Float32Array>()
  const stations = new Set<string>()
  for (const [stationId, variable, hour, value] of rows) {
    const key = seriesKey(stationId, variable)
    let values = series.get(key)
    if (!values) {
      values = new Float32Array(totalHours).fill(Number.NaN)
      series.set(key, values)
    }
    values[hour] = value
    stations.add(stationId)
  }

  return {
    totalHours,
    firstHour: Number.isFinite(firstHour) ? firstHour : 0,
    lastHour,
    stationIds: [...stations].sort((left, right) => Number(left) - Number(right)),
    series,
  }
}
