// Contaminantes presentes en la columna `variable` de datos_24_25.csv.
export const POLLUTANTS = [
  { id: "pm25", label: "PM2.5", shortLabel: "PM2.5" },
  { id: "pm10", label: "PM10", shortLabel: "PM10" },
  { id: "no2", label: "NO₂", shortLabel: "NO₂" },
  { id: "so2", label: "SO₂", shortLabel: "SO₂" },
  { id: "co", label: "CO", shortLabel: "CO" },
  { id: "o3", label: "O₃", shortLabel: "O₃" },
] as const

export type Pollutant = (typeof POLLUTANTS)[number]["id"]

export const AIR_QUALITY_STOPS = [
  "#1a9850",
  "#a6d96a",
  "#fee08b",
  "#fdae61",
  "#d73027",
] as const

export const AIR_QUALITY_LEVELS = [
  { id: "bajo", label: "Bajo", color: AIR_QUALITY_STOPS[0] },
  { id: "moderado", label: "Moderado", color: AIR_QUALITY_STOPS[1] },
  { id: "alto", label: "Alto", color: AIR_QUALITY_STOPS[2] },
  { id: "muy-alto", label: "Muy alto", color: AIR_QUALITY_STOPS[3] },
  { id: "peligroso", label: "Peligroso", color: AIR_QUALITY_STOPS[4] },
] as const

export type AirQualityLevel = (typeof AIR_QUALITY_LEVELS)[number]

// Cortes de referencia en µg/m³ para las cinco bandas del diseño.
// CO y O₃ separan la cola de la muestra sin tratar el valor típico como peligroso:
// el grueso de CO queda por debajo de 1 000 y el de O₃ por debajo de 50.
export const THRESHOLDS: Record<Pollutant, readonly number[]> = {
  pm25: [12, 35, 55, 150],
  pm10: [54, 154, 254, 354],
  no2: [40, 100, 200, 400],
  so2: [20, 50, 100, 200],
  co: [1000, 2000, 5000, 10000],
  o3: [50, 100, 180, 240],
}

export function pollutantLabel(id: Pollutant): string {
  return POLLUTANTS.find((item) => item.id === id)?.label ?? id
}

export function airQualityLevel(pollutant: Pollutant, value: number): AirQualityLevel | null {
  const cuts = THRESHOLDS[pollutant]
  const index = cuts.findIndex((cut) => value < cut)
  return AIR_QUALITY_LEVELS[index === -1 ? AIR_QUALITY_LEVELS.length - 1 : index]
}

export function formatReading(value: number): string {
  return value.toLocaleString("es-CO", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })
}
