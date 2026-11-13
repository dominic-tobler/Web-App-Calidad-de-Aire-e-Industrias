import { useMemo } from "react"
import { HourlyTrend } from "../charts/HourlyTrend"
import { industries } from "../data/industries"
import {
  averageReading,
  daysWithReadings,
  hourlySeries,
  readingAt,
  readingsAtHour,
} from "../data/observations"
import { nearestIndustries, stations } from "../data/stations"
import { airQualityLevel, formatReading, pollutantLabel, type Pollutant } from "../domain/airQuality"
import { formatDistance } from "../domain/geo"
import { formatPlace, SOURCE_OPTIONS, statusLabel, type SourceCategory } from "../domain/industry"
import { stationStatusLabel, stationTitle } from "../domain/station"
import { formatHour, formatInstant, MONTHS } from "../domain/time"
import { CundinamarcaMap } from "../map/CundinamarcaMap"
import { useCommonState } from "../state/commonState"
import { CalendarGrid } from "../ui/CalendarGrid"
import { EmissionFilters } from "../ui/EmissionFilters"
import "./dashboard.css"

export function CommonDashboard() {
  const { state, setDay, setHour, setPollutant, setSelectedStation, setSource, shiftMonth } =
    useCommonState()

  const visibleIndustries = useMemo(
    () =>
      industries.filter((industry) => {
        if (industry.status === "tramite") return false
        return state.source === "todos" || industry.source === state.source
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
    [state.pollutant, state.year, state.month, state.day, state.hour],
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
    [state.pollutant, state.year, state.month, state.day, state.selectedStationId],
  )
  const daySeries = useMemo(
    () => hourlySeries(state.pollutant, state.year, state.month, state.day, null),
    [state.pollutant, state.year, state.month, state.day],
  )
  const markedDays = useMemo(
    () => daysWithReadings(state.pollutant, state.year, state.month),
    [state.pollutant, state.year, state.month],
  )
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
          {formatInstant(state.year, state.month, state.day)} · {formatHour(state.hour)} UTC ·{" "}
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
              markedDays={markedDays}
              onDay={setDay}
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
                ? `${selectedStation.municipality ? formatPlace(selectedStation.municipality) : "Municipio sin asignar"} · ${stationStatusLabel(selectedStation)}`
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
                          <strong>{formatPlace(industry.municipality)}</strong>
                          <span className="nearest-meta">
                            {sourceLabel(industry.source)} · {statusLabel(industry.status)}
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

function coverageMessage(pollutant: Pollutant, measured: number, hour: number): string {
  if (pollutant === "ica") {
    return "La muestra no incluye el índice de calidad. Elige PM2.5, PM10, NO₂, NOx o SO₂."
  }
  if (measured === 0) {
    return "Este día no está en la muestra. Las lecturas disponibles son del 22 de enero de 2024."
  }
  const noun = measured === 1 ? "estación tiene" : "estaciones tienen"
  return `${measured} ${noun} ${pollutantLabel(pollutant)} a las ${formatHour(hour)} UTC.`
}

function sourceLabel(source: SourceCategory): string {
  return SOURCE_OPTIONS.find((option) => option.id === source)?.label ?? source
}

function formatCoordinate(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}
