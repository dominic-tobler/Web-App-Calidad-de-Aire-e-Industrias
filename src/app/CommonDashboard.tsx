import { useMemo } from "react"
import { HourlyTrend } from "../charts/HourlyTrend"
import { industries } from "../data/industries"
import { pollutantLabel } from "../domain/airQuality"
import { formatHour, formatInstant, MONTHS } from "../domain/time"
import { CundinamarcaMap } from "../map/CundinamarcaMap"
import { useCommonState } from "../state/commonState"
import { CalendarGrid } from "../ui/CalendarGrid"
import { EmissionFilters } from "../ui/EmissionFilters"
import "./dashboard.css"

export function CommonDashboard() {
  const { state, setDay, setHour, setPollutant, setSource, shiftMonth } = useCommonState()

  const visibleIndustries = useMemo(
    () =>
      industries.filter((industry) => {
        if (industry.status === "tramite") return false
        return state.source === "todos" || industry.source === state.source
      }),
    [state.source],
  )

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <p className="eyebrow">Usuario común</p>
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          {formatInstant(state.year, state.month, state.day)} · {formatHour(state.hour)} ·{" "}
          {pollutantLabel(state.pollutant)}
        </p>
      </header>

      <div className="lines-layout">
        <aside className="control-panel">
          <EmissionFilters
            source={state.source}
            pollutant={state.pollutant}
            onSource={setSource}
            onPollutant={setPollutant}
          />
          <section className="calendar-block">
            <div className="month-nav">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={state.year === 2024 && state.month === 0}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <span>
                {MONTHS[state.month]} {state.year}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={state.year === 2025 && state.month === 11}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>
            <CalendarGrid
              year={state.year}
              month={state.month}
              day={state.day}
              onDay={setDay}
            />
            <div className="day-scale">
              <p>Nivel del día</p>
              <div className="scale-row">
                <span>Bajo</span>
                <div className="scale-bar" />
                <span>Alto</span>
              </div>
            </div>
          </section>
        </aside>

        <CundinamarcaMap
          industries={visibleIndustries}
          hourLabel={formatHour(state.hour)}
          showHourBadge
        />

        <aside className="station-panel">
          <header>
            <h2>Estación seleccionada</h2>
            <p>Las líneas van a las industrias más cercanas</p>
          </header>
          <div className="station-body">
            <p>
              Al elegir una estación, el mapa traza la línea hasta las industrias más
              cercanas y aquí aparece la distancia.
            </p>
            <p>Todavía no hay mediciones de estaciones.</p>
          </div>
        </aside>

        <HourlyTrend
          year={state.year}
          month={state.month}
          day={state.day}
          hour={state.hour}
          pollutant={state.pollutant}
          onHour={setHour}
        />
      </div>
    </div>
  )
}
