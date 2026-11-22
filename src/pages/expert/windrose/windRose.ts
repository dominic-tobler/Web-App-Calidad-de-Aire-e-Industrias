import { BASE_MS, HOUR_MS, hourOfDay, seriesKey, type MeasurementStore } from "../data/measurements"
import { ICA_LEVELS, icaLevel } from "../domain/icaLevels"
import { PERIODS } from "../domain/periods"
import type { VariableId } from "../domain/variables"

// Rosa de contaminación: de dónde viene el viento (WDD, convención meteorológica)
// y con qué nivel ICA llega el contaminante en esa hora.
export const SECTOR_COUNT = 16
export const SECTOR_DEG = 360 / SECTOR_COUNT
export const DIRECTION_LABELS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
] as const
// Por debajo de esta velocidad la dirección no es confiable: se cuenta como calma.
export const CALM_MS = 0.5
// Con menos horas que esto se muestra un aviso en la rosa.
export const MIN_ROSE_HOURS = 48
// Los datos vienen en UTC; Bogotá está en UTC-5.
const LOCAL_OFFSET_HOURS = -5
// Día: 06:00 a 17:59 hora local. Noche: 18:00 a 05:59.
const DAY_START = 6
const NIGHT_START = 18

export type DayPart = "dia" | "noche"
export const DAY_PARTS: ReadonlyArray<{ id: DayPart; label: string; hours: string }> = [
  { id: "dia", label: "Día", hours: "06:00 – 17:59" },
  { id: "noche", label: "Noche", hours: "18:00 – 05:59" },
]

export type RosePollutant = "pm25" | "pm10"
export const ROSE_POLLUTANTS: ReadonlyArray<{ id: RosePollutant; label: string }> = [
  { id: "pm25", label: "PM2.5" },
  { id: "pm10", label: "PM10" },
]

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MONTH_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export type MonthOption = { id: string; year: number; month: number; short: string; long: string }

// Meses disponibles: los de los periodos con datos (ene–may de 2024 y 2025).
export const MONTH_OPTIONS: MonthOption[] = PERIODS.flatMap((period) => {
  const year = Number(period.first.slice(0, 4))
  const first = Number(period.first.slice(5, 7)) - 1
  const last = Number(period.last.slice(5, 7)) - 1
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const month = first + index
    return {
      id: `${year}-${String(month + 1).padStart(2, "0")}`,
      year,
      month,
      short: MONTH_NAMES[month],
      long: `${MONTH_LONG[month]} de ${year}`,
    }
  })
})

export function monthById(id: string): MonthOption {
  return MONTH_OPTIONS.find((option) => option.id === id) ?? MONTH_OPTIONS[0]
}

// Horas (índice desde 2024-01-01 00:00 UTC) que cubre el mes completo en hora local.
export function monthHourRange(option: MonthOption): [number, number] {
  const start = Date.UTC(option.year, option.month, 1, -LOCAL_OFFSET_HOURS)
  const end = Date.UTC(option.year, option.month + 1, 1, -LOCAL_OFFSET_HOURS)
  return [Math.round((start - BASE_MS) / HOUR_MS), Math.round((end - BASE_MS) / HOUR_MS) - 1]
}

export function localHour(hour: number): number {
  return (hourOfDay(hour) + LOCAL_OFFSET_HOURS + 24) % 24
}

export function dayPartOf(hour: number): DayPart {
  const local = localHour(hour)
  return local >= DAY_START && local < NIGHT_START ? "dia" : "noche"
}

export function sectorOf(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return Math.floor(((normalized + SECTOR_DEG / 2) % 360) / SECTOR_DEG)
}

// Estaciones con al menos una medición de dirección del viento.
export function windStationIds(store: MeasurementStore): Set<string> {
  const ids = new Set<string>()
  for (const id of store.stationIds) {
    const values = store.series.get(seriesKey(id, "wdd"))
    if (values && values.some((value) => !Number.isNaN(value))) ids.add(id)
  }
  return ids
}

export type RoseData = {
  // counts[sector][nivel ICA] = horas
  counts: number[][]
  calm: number
  total: number
}

export function hasSeries(store: MeasurementStore, stationId: string, variable: VariableId): boolean {
  return store.series.has(seriesKey(stationId, variable))
}

// Horas válidas del mes con viento y contaminante en la misma hora.
export function computeRose(
  store: MeasurementStore,
  stationId: string,
  variable: RosePollutant,
  month: MonthOption,
  part: DayPart,
): RoseData {
  const counts = Array.from({ length: SECTOR_COUNT }, () => Array<number>(ICA_LEVELS.length).fill(0))
  const result: RoseData = { counts, calm: 0, total: 0 }
  forEachPairedHour(store, stationId, variable, month, (hour, direction, speed, value) => {
    if (dayPartOf(hour) !== part) return
    result.total += 1
    if (speed != null && speed < CALM_MS) {
      result.calm += 1
      return
    }
    const level = icaLevel(variable, value)
    const levelIndex = level ? ICA_LEVELS.findIndex((item) => item.id === level.id) : 0
    counts[sectorOf(direction)][levelIndex] += 1
  })
  return result
}

