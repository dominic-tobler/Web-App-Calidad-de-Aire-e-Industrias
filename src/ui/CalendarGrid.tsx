import { calendarCells, WEEKDAYS } from "../domain/time"

type CalendarGridProps = {
  year: number
  month: number
  day: number
  onDay: (day: number) => void
}

export function CalendarGrid({ year, month, day, onDay }: CalendarGridProps) {
  const cells = calendarCells(year, month)

  return (
    <div className="calendar">
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
                  className={value === day ? "day is-selected" : "day"}
                  onClick={() => onDay(value)}
                  aria-pressed={value === day}
                >
                  {String(value).padStart(2, "0")}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
