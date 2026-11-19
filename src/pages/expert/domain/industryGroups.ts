import rawIndustries from "../../../../Data/industries.json"
import { SOURCE_OPTIONS, type Industry, type IndustryStatus } from "../../../domain/industry"

// «Todas» muestra a la vez las tres categorías en el mapa.
export type StatusFilter = IndustryStatus | "todas"

export const STATUS_OPTIONS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "seguimiento", label: "En seguimiento" },
  { id: "tramite", label: "En trámite" },
  { id: "sancionada", label: "Sancionadas" },
]

export type CategoryCount = { label: string; count: number; title?: string }

type RawSanction = { id: string; Class: string | null; ClassCode?: string | null }

// Código corto de la razón de sanción (columna ClassCode del preprocesamiento).
const SANCTION_CODE_BY_ID = new Map<string, string>()
const SANCTION_TEXT_BY_CODE = new Map<string, string>()
for (const row of rawIndustries as RawSanction[]) {
  if (!row.ClassCode || !row.Class) continue
  SANCTION_CODE_BY_ID.set(row.id, row.ClassCode)
  SANCTION_TEXT_BY_CODE.set(row.ClassCode, row.Class)
}

export const SANCTION_REASONS: ReadonlyArray<{ code: string; text: string }> = [
  ...SANCTION_TEXT_BY_CODE,
]
  .map(([code, text]) => ({ code, text }))
  .sort((left, right) => left.code.localeCompare(right.code))

export function sanctionCode(industry: Industry): string {
  return SANCTION_CODE_BY_ID.get(industry.id) ?? "Sin dato"
}

export function sourceLabel(industry: Industry): string {
  return SOURCE_OPTIONS.find((option) => option.id === industry.source)?.label ?? "Otro"
}

export function fuelLabel(industry: Industry): string {
  const value = industry.fuel.trim()
  if (!value || /^noaplica$/i.test(value)) return "Sin dato"
  return value
}

// Conteo por categoría. Lo que pase del límite se agrupa en «Resto».
export function countBy(
  industries: readonly Industry[],
  key: (industry: Industry) => string,
  limit = 5,
  order?: readonly string[],
): CategoryCount[] {
  const counts = new Map<string, number>()
  for (const industry of industries) {
    const label = key(industry)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  if (order) {
    const fixed = order.map((label) => ({ label, count: counts.get(label) ?? 0 }))
    const extra = [...counts].filter(([label]) => !order.includes(label))
    return [...fixed, ...extra.map(([label, count]) => ({ label, count }))]
  }
  const sorted = [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  if (sorted.length <= limit) return sorted
  const head = sorted.slice(0, limit - 1)
  const rest = sorted.slice(limit - 1)
  return [
    ...head,
    {
      label: "Resto",
      count: rest.reduce((sum, item) => sum + item.count, 0),
      title: rest.map((item) => `${item.label} (${item.count})`).join(", "),
    },
  ]
}
