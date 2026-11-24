import measurementsUrl from "../../../../Data/datos_24_25.csv?url"
import { COLOMBIA_OFFSET_HOURS } from "../../../domain/time"
import { VARIABLE_BY_CODE, type VariableId } from "../domain/variables"

// Cada medición se guarda por índice de hora desde el 1 de enero de 2024 a las 00:00 UTC.
// Las fechas y horas que ve el usuario son de Colombia (UTC−5).
export const BASE_MS = Date.UTC(2024, 0, 1)
export const HOUR_MS = 3_600_000
// Los valores inválidos (9999, saturación 985, fuera de rango) ya se quitan en
// Preprocessing/Limpiar_datos.ipynb: aquí cada fila del CSV es una medición válida.
// Mínimo de horas en común para publicar una celda de la matriz. Es menor que un día porque
// cada matriz usa una sola semana y las horas con lluvia suelen ser pocas.
const MIN_CORRELATION_PAIRS = 12

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

export type RainCorrelation = {
  dry: CorrelationResult
  wet: CorrelationResult
  rainStations: number
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
  return ((hour + COLOMBIA_OFFSET_HOURS) % 24 + 24) % 24
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

// Valor registrado por cada estación en una hora; colorea todas las estaciones del mapa.
export function stationValuesAt(
  store: MeasurementStore,
  variable: VariableId,
  hour: number,
): Record<string, number> {
  const readings: Record<string, number> = {}
  if (hour < 0 || hour >= store.totalHours) return readings
  for (const stationId of store.stationIds) {
    const value = store.series.get(seriesKey(stationId, variable))?.[hour]
    if (value != null && !Number.isNaN(value)) readings[stationId] = value
  }
  return readings
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

// Correlación de Pearson entre variables con la serie horaria promedio de las estaciones,
// separando las horas sin lluvia de las horas con lluvia. Una hora es «con lluvia» si el
// promedio de RAIN de las estaciones del recuadro con dato es > 0. Las horas sin dato de
// RAIN (estaciones que no la miden o fallas del equipo) cuentan como sin lluvia, para no
// perder las demás variables de esas horas.
export function correlationByRain(
  store: MeasurementStore,
  stationIds: readonly string[],
  startHour: number,
  endHour: number,
  variables: VariableId[],
): RainCorrelation {
  const start = Math.max(0, startHour)
  const end = Math.min(endHour, store.totalHours - 1)
  const length = Math.max(0, end - start + 1)
  const columns = variables.map((variable) => averageAcrossStations(store, stationIds, variable, start, length))
  const rain = averageAcrossStations(store, stationIds, "rain", start, length)
  const rainStations = stationIds.filter((id) => store.series.has(seriesKey(id, "rain"))).length

  return {
    dry: matrixForHours(variables, columns, (offset) => !(rain[offset] > 0)),
    wet: matrixForHours(variables, columns, (offset) => rain[offset] > 0),
    rainStations,
  }
}

function matrixForHours(
  variables: VariableId[],
  columns: Float64Array[],
  keep: (offset: number) => boolean,
): CorrelationResult {
  const length = columns[0]?.length ?? 0
  const mask = Array.from({ length }, (_, offset) => keep(offset))
  const masked = columns.map((column) => column.map((value, offset) => (mask[offset] ? value : Number.NaN)))

  const r: Array<Array<number | null>> = []
  const n: number[][] = []
  for (let row = 0; row < variables.length; row += 1) {
    r.push([])
    n.push([])
    for (let column = 0; column < variables.length; column += 1) {
      const [value, pairs] = pearson(masked[row], masked[column])
      r[row].push(pairs >= MIN_CORRELATION_PAIRS && Number.isFinite(value) ? value : null)
      n[row].push(pairs)
    }
  }
  return { variables, r, n, hours: mask.filter(Boolean).length }
}

// Primera hora con algún dato entre dos horas; sirve para abrir cada periodo donde hay mediciones.
export function firstHourWithData(store: MeasurementStore, fromHour: number, toHour: number): number | null {
  let first: number | null = null
  for (const values of store.series.values()) {
    const limit = Math.min(first ?? toHour, toHour, values.length - 1)
    for (let hour = Math.max(0, fromHour); hour <= limit; hour += 1) {
      if (!Number.isNaN(values[hour])) {
        first = hour
        break
      }
    }
  }
  return first
}

// La fecha resultante usa sus componentes UTC como reloj de Colombia, para formatear con utcFormat.
export function hourToDate(hour: number): Date {
  return new Date(BASE_MS + (hour + COLOMBIA_OFFSET_HOURS) * HOUR_MS)
}

// Medianoche en Colombia de ese día civil: 05:00 UTC.
export function dayStartHour(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number)
  return Math.round((Date.UTC(year, month - 1, day, -COLOMBIA_OFFSET_HOURS) - BASE_MS) / HOUR_MS)
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
    if (!variable || !stationId || !Number.isFinite(value)) continue
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
