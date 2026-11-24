// Índice de Calidad del Aire (ICA), Tabla No. 2 «Puntos de corte para el cálculo del ICA»
// (DANE, con base en el Protocolo de Monitoreo de Calidad del Aire, MAVDT 2010, pág. 134).
// Lo usan la vista común y la vista experta.
export const ICA_LEVELS = [
  { id: "buena", label: "Buena", short: "Buena", color: "#00e400", band: "#c7f5c7", ica: "0–50" },
  { id: "moderada", label: "Moderada", short: "Moderada", color: "#ffff00", band: "#fffbb0", ica: "51–100" },
  { id: "sensibles", label: "Dañina para grupos sensibles", short: "G. sensibles", color: "#ff7e00", band: "#ffd9b0", ica: "101–150" },
  { id: "danina", label: "Dañina", short: "Dañina", color: "#ff0000", band: "#ffb8b8", ica: "151–200" },
  { id: "muy-danina", label: "Muy dañina", short: "Muy dañina", color: "#8f3f97", band: "#e0c5e4", ica: "201–300" },
  { id: "peligrosa", label: "Peligrosa", short: "Peligrosa", color: "#7e0023", band: "#e3b3c1", ica: "301–500" },
] as const

export type IcaLevel = (typeof ICA_LEVELS)[number]

// Lectura medida que la tabla no clasifica (NO₂ por debajo de «Muy dañina»).
export const ICA_UNCLASSIFIED = "#c9d3ce"

// Las mediciones vienen en µg/m³. Los gases de la tabla están en ppm y se convierten
// a 25 °C y 1 atm: µg/m³ = ppm × masa molar × 1000 / 24,45.
const PPM_TO_UGM3 = {
  o3: (48.0 * 1000) / 24.45,
  co: (28.01 * 1000) / 24.45,
  so2: (64.066 * 1000) / 24.45,
  no2: (46.0055 * 1000) / 24.45,
}

type IcaPollutant = "pm25" | "pm10" | "o3" | "no2" | "so2" | "co"

type IcaCuts = {
  // Límite inferior de cada nivel, en µg/m³; null si la tabla no define ese nivel.
  lowers: ReadonlyArray<number | null>
  // Límite superior del último nivel (500 en el ICA).
  top: number
  // Tiempo de exposición de la tabla; la media móvil de la serie usa esta ventana.
  hours: number
  note?: string
}

const ppm = (pollutant: keyof typeof PPM_TO_UGM3, values: ReadonlyArray<number | null>) =>
  values.map((value) => (value == null ? null : round(value * PPM_TO_UGM3[pollutant])))

export const ICA_CUTS: Record<IcaPollutant, IcaCuts> = {
  pm25: { lowers: [0, 15.5, 40.5, 65.5, 150.5, 250.5], top: 500.4, hours: 24 },
  pm10: { lowers: [0, 55, 155, 255, 355, 425], top: 604, hours: 24 },
  so2: { lowers: ppm("so2", [0, 0.035, 0.145, 0.225, 0.305, 0.605]), top: round(1.004 * PPM_TO_UGM3.so2), hours: 24 },
  co: { lowers: ppm("co", [0, 4.5, 9.5, 12.5, 15.5, 30.5]), top: round(50.4 * PPM_TO_UGM3.co), hours: 8 },
  // O₃ 8 h hasta «Muy dañina»; «Peligrosa» solo existe con valores de 1 h (nota 3 de la tabla).
  o3: {
    lowers: ppm("o3", [0, 0.06, 0.076, 0.096, 0.116, 0.405]),
    top: round(0.604 * PPM_TO_UGM3.o3),
    hours: 8,
    note: "Peligrosa usa el corte de 1 h (nota 3 de la tabla)",
  },
  // NO₂ 1 h solo tiene cortes desde ICA 201 (nota 2 de la tabla).
  no2: {
    lowers: ppm("no2", [null, null, null, null, 0.65, 1.25]),
    top: round(2.04 * PPM_TO_UGM3.no2),
    hours: 1,
    note: "La tabla solo define NO₂ desde «Muy dañina» (nota 2)",
  },
}

export type IcaBand = { level: IcaLevel; low: number; high: number }

export function icaCuts(variable: string): IcaCuts | null {
  return variable in ICA_CUTS ? ICA_CUTS[variable as IcaPollutant] : null
}

// Ventana de la media móvil: el tiempo de exposición del contaminante en la tabla.
export function exposureHours(variable: string): number {
  return icaCuts(variable)?.hours ?? 24
}

export function icaBands(variable: string): IcaBand[] {
  const cuts = icaCuts(variable)
  if (!cuts) return []
  return ICA_LEVELS.flatMap((level, index) => {
    const low = cuts.lowers[index]
    if (low == null) return []
    const next = cuts.lowers.slice(index + 1).find((value) => value != null)
    return [{ level, low, high: next ?? cuts.top }]
  })
}

export function icaLevel(variable: string, value: number): IcaLevel | null {
  const cuts = icaCuts(variable)
  if (!cuts) return null
  let found: IcaLevel | null = null
  cuts.lowers.forEach((low, index) => {
    if (low != null && value >= low) found = ICA_LEVELS[index]
  })
  return found
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
