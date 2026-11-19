import { airQualityLevel, type AirQualityLevel, type Pollutant } from "../../domain/airQuality"

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

// Solo PM2.5, PM10, NO₂ y SO₂ tienen cortes de calidad del aire definidos.
export function variableLevel(id: VariableId, value: number): AirQualityLevel | null {
  const pollutant = variableById(id).pollutant
  return pollutant ? airQualityLevel(pollutant, value) : null
}

export function hasLevels(id: VariableId): boolean {
  return variableById(id).pollutant !== null
}
