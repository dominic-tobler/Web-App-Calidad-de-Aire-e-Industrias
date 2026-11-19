import type { CSSProperties } from "react"
import type { AirQualityLevel } from "../domain/airQuality"
import { calendarCells, MONTHS, WEEKDAYS } from "../domain/time"

type CalendarGridProps = {
  year: number
  month: number
  day: number | null
  markedDays?: readonly number[]
  dayLevels?: Readonly<Record<number, AirQualityLevel>>
  onDay: (day: number) => void
  onPreviousMonth?: () => void
  onNextMonth?: () => void
  previousMonthDisabled?: boolean
  nextMonthDisabled?: boolean
}

const DARK_INK_LEVELS = new Set(["moderado", "alto", "muy-alto"])

export function CalendarGrid({
  year,
  month,
  day,
  markedDays = [],
  dayLevels = {},
  onDay,
  onPreviousMonth,
  onNextMonth,
  previousMonthDisabled = false,
  nextMonthDisabled = false,
}: CalendarGridProps) {
  const cells = calendarCells(year, month)
  const showMonthNav = onPreviousMonth != null && onNextMonth != null

  return (
    <div className="calendar">
      {showMonthNav ? (
        <div className="month-nav">
          <button
            type="button"
            onClick={onPreviousMonth}
            disabled={previousMonthDisabled}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <span>
            {MONTHS[month]} {year}
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={nextMonthDisabled}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      ) : null}
      <div className="calendar-body">
        <div className="weekdays">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="weeks">
          {Array.from({ length: cells.length / 7 }, (_, week) => (
            <div className="week" key={week}>
              {cells.slice(week * 7, week * 7 + 7).map((value, index) =>
                value === null ? (
                  <span className="day is-empty" key={`${week}-${index}`} />
                ) : (
                  <button
                    key={value}
                    type="button"
                    className={dayClass(value, day, markedDays, dayLevels[value])}
                    style={dayStyle(dayLevels[value])}
                    onClick={() => onDay(value)}
                    aria-pressed={day !== null && value === day}
                    aria-label={dayLabel(value, dayLevels[value])}
                    title={dayLevels[value] ? `Nivel ${dayLevels[value].label}` : undefined}
                  >
                    {String(value).padStart(2, "0")}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function dayClass(
  value: number,
  selected: number | null,
  markedDays: readonly number[],
  level: AirQualityLevel | undefined,
): string {
  const classes = ["day"]
  if (selected !== null && value === selected) classes.push("is-selected")
  if (level) classes.push("has-level")
  else if (markedDays.includes(value)) classes.push("has-data")
  return classes.join(" ")
}

function dayStyle(level: AirQualityLevel | undefined): CSSProperties | undefined {
  if (!level) return undefined
  return {
    backgroundColor: level.color,
    color: DARK_INK_LEVELS.has(level.id) ? "#1a2420" : "#ffffff",
  }
}

function dayLabel(value: number, level: AirQualityLevel | undefined): string {
  const date = String(value).padStart(2, "0")
  return level ? `${date}, nivel ${level.label}` : date
}
