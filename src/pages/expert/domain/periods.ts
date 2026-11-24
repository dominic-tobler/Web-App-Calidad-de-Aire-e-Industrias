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

// Lunes de la semana (lunes a domingo) que contiene la fecha.
export function weekStart(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return addDays(isoDate, -((weekday + 6) % 7))
}

// Semanas (lunes) que tienen al menos un día dentro del rango [from, to].
export function weeksCovering(from: string, to: string): string[] {
  const [first, last] = from <= to ? [from, to] : [to, from]
  const weeks: string[] = []
  for (let monday = weekStart(first); monday <= last; monday = addDays(monday, 7)) weeks.push(monday)
  return weeks
}
