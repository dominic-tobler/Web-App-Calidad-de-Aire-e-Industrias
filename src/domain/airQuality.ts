import { ICA_LEVELS, icaCuts, icaLevel, type IcaLevel } from "./icaLevels"

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

// Misma escala que la vista experta: ICA, Tabla No. 2 del DANE (ver icaLevels.ts).
export const AIR_QUALITY_LEVELS = ICA_LEVELS

export type AirQualityLevel = IcaLevel

const LEVEL_MEANINGS: Record<AirQualityLevel["id"], string> = {
  buena: "El aire supone poco o ningún riesgo para la mayoría de las personas.",
  moderada: "Es aceptable. Algunas personas más sensibles pueden notar una molestia leve.",
  sensibles: "Niños, mayores y personas con asma u otra afección pueden verse afectados.",
  danina: "Puede afectar a más personas. Conviene acortar el tiempo al aire libre.",
  "muy-danina": "Alerta: puede afectar a toda la población. Mejor permanecer en interiores.",
  peligrosa: "Emergencia sanitaria. Evita actividades al aire libre.",
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
  return icaLevel(pollutant, value)
}

// Texto para un valor medido que la tabla del ICA no clasifica.
export function unclassifiedNote(pollutant: Pollutant): string | null {
  const cuts = icaCuts(pollutant)
  if (!cuts || cuts.lowers[0] != null) return null
  if (pollutant === "no2") return "El ICA solo clasifica el NO₂ desde Muy dañina."
  return "Este valor no entra en las categorías del ICA."
}

export function formatReading(value: number): string {
  return value.toLocaleString("es-CO", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })
}
