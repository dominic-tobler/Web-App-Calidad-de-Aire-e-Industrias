export const POLLUTANTS = [
  { id: "ica", label: "Índice de calidad", shortLabel: "ICA" },
  { id: "no2", label: "NO₂", shortLabel: "NO₂" },
  { id: "nox", label: "NOx", shortLabel: "NOx" },
  { id: "pm25", label: "PM2.5", shortLabel: "PM2.5" },
  { id: "pm10", label: "PM10", shortLabel: "PM10" },
  { id: "so2", label: "SO₂", shortLabel: "SO₂" },
] as const

export type Pollutant = (typeof POLLUTANTS)[number]["id"]

export const AIR_QUALITY_STOPS = [
  "#1a9850",
  "#a6d96a",
  "#fee08b",
  "#fdae61",
  "#d73027",
] as const

export function pollutantLabel(id: Pollutant): string {
  return POLLUTANTS.find((item) => item.id === id)?.label ?? id
}
