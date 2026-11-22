// Contaminantes presentes en la columna `variable` de datos_24_25.csv.
// `plain`, `short`, `about` y `effect` explican el nombre a quien no trabaja con calidad del aire.
export const POLLUTANTS = [
  {
    id: "pm25",
    label: "PM2.5",
    shortLabel: "PM2.5",
    plain: "Partículas muy finas",
    short: "Partículas tan finas que entran hasta el fondo de los pulmones.",
    about:
      "Son partículas de polvo y humo tan pequeñas que no se ven. Llegan hasta el fondo de los pulmones. Salen de vehículos, industrias, quemas y el polvo de las vías.",
    effect:
      "Si el valor sube, irritan la respiración. Afectan más a niños, adultos mayores y personas con asma.",
  },
  {
    id: "pm10",
    label: "PM10",
    shortLabel: "PM10",
    plain: "Polvo en el aire",
    short: "Polvo en el aire que irrita ojos, nariz y garganta.",
    about:
      "Son partículas de polvo más grandes que el PM2.5. A veces se notan como una calima. Vienen de vías sin pavimentar, obras y algunas industrias.",
    effect: "Un valor alto irrita ojos, nariz y garganta.",
  },
  {
    id: "no2",
    label: "NO₂",
    shortLabel: "NO₂",
    plain: "Dióxido de nitrógeno",
    short: "Gas de motores y chimeneas que irrita los pulmones.",
    about:
      "Es un gas que sale sobre todo del tubo de escape y de las chimeneas. Se concentra donde hay mucho tráfico.",
    effect: "En niveles altos irrita los pulmones y puede empeorar el asma.",
  },
  {
    id: "so2",
    label: "SO₂",
    shortLabel: "SO₂",
    plain: "Dióxido de azufre",
    short: "Gas de combustibles con azufre que irrita la respiración.",
    about:
      "Es un gas de la quema de combustibles con azufre, como carbón o algunos aceites industriales.",
    effect: "Irrita ojos, nariz y garganta, y puede dificultar la respiración.",
  },
  {
    id: "co",
    label: "CO",
    shortLabel: "CO",
    plain: "Monóxido de carbono",
    short: "Gas sin olor que sale de una combustión incompleta.",
    about:
      "Es un gas sin color ni olor. Aparece cuando la combustión queda incompleta, en motores, calderas o fogones.",
    effect:
      "En cantidades altas reduce el oxígeno de la sangre y puede causar dolor de cabeza y cansancio.",
  },
  {
    id: "o3",
    label: "O₃",
    shortLabel: "O₃",
    plain: "Ozono del aire",
    short: "Gas que forma el sol a partir de los gases del tráfico.",
    about:
      "No sale directo de una chimenea. Se forma cuando el sol actúa sobre gases de vehículos e industrias, sobre todo en las horas de más sol.",
    effect: "Irrita los pulmones, en especial si haces ejercicio al aire libre.",
  },
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

const LEVEL_MEANINGS: Record<AirQualityLevel["id"], string> = {
  bajo: "El aire está en un rango favorable para la mayoría de las personas.",
  moderado: "Es aceptable. Quienes son más sensibles pueden notar una molestia leve.",
  alto: "Conviene reducir el esfuerzo al aire libre si tienes asma u otra afección respiratoria.",
  "muy-alto": "Puede afectar a más personas. Mejor acortar el tiempo al aire libre.",
  peligroso: "Evita actividades prolongadas al aire libre.",
}

export function pollutantLabel(id: Pollutant): string {
  return POLLUTANTS.find((item) => item.id === id)?.label ?? id
}

export function pollutantInfo(id: Pollutant) {
  return POLLUTANTS.find((item) => item.id === id) ?? POLLUTANTS[0]
}

export function levelMeaning(id: AirQualityLevel["id"]): string {
  return LEVEL_MEANINGS[id]
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
