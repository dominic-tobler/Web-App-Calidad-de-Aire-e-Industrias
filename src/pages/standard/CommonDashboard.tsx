import { useEffect, useMemo, useState } from "react"
import { CommonWindRose } from "../../charts/CommonWindRose"
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
  windOnDay,
} from "../../data/observations"
import { stations } from "../../data/stations"
import {
  airQualityLevel,
  formatReading,
  pollutantLabel,
  unclassifiedNote,
  type AirQualityLevel,
  type Pollutant,
} from "../../domain/airQuality"
import { formatDistance } from "../../domain/geo"
import {
  dailyWind,
  industriesInWindRadius,
  SEARCH_RADIUS_KM,
  WIND_SECTORS,
  type DailyWind,
} from "../../domain/wind"
import { emissionSourceKey, emissionSourceLabel, placeWithDepartment, statusLabel } from "../../domain/industry"
import { stationPlace, stationStatusLabel, stationTitle } from "../../domain/station"
import { COLOMBIA_TIME_LABEL, formatHour, formatInstant, type Year } from "../../domain/time"
import { CundinamarcaMap, MapLegend } from "../../layouts/map/CundinamarcaMap"
import { useCommonState } from "../../state/commonState"
import { CalendarGrid } from "../../layouts/CalendarGrid"
import { EmissionFilters } from "../../layouts/EmissionFilters"
import { ViewNav } from "../../layouts/ViewNav"
import "./dashboard.css"

const NEARBY_LIST_LIMIT = 6

