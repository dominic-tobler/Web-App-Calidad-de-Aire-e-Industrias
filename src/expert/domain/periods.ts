// Periodos con mediciones en datos_24_25.csv. Fuera de ellos no se puede elegir fecha.
export const PERIODS = [
  { id: "2024", label: "Ene – May 2024", first: "2024-01-01", last: "2024-05-31" },
  { id: "2025", label: "Ene – May 2025", first: "2025-01-01", last: "2025-05-31" },
] as const

export type Period = (typeof PERIODS)[number]
export type PeriodId = Period["id"]

export function periodById(id: PeriodId): Period {
  return PERIODS.find((period) => period.id === id) ?? PERIODS[0]
}

// Lleva una fecha ISO (aaaa-mm-dd) al interior del periodo.
export function clampToPeriod(isoDate: string, period: Period): string {
  if (isoDate < period.first) return period.first
  if (isoDate > period.last) return period.last
  return isoDate
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
