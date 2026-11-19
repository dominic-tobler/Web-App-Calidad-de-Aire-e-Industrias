export const SOURCE_OPTIONS = [
  { id: "todos", label: "Todos" },
  { id: "caldera", label: "Caldera" },
  { id: "horno", label: "Horno" },
  { id: "secador", label: "Secador" },
  { id: "asfalto", label: "Planta de asfalto" },
  { id: "otro", label: "Otro" },
  { id: "sin-dato", label: "Sin dato" },
] as const

export type SourceCategory = (typeof SOURCE_OPTIONS)[number]["id"]

export type IndustryStatus = "sancionada" | "seguimiento" | "tramite"

export type Industry = {
  id: string
  expediente: number
  status: IndustryStatus
  regional: string
  department: string
  municipality: string
  vereda: string
  fuel: string
  sourceRaw: string
  source: SourceCategory
  basin: string
  longitude: number
  latitude: number
  sanctionReason: string | null
}

type RawIndustry = {
  id: string
  IDExpediente: number
  Estado: string
  Regional: string
  Departamento: string
  Municipio: string
  Vereda: string | null
  Class: string | null
  TipoCombustible: string | null
  TipoFuenteEmision: string | null
  Cuenca: string | null
  Longitude: number
  Latitude: number
}

export function sourceCategory(raw: string): SourceCategory {
  const value = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

  if (!value || value.includes("noaplica")) return "sin-dato"
  if (value.includes("asfalt")) return "asfalto"
  if (value.includes("secad")) return "secador"
  if (value.includes("caldera")) return "caldera"
  if (value.includes("horno") || value.includes("coqu")) return "horno"
  return "otro"
}

export function industryStatus(estado: string): IndustryStatus {
  if (estado === "Sancionatorio") return "sancionada"
  if (estado === "Seguimiento y Control") return "seguimiento"
  return "tramite"
}

export function statusLabel(status: IndustryStatus): string {
  if (status === "sancionada") return "Sancionada"
  if (status === "seguimiento") return "Seguimiento"
  return "En trámite"
}

export function normalizeIndustry(raw: RawIndustry): Industry {
  return {
    id: raw.id,
    expediente: raw.IDExpediente,
    status: industryStatus(raw.Estado),
    regional: raw.Regional,
    department: raw.Departamento,
    municipality: raw.Municipio,
    vereda: raw.Vereda ?? "",
    fuel: (raw.TipoCombustible ?? "").trim() || "Sin dato",
    sourceRaw: (raw.TipoFuenteEmision ?? "").trim(),
    source: sourceCategory(raw.TipoFuenteEmision ?? ""),
    basin: raw.Cuenca ?? "",
    longitude: raw.Longitude,
    latitude: raw.Latitude,
    sanctionReason: raw.Class,
  }
}

const BOYACA_PLACE: Record<string, string> = {
  raquira: "Ráquira",
  chiquinquira: "Chiquinquirá",
}

function plainKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

// Clave del filtro de fuente: el texto de TipoFuenteEmision, sin agrupar.
export function emissionSourceKey(raw: string): string {
  const value = raw.trim()
  if (!value) return "sin-dato"
  return plainKey(value)
}

export function emissionSourceLabel(raw: string): string {
  const value = raw.trim()
  if (!value) return "Sin dato"
  const letters = value.replace(/[^\p{L}]/gu, "")
  const lower = letters.toLocaleLowerCase("es")
  const upper = letters.toLocaleUpperCase("es")
  if (letters && letters === upper && letters !== lower) return formatPlace(value)
  if (value === value.toLocaleLowerCase("es")) {
    return value.charAt(0).toLocaleUpperCase("es") + value.slice(1)
  }
  return value
}

export function placeWithDepartment(name: string, department: string | null | undefined): string {
  if (plainKey(department ?? "") !== "boyaca") return formatPlace(name)
  const place = BOYACA_PLACE[plainKey(name)] ?? formatPlace(name)
  return `${place}, Boyacá`
}

export function formatPlace(value: string): string {
  const titled = value
    .toLocaleLowerCase("es")
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, separator: string, letter: string) => {
      return separator + letter.toLocaleUpperCase("es")
    })
  return titled.replace("D.c.", "D.C.")
}
