export const YEARS = [2024, 2025] as const

export type Year = (typeof YEARS)[number]

export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const

export const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"] as const

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function calendarCells(year: number, month: number): Array<number | null> {
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const total = daysInMonth(year, month)
  const cells: Array<number | null> = Array.from({ length: startOffset }, () => null)
  for (let day = 1; day <= total; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

// America/Bogota no usa horario de verano: siempre está 5 horas detrás de UTC.
export const COLOMBIA_OFFSET_HOURS = -5
export const COLOMBIA_TIME_LABEL = "COT"

export function colombiaFromUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): { year: number; month: number; day: number; hour: number } {
  const shifted = new Date(Date.UTC(year, month, day, hour + COLOMBIA_OFFSET_HOURS))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  }
}

const SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const

export function formatInstant(year: number, month: number, day: number): string {
  return `${day} de ${MONTHS[month].toLocaleLowerCase("es")} de ${year}`
}

export function formatCompactInstant(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")} ${SHORT_MONTHS[month]} ${year}`
}