export function CommonDashboard() {
  const { state, setDate, setHour, setPlaying, setPollutant, setSelectedStation, setSource } = useCommonState()
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
  const windHours = useMemo(
    () =>
      selectedStation
        ? windOnDay(selectedStation.id, state.year, state.month, state.day)
        : [],
    [observationsState, selectedStation, state.day, state.month, state.year],
  )
  const wind = useMemo(() => dailyWind(windHours), [windHours])
  const nearby = useMemo(
    () =>
      selectedStation
        ? industriesInWindRadius(selectedStation, visibleIndustries, wind.regions)
        : [],
    [selectedStation, visibleIndustries, wind.regions],
  )
  const windCaption = windCaptionFor(observationsState, windHours.length, wind.calm, wind.regions)
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
  const dayUnclassified = dayAverage != null && dayLevel == null ? unclassifiedNote(state.pollutant) : null
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
    <div className="dashboard is-map-stage">
      <div className="lines-layout">
        <CundinamarcaMap
          industries={visibleIndustries}
          stations={stations}
          selectedStationId={state.selectedStationId}
          links={nearby}
          searchRadiusKm={selectedStation ? SEARCH_RADIUS_KM : null}
          windRegions={wind.regions}
          hourLabel={`${formatHour(state.hour)} ${COLOMBIA_TIME_LABEL}`}
          pollutant={state.pollutant}
          readings={hourReadings}
          onSelectStation={setSelectedStation}
        />

        <aside className="control-panel">
          <header className="dashboard-header">
            <ViewNav current="estandar" />
            <h1>Calidad del aire en Cundinamarca</h1>
            <p className="header-context">
              {observationsState === "loading"
                ? "Cargando mediciones…"
                : observationsState === "error"
                  ? observationsError
                  : `${formatInstant(state.year, state.month, state.day)} · ${formatHour(state.hour)} ${COLOMBIA_TIME_LABEL} · ${pollutantLabel(state.pollutant)}`}
            </p>
          </header>
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
            <p className="day-level-status">
              {dayAverage == null ? (
                <span>Sin mediciones este día</span>
              ) : dayLevel ? (
                <>
                  <i style={{ background: dayLevel.color }} aria-hidden="true" />
                  <span>Promedio de este día: {dayLevel.label}</span>
                </>
              ) : (
                <span>
                  Promedio de este día: {formatReading(dayAverage)} µg/m³, sin categoría ICA
                  {dayUnclassified ? `. ${dayUnclassified}` : ""}
                </span>
              )}
            </p>
          </section>
          <MapLegend />
        </aside>

        <div className="insight-column">
        <aside className="station-panel">
          <header>
            <h2>{selectedStation ? stationTitle(selectedStation) : "Estación seleccionada"}</h2>
            <p>
              {selectedStation
                ? `${stationPlace(selectedStation)} · ${stationStatusLabel(selectedStation)}`
                : "El círculo marca las industrias dentro del radio"}
            </p>
          </header>
          <div className="station-body">
            {selectedStation ? (
              <>
                <p className="station-reading">
                  {selectedReading == null
                    ? `Sin medición de ${pollutantLabel(state.pollutant)} a las ${formatHour(state.hour)} ${COLOMBIA_TIME_LABEL}`
                    : `${pollutantLabel(state.pollutant)} ${formatReading(selectedReading)}${selectedLevel ? ` · ${selectedLevel.label}` : " · sin categoría ICA"}`}
                </p>
                <p className="station-coords">
                  Latitud {formatCoordinate(selectedStation.latitude)} · Longitud{" "}
                  {formatCoordinate(selectedStation.longitude)}
                </p>
                <div className="wind-rose">
                  <CommonWindRose
                    counts={wind.counts}
                    regions={wind.regions.map((region) => region.sector)}
                    label={windCaption}
                  />
                  <div>
                    <h3 className="nearest-title">De dónde vino el viento</h3>
                    <p>{windCaption}</p>
                  </div>
                </div>
                <h3 className="nearest-title">
                  {wind.regions.length === 0 ? "Industrias dentro del radio" : "Industrias de esos lados"}
                  {nearby.length > 0 ? <span className="nearest-count">{nearby.length}</span> : null}
                </h3>
                <p className="wind-note">{nearbyNote(wind.regions.length > 0)}</p>
                {nearby.length === 0 ? (
                  <p>Ninguna industria visible en ese radio con el filtro actual.</p>
                ) : (
                  <>
                    <ol className="nearest-list">
                      {nearby.slice(0, NEARBY_LIST_LIMIT).map(({ industry, distanceKm }) => (
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
                    {nearby.length > NEARBY_LIST_LIMIT && (
                      <p className="wind-note">
                        y {nearby.length - NEARBY_LIST_LIMIT} más, dentro de esos lados
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <p>{coverageMessage(state.pollutant, measuredStations, state.hour)}</p>
                <p>
                  Elige una estación para ver de dónde vino el viento y las industrias dentro de{" "}
                  {SEARCH_RADIUS_KM} km.
                </p>
              </>
            )}
          </div>
        </aside>

        <HourlyTrend
          hour={state.hour}
          pollutant={state.pollutant}
          series={series}
          seriesLabel={selectedStation ? stationTitle(selectedStation) : "Promedio de estaciones"}
          playing={state.playing}
          onHour={setHour}
          onPlaying={setPlaying}
        />
        </div>
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

function windCaptionFor(
  observationsState: "loading" | "ready" | "error",
  hours: number,
  calm: number,
  regions: DailyWind["regions"],
): string {
  if (observationsState === "loading") return "Cargando el viento de este día…"
  if (observationsState === "error") return "No se pudo leer la dirección del viento."
  if (hours === 0) return "Esta estación no midió el viento este día."
  if (regions.length === 0) return "Este día casi no hubo viento, así que no hay un lado claro."
  const sentence = `Este día llegó sobre todo desde ${formatRegions(regions)}. Las puntas más largas son esos lados.`
  if (calm > 0 && calm >= hours - calm) return `${sentence} Varias horas casi no hubo viento.`
  return sentence
}

function formatRegions(regions: DailyWind["regions"]): string {
  const parts = regions.map(
    (region) => `${WIND_SECTORS[region.sector].short} ${Math.round(region.share * 100)}%`,
  )
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`
}

function nearbyNote(hasRegions: boolean): string {
  if (!hasRegions) {
    return `Sin una dirección de viento, se muestran las industrias a menos de ${SEARCH_RADIUS_KM} km.`
  }
  return `A menos de ${SEARCH_RADIUS_KM} km, en los lados de donde vino más el viento.`
}

function coverageMessage(pollutant: Pollutant, measured: number, hour: number): string {
  if (measured === 0) {
    return `No hay mediciones de ${pollutantLabel(pollutant)} a las ${formatHour(hour)} ${COLOMBIA_TIME_LABEL}.`
  }
  const noun = measured === 1 ? "estación tiene" : "estaciones tienen"
  return `${measured} ${noun} ${pollutantLabel(pollutant)} a las ${formatHour(hour)} ${COLOMBIA_TIME_LABEL}.`
}

function formatCoordinate(value: number): string {
  return value.toLocaleString("es-CO", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}
