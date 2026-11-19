import { CalendarGrid } from "./CalendarGrid"
import { ChoiceRow } from "./SelectMenu"
import { daysInMonth, formatHour, MONTHS, YEARS, type Year } from "../domain/time"

type TimeControlsProps = {
  year: Year
  month: number
  day: number
  hour: number
  playing: boolean
  onYear: (year: Year) => void
  onMonth: (month: number) => void
  onDay: (day: number) => void
  onHour: (hour: number) => void
  onPlaying: (playing: boolean) => void
}

export function TimeControls({
  year,
  month,
  day,
  hour,
  playing,
  onYear,
  onMonth,
  onDay,
  onHour,
  onPlaying,
}: TimeControlsProps) {
  const dayOptions = Array.from({ length: daysInMonth(year, month) }, (_, index) => ({
    id: String(index + 1),
    label: String(index + 1).padStart(2, "0"),
  }))

  return (
    <div className="time-controls">
      <ChoiceRow label="Año">
        {YEARS.map((option) => (
          <button
            key={option}
            type="button"
            className={option === year ? "choice is-selected" : "choice"}
            onClick={() => onYear(option)}
            aria-pressed={option === year}
          >
            {option}
          </button>
        ))}
      </ChoiceRow>

      <div className="menu-card tone-month">
        <label htmlFor="month-select">Mes</label>
        <select
          id="month-select"
          value={month}
          onChange={(event) => onMonth(Number(event.target.value))}
        >
          {MONTHS.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="menu-card tone-day">
        <label htmlFor="day-select">Día</label>
        <select
          id="day-select"
          value={day}
          onChange={(event) => onDay(Number(event.target.value))}
        >
          {dayOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <CalendarGrid year={year} month={month} day={day} onDay={onDay} />

      <div className="menu-card tone-hour">
        <label htmlFor="hour-select">Hora</label>
        <select
          id="hour-select"
          value={hour}
          onChange={(event) => onHour(Number(event.target.value))}
        >
          {Array.from({ length: 24 }, (_, value) => (
            <option key={value} value={value}>
              {formatHour(value)}
            </option>
          ))}
        </select>
      </div>

      <div className="hour-grid" role="group" aria-label="Horas del día">
        {Array.from({ length: 24 }, (_, value) => (
          <button
            key={value}
            type="button"
            className={value === hour ? "hour is-selected" : "hour"}
            onClick={() => onHour(value)}
            aria-pressed={value === hour}
          >
            {formatHour(value)}
          </button>
        ))}
      </div>

      <div className="play-row">
        <span>Animación de horas</span>
        <button
          type="button"
          className="play-button"
          aria-pressed={playing}
          aria-label={playing ? "Pausar animación de horas" : "Reproducir animación de horas"}
          onClick={() => onPlaying(!playing)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
    </div>
  )
}
