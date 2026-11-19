import { useEffect, useMemo, useState } from "react"
import { HourlyTrend } from "../../charts/HourlyTrend"
import { EMISSION_SOURCE_ALL, industries } from "../../data/industries"
import {
  averageReading,
  dailyAverageReadings,
  daysWithReadings,
  hourlySeries,
  loadObservations,
  readingAt,
  readingsAtHour,
} from "../../data/observations"
import { nearestIndustries, stations } from "../../data/stations"
import {
  airQualityLevel,
  formatReading,
  pollutantLabel,
  type AirQualityLevel,
  type Pollutant,
} from "../../domain/airQuality"
import { formatDistance } from "../../domain/geo"
import { emissionSourceKey, emissionSourceLabel, placeWithDepartment, statusLabel } from "../../domain/industry"
import { stationPlace, stationStatusLabel, stationTitle } from "../../domain/station"
import { formatHour, formatInstant, type Year } from "../../domain/time"
import { CundinamarcaMap } from "../../layouts/map/CundinamarcaMap"
import { useCommonState } from "../../state/commonState"
import { CalendarGrid } from "../../layouts/CalendarGrid"
import { EmissionFilters } from "../../layouts/EmissionFilters"
import "./dashboard.css"

export function CommonDashboard() {
  const { state, setDate, setHour, setPollutant, setSelectedStation, setSource } = useCommonState()
  const [calendar, setCalendar] = useState(() => ({ year: state.year, month: state.month }))
  const [observationsState, setObservationsState] = useState<"loading" | "ready" | "error">("loading")
  const [observationsError, setObservationsError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadObservations()
      .then(() => {
        if (alive) setObservationsState("ready")
      })
      .catch((error: unknown) => {
        if (!alive) return
        setObservationsError(error instanceof Error ? error.message : String(error))
        setObservationsState("error")
      })
    return () => {
      alive = false
    }
  }, [])

  function shiftCalendar(delta: number) {
    setCalendar((current) => {
      const cursor = current.year * 12 + current.month + delta
      if (cursor < 2024 * 12 || cursor > 2025 * 12 + 11) return current
      return { year: Math.floor(cursor / 12) as Year, month: cursor % 12 }
    })
  }

  const visibleIndustries = useMemo(
    () =>
      industries.filter((industry) => {
        if (industry.status === "tramite") return false
        return state.source === EMISSION_SOURCE_ALL || emissionSourceKey(industry.sourceRaw) === state.source
      }),
    [state.source],
  )

  const selectedStation = stations.find((station) => station.id === state.selectedStationId) ?? null
  const nearest = useMemo(
    () => (selectedStation ? nearestIndustries(selectedStation, visibleIndustries) : []),
    [selectedStation, visibleIndustries],
  )
  const hourReadings = useMemo(
    () => readingsAtHour(state.pollutant, state.year, state.month, state.day, state.hour),
    [observationsState, state.pollutant, state.year, state.month, state.day, state.hour],
  )
  const series = useMemo(
    () =>
      hourlySeries(
        state.pollutant,
        state.year,
        state.month,
        state.day,
        state.selectedStationId,
      ),
    [observationsState, state.pollutant, state.year, state.month, state.day, state.selectedStationId],
  )
  const daySeries = useMemo(
    () => hourlySeries(state.pollutant, state.year, state.month, state.day, null),
    [observationsState, state.pollutant, state.year, state.month, state.day],
  )
  const markedDays = useMemo(
    () => daysWithReadings(state.pollutant, calendar.year, calendar.month),
    [observationsState, state.pollutant, calendar.year, calendar.month],
  )
  const dayLevels = useMemo(
    () => monthDayLevels(state.pollutant, calendar.year, calendar.month),
    [observationsState, state.pollutant, calendar.year, calendar.month],
  )
  const selectedDay =
    calendar.year === state.year && calendar.month === state.month ? state.day : null
  const dayAverage = averageReading(daySeries)
  const dayLevel = dayAverage == null ? null : airQualityLevel(state.pollutant, dayAverage)
  const selectedReading = selectedStation
    ? readingAt(
        state.pollutant,
        selectedStation.id,
        state.year,
        state.month,
        state.day,
        state.hour,
      )
    : null
  const selectedLevel =
    selectedReading == null ? null : airQualityLevel(state.pollutant, selectedReading)
  const measuredStations = Object.keys(hourReadings).length

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          {observationsState === "loading"
            ? "Cargando mediciones…"
            : observationsState === "error"
              ? observationsError
              : `${formatInstant(state.year, state.month, state.day)} · ${formatHour(state.hour)} UTC · ${pollutantLabel(state.pollutant)}`}
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
            <CalendarGrid
              year={calendar.year}
              month={calendar.month}
              day={selectedDay}
              markedDays={markedDays}
              dayLevels={dayLevels}
              onDay={(day) => setDate(calendar.year, calendar.month, day)}
              onPreviousMonth={() => shiftCalendar(-1)}
              onNextMonth={() => shiftCalendar(1)}
              previousMonthDisabled={calendar.year === 2024 && calendar.month === 0}
              nextMonthDisabled={calendar.year === 2025 && calendar.month === 11}
            />
            <div className="day-scale">
              <p>{dayLevel ? `Nivel del día · ${dayLevel.label}` : "Sin mediciones este día"}</p>
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
          stations={stations}
          selectedStationId={state.selectedStationId}
          links={nearest}
          hourLabel={`${formatHour(state.hour)} UTC`}
          pollutant={state.pollutant}
          readings={hourReadings}
          showHourBadge
          onSelectStation={setSelectedStation}
        />

        <aside className="station-panel">
          <header>
            <h2>{selectedStation ? stationTitle(selectedStation) : "Estación seleccionada"}</h2>
            <p>
              {selectedStation
                ? `${stationPlace(selectedStation)} · ${stationStatusLabel(selectedStation)}`
                : "Las líneas van a las industrias más cercanas"}
            </p>
          </header>
          <div className="station-body">
            {selectedStation ? (
              <>
                <p className="station-reading">
                  {selectedReading == null
                    ? `Sin medición de ${pollutantLabel(state.pollutant)} a las ${formatHour(state.hour)} UTC`
                    : `${pollutantLabel(state.pollutant)} ${formatReading(selectedReading)}${selectedLevel ? ` · ${selectedLevel.label}` : ""}`}
                </p>
                <p className="station-coords">
                  Latitud {formatCoordinate(selectedStation.latitude)} · Longitud{" "}
                  {formatCoordinate(selectedStation.longitude)}
                </p>
                <h3 className="nearest-title">Industrias más cercanas</h3>
                {nearest.length === 0 ? (
                  <p>Ninguna industria visible con el filtro actual.</p>
                ) : (
                  <ol className="nearest-list">
                    {nearest.map(({ industry, distanceKm }) => (
                      <li key={industry.id}>
                        <span>
                          <strong>{placeWithDepartment(industry.municipality, industry.department)}</strong>
                          <span className="nearest-meta">
                            {emissionSourceLabel(industry.sourceRaw)} · {statusLabel(industry.status)}
                          </span>
                        </span>
                        <span className="nearest-distance">{formatDistance(distanceKm)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <>
                <p>{coverageMessage(state.pollutant, measuredStations, state.hour)}</p>
                <p>Elige una estación para ver el valor y la distancia a las tres industrias más cercanas.</p>
              </>
            )}
          </div>
        </aside>

        <HourlyTrend
          year={state.year}
          month={state.month}
          day={state.day}
          hour={state.hour}
          pollutant={state.pollutant}
          series={series}
          seriesLabel={selectedStation ? stationTitle(selectedStation) : "Promedio de estaciones"}
          onHour={setHour}
        />
      </div>
    </div>
  )
}

function monthDayLevels(
  pollutant: Pollutant,
  year: number,
  month: number,
): Record<number, AirQualityLevel> {
  const levels: Record<number, AirQualityLevel> = {}
  for (const [day, value] of Object.entries(dailyAverageReadings(pollutant, year, month))) {
    const level = airQualityLevel(pollutant, value)
    if (level) levels[Number(day)] = level
  }
  return levels
}

function coverageMessage(pollutant: Pollutant, measured: number, hour: number): string {
  if (measured === 0) {
    return `No hay mediciones de ${pollutantLabel(pollutant)} a las ${formatHour(hour)} UTC.`
  }
  const noun = measured === 1 ? "estación tiene" : "estaciones tienen"
  return `${measured} ${noun} ${pollutantLabel(pollutant)} a las ${formatHour(hour)} UTC.`
}

function formatCoordinate(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}
