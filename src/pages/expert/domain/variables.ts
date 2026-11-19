import type { Pollutant } from "../../../domain/airQuality"
import { icaCuts, icaLevel, type IcaLevel } from "./icaLevels"

// Variables de datos_24_25.csv. `code` es el nombre de la columna `variable`.
export const VARIABLES = [
  { id: "pm25", code: "PM2", label: "PM2.5", short: "PM2.5", unit: "µg/m³", pollutant: "pm25" },
  { id: "pm10", code: "PM10", label: "PM10", short: "PM10", unit: "µg/m³", pollutant: "pm10" },
  { id: "o3", code: "O3", label: "O₃", short: "O₃", unit: "µg/m³", pollutant: null },
  { id: "no2", code: "No2", label: "NO₂", short: "NO₂", unit: "µg/m³", pollutant: "no2" },
  { id: "so2", code: "So2", label: "SO₂", short: "SO₂", unit: "µg/m³", pollutant: "so2" },
  { id: "co", code: "Co", label: "CO", short: "CO", unit: "µg/m³", pollutant: null },
  { id: "temp", code: "Temp", label: "Temperatura", short: "Tem", unit: "°C", pollutant: null },
  { id: "wds", code: "WDS", label: "Vel. viento", short: "Vvi", unit: "m/s", pollutant: null },
  { id: "wdd", code: "WDD", label: "Dir. viento", short: "Dvi", unit: "°N", pollutant: null },
  { id: "rain", code: "RAIN", label: "Precipitación", short: "Llu", unit: "mm", pollutant: null },
] as const satisfies ReadonlyArray<{
  id: string
  code: string
  label: string
  short: string
  unit: string
  pollutant: Pollutant | null
}>

export type VariableId = (typeof VARIABLES)[number]["id"]
export type Variable = (typeof VARIABLES)[number]

export const VARIABLE_BY_CODE = new Map<string, Variable>(VARIABLES.map((item) => [item.code, item]))

export function variableById(id: VariableId): Variable {
  return VARIABLES.find((item) => item.id === id) ?? VARIABLES[0]
}

// Nivel ICA según la Tabla No. 2 del DANE (ver icaLevels.ts).
export function variableLevel(id: VariableId, value: number): IcaLevel | null {
  return icaLevel(id, value)
}

// La serie de tiempo solo muestra contaminantes.
export const POLLUTANT_VARIABLES = VARIABLES.filter((item) =>
  ["pm25", "pm10", "o3", "no2", "so2", "co"].includes(item.id),
)

// La matriz no usa la dirección del viento (variable circular).
export const CORRELATION_VARIABLES: VariableId[] = VARIABLES.map((item) => item.id).filter(
  (id) => id !== "wdd",
)

export function hasLevels(id: VariableId): boolean {
  return icaCuts(id) !== null
}