export type FanSector = { sector: number; share: number; mean: number; hours: number }

// Abanico: los 3 sectores que aportan más carga del contaminante en el mes
// (suma de concentraciones = frecuencia × concentración media), día y noche juntos.
export function computeFan(
  store: MeasurementStore,
  stationId: string,
  variable: RosePollutant,
  month: MonthOption,
  size = 3,
): FanSector[] {
  const load = Array<number>(SECTOR_COUNT).fill(0)
  const hours = Array<number>(SECTOR_COUNT).fill(0)
  let total = 0
  forEachPairedHour(store, stationId, variable, month, (_hour, direction, speed, value) => {
    if (speed != null && speed < CALM_MS) return
    const sector = sectorOf(direction)
    load[sector] += value
    hours[sector] += 1
    total += value
  })
  if (total <= 0) return []
  return load
    .map((value, sector) => ({ sector, share: value / total, mean: hours[sector] ? value / hours[sector] : 0, hours: hours[sector] }))
    .filter((item) => item.hours > 0)
    .sort((left, right) => right.share - left.share)
    .slice(0, size)
}

// Media mensual del contaminante en la estación; colorea el punto en el mapa.
export function monthlyMean(
  store: MeasurementStore,
  stationId: string,
  variable: RosePollutant,
  month: MonthOption,
): number | null {
  const values = store.series.get(seriesKey(stationId, variable))
  if (!values) return null
  const [start, end] = monthHourRange(month)
  let sum = 0
  let count = 0
  for (let hour = Math.max(0, start); hour <= Math.min(end, values.length - 1); hour += 1) {
    const value = values[hour]
    if (Number.isNaN(value)) continue
    sum += value
    count += 1
  }
  return count ? sum / count : null
}

export function windHoursInMonth(store: MeasurementStore, stationId: string, month: MonthOption): number {
  const values = store.series.get(seriesKey(stationId, "wdd"))
  if (!values) return 0
  const [start, end] = monthHourRange(month)
  let count = 0
  for (let hour = Math.max(0, start); hour <= Math.min(end, values.length - 1); hour += 1) {
    if (!Number.isNaN(values[hour])) count += 1
  }
  return count
}

function forEachPairedHour(
  store: MeasurementStore,
  stationId: string,
  variable: RosePollutant,
  month: MonthOption,
  visit: (hour: number, direction: number, speed: number | null, value: number) => void,
) {
  const directions = store.series.get(seriesKey(stationId, "wdd"))
  const pollutant = store.series.get(seriesKey(stationId, variable))
  if (!directions || !pollutant) return
  const speeds = store.series.get(seriesKey(stationId, "wds"))
  const [start, end] = monthHourRange(month)
  for (let hour = Math.max(0, start); hour <= Math.min(end, directions.length - 1); hour += 1) {
    const direction = directions[hour]
    const value = pollutant[hour]
    if (Number.isNaN(direction) || Number.isNaN(value)) continue
    const speed = speeds ? speeds[hour] : Number.NaN
    visit(hour, direction, Number.isNaN(speed) ? null : speed, value)
  }
}

// Punto a cierta distancia y rumbo (grados desde el norte) sobre la esfera.
export function destination(latitude: number, longitude: number, bearing: number, km: number): [number, number] {
  const radius = 6371
  const delta = km / radius
  const theta = (bearing * Math.PI) / 180
  const phi1 = (latitude * Math.PI) / 180
  const lambda1 = (longitude * Math.PI) / 180
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta))
  const lambda2 =
    lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2))
  return [(phi2 * 180) / Math.PI, (lambda2 * 180) / Math.PI]
}

// Rumbo desde la estación hacia otro punto, en grados desde el norte.
export function bearingTo(latitude: number, longitude: number, toLatitude: number, toLongitude: number): number {
  const phi1 = (latitude * Math.PI) / 180
  const phi2 = (toLatitude * Math.PI) / 180
  const deltaLambda = ((toLongitude - longitude) * Math.PI) / 180
  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

// Pétalo más largo entre varias rosas: así las cuatro comparten la escala radial.
export function maxSectorShare(roses: Array<RoseData | null>): number {
  let max = 0
  for (const rose of roses) {
    if (!rose || rose.total === 0) continue
    for (const levels of rose.counts) {
      const hours = levels.reduce((sum, count) => sum + count, 0)
      max = Math.max(max, hours / rose.total)
    }
  }
  return max
}
