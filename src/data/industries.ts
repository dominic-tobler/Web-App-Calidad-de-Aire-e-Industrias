import rawIndustries from "../../Data/industries.json"
import { emissionSourceKey, emissionSourceLabel, normalizeIndustry, type Industry } from "../domain/industry"

export const industries: Industry[] = rawIndustries.map((row) => normalizeIndustry(row))

export const EMISSION_SOURCE_ALL = "todos"

export const EMISSION_SOURCE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = buildEmissionSourceOptions(
  industries,
)

function buildEmissionSourceOptions(list: readonly Industry[]): Array<{ id: string; label: string }> {
  const counts = new Map<string, Map<string, number>>()
  for (const industry of list) {
    if (industry.status === "tramite") continue
    const id = emissionSourceKey(industry.sourceRaw)
    const label = emissionSourceLabel(industry.sourceRaw)
    const variants = counts.get(id) ?? new Map<string, number>()
    variants.set(label, (variants.get(label) ?? 0) + 1)
    counts.set(id, variants)
  }

  const options = [...counts.entries()].map(([id, variants]) => {
    const label = [...variants.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es"),
    )[0][0]
    return { id, label }
  })
  options.sort((left, right) => {
    if (left.id === "sin-dato") return 1
    if (right.id === "sin-dato") return -1
    return left.label.localeCompare(right.label, "es")
  })
  return [{ id: EMISSION_SOURCE_ALL, label: "Todos" }, ...options]
}
