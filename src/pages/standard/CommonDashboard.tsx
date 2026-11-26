import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { CommonWindRose } from "../../charts/CommonWindRose"
import { HourlyTrend } from "../../charts/HourlyTrend"
import { EMISSION_SOURCE_ALL, EMISSION_SOURCE_OPTIONS, industries } from "../../data/industries"
import {
  averageReading,
  dailyAverageReadings,
  daysWithReadings,
  hourlySeries,
  hourlySeriesForStations,
  loadObservations,
  monthsWithReadings,
  readingAt,
  readingsAtHour,
  windOnDay,
  type MonthRef,
} from "../../data/observations"
import { stations } from "../../data/stations"
import {
  AIR_QUALITY_LEVELS,
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
import {
  countByStatus,
  emissionSourceKey,
  emissionSourceLabel,
  formatPlace,
  industryMunicipalityKey,
  municipalityKey,
  placeWithDepartment,
  statusLabel,
  type Industry,
} from "../../domain/industry"
import { stationPlace, stationStatusLabel, stationTitle, type Station } from "../../domain/station"
import { COLOMBIA_TIME_LABEL, formatHour, formatInstant, MONTHS, YEARS, type Year } from "../../domain/time"
import {
  CundinamarcaMap,
  MapLegend,
  type MunicipalityRef,
} from "../../layouts/map/CundinamarcaMap"
import { IndustryIcon } from "../../layouts/map/IndustryIcon"
import { INDUSTRY_STATUS_STYLE } from "../../layouts/map/industryMarkers"
import { useCommonState } from "../../state/commonState"
import { CalendarGrid } from "../../layouts/CalendarGrid"
import { EmissionFilters } from "../../layouts/EmissionFilters"
import { ViewNav } from "../../layouts/ViewNav"
import "./dashboard.css"

const NEARBY_LIST_LIMIT = 6

export function CommonDashboard() {
  const { state, setDate, setHour, setHourlyStationIds, setPlaying, setPollutant, setSelectedStation, setSource } =
    useCommonState()
  const [calendar, setCalendar] = useState(() => ({ year: state.year, month: state.month }))
  const [observationsState, setObservationsState] = useState<"loading" | "ready" | "error">("loading")
  const [observationsError, setObservationsError] = useState<string | null>(null)
  const [municipality, setMunicipality] = useState<MunicipalityRef | null>(null)

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

  // Las flechas del calendario solo recorren meses con mediciones y saltan los periodos vacíos.
  const availableMonths = useMemo(
    () => monthsWithReadings().filter((ref) => (YEARS as readonly number[]).includes(ref.year)),
    [observationsState],
  )
  function goToYear(year: Year) {
    if (observationsState !== "ready") {
      setCalendar({ year, month: calendar.month })
      return
    }
    const inYear = availableMonths.filter((ref) => ref.year === year)
    if (inYear.length === 0) return
    const same = inYear.find((ref) => ref.month === calendar.month)
    const target = same ?? nearestMonth(inYear, calendar.month)
    setCalendar({ year, month: target.month })
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
  const series = useMemo(() => {
    if (state.selectedStationId) {
      return hourlySeries(
        state.pollutant,
        state.year,
        state.month,
        state.day,
        state.selectedStationId,
      )
    }
    return hourlySeriesForStations(
      state.pollutant,
      state.year,
      state.month,
      state.day,
      state.hourlyStationIds,
    )
  }, [
    observationsState,
    state.hourlyStationIds,
    state.pollutant,
    state.year,
    state.month,
    state.day,
    state.selectedStationId,
  ])
  const daySeries = useMemo(
    () => hourlySeries(state.pollutant, state.year, state.month, state.day, null),
    [observationsState, state.pollutant, state.year, state.month, state.day],
  )
  const markedDays = useMemo(
    () => daysWithReadings(state.pollutant, calendar.year, calendar.month),
    [observationsState, state.pollutant, calendar.year, calendar.month],
  )
  const monthTones = useMemo(() => {
    const tones = new Map<number, MonthTone>()
    if (observationsState !== "ready") return tones
    for (const ref of availableMonths) {
      const values = Object.values(dailyAverageReadings(state.pollutant, ref.year, ref.month))
      tones.set(monthCursor(ref), { days: values.length, level: usualMonthLevel(state.pollutant, values) })
    }
    return tones
  }, [availableMonths, observationsState, state.pollutant])
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

  // Industrias registradas en el municipio elegido, con el mismo filtro de fuente que el mapa.
  const municipalityIndustries = useMemo(
    () =>
      municipality
        ? visibleIndustries.filter((industry) => industryMunicipalityKey(industry) === municipality.key)
        : [],
    [municipality, visibleIndustries],
  )
  const municipalitySources = useMemo(() => topSources(municipalityIndustries), [municipalityIndustries])
  const sourceFilterLabel =
    state.source === EMISSION_SOURCE_ALL
      ? null
      : (EMISSION_SOURCE_OPTIONS.find((option) => option.id === state.source)?.label ?? null)

  // Estación y municipio se excluyen: elegir uno quita el otro.
  function selectStation(id: string | null) {
    if (id != null) {
      setMunicipality(null)
      setHourlyStationIds(null)
    }
    setSelectedStation(id)
  }

  function selectMunicipality(next: MunicipalityRef | null) {
    const chosen = next && municipality?.key === next.key ? null : next
    setMunicipality(chosen)
    setHourlyStationIds(chosen ? stationIdsInMunicipality(chosen.key) : null)
    if (next) setSelectedStation(null)
  }

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
          onSelectStation={selectStation}
          selectedMunicipalityKey={municipality?.key ?? null}
          onSelectMunicipality={selectMunicipality}
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
            <MonthPicker
              year={calendar.year}
              month={calendar.month}
              ready={observationsState === "ready"}
              availableMonths={availableMonths}
              tones={monthTones}
              pollutant={state.pollutant}
              onYear={goToYear}
              onMonth={(month) => setCalendar({ year: calendar.year, month })}
            />
            <CalendarGrid
              year={calendar.year}
              month={calendar.month}
              day={selectedDay}
              markedDays={markedDays}
              dayLevels={dayLevels}
              onDay={(day) => setDate(calendar.year, calendar.month, day)}
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
          <HourlyTrend
            hour={state.hour}
            pollutant={state.pollutant}
            series={series}
            seriesLabel={hourlySeriesLabel(selectedStation, municipality, state.hourlyStationIds)}
            playing={state.playing}
            onHour={setHour}
            onPlaying={setPlaying}
          />
        </aside>

        <div className="insight-column">
        <aside className="station-panel">
          <header>
            <h2>
              {selectedStation
                ? stationTitle(selectedStation)
                : municipality
                  ? formatPlace(municipality.name)
                  : "Estación o municipio"}
            </h2>
            <p className={selectedStation || municipality ? undefined : "station-cue"}>
              {selectedStation
                ? `${stationPlace(selectedStation)} · ${stationStatusLabel(selectedStation)}`
                : municipality
                  ? municipalitySubtitle(municipality)
                  : "Haz clic en una estación o en un municipio del mapa"}
            </p>
          </header>
          <div className="station-body">
            {!selectedStation && municipality ? (
              <>
                <p className="station-reading">
                  {municipalityIndustries.length === 0
                    ? "No hay industrias registradas aquí"
                    : `${municipalityIndustries.length} ${municipalityIndustries.length === 1 ? "industria registrada" : "industrias registradas"}`}
                </p>
                {sourceFilterLabel && (
                  <p className="wind-note">Solo cuenta la fuente «{sourceFilterLabel}», como el filtro.</p>
                )}
                {municipalityIndustries.length > 0 && (
                  <>
                    <StatusCounts counts={countByStatus(municipalityIndustries)} />
                    <h3 className="nearest-title">Fuentes de emisión más comunes</h3>
                    <ol className="nearest-list">
                      {municipalitySources.top.map((source) => (
                        <li key={source.key}>
                          <strong>{source.label}</strong>
                          <span className="nearest-distance">{source.count}</span>
                        </li>
                      ))}
                    </ol>
                    {municipalitySources.rest > 0 && (
                      <p className="wind-note">
                        y {municipalitySources.rest} {municipalitySources.rest === 1 ? "tipo" : "tipos"} más
                      </p>
                    )}
                  </>
                )}
                <p className="wind-note">
                  Elige una estación para ver de dónde vino el viento. Otro clic en el municipio lo quita.
                </p>
              </>
            ) : selectedStation ? (
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
                {nearby.length > 0 && (
                  <StatusCounts counts={countByStatus(nearby.map(({ industry }) => industry))} />
                )}
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
                  {SEARCH_RADIUS_KM} km, o un municipio para ver cuántas industrias tiene registradas.
                </p>
              </>
            )}
          </div>
        </aside>

        <MapLegend
          selection={
            selectedStation
              ? { radiusKm: SEARCH_RADIUS_KM, hasWind: wind.regions.length > 0 }
              : null
          }
          municipalitySelected={municipality != null}
        />
        </div>
      </div>
    </div>
  )
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg className={open ? "month-caret is-open" : "month-caret"} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6.25 8 11.25 13 6.25" />
    </svg>
  )
}

const SOURCE_LIST_LIMIT = 4
const DARK_MONTH_INK = new Set(["buena", "moderada", "sensibles"])

type MonthTone = { days: number; level: AirQualityLevel | null }

function MonthPicker({
  year,
  month,
  ready,
  availableMonths,
  tones,
  pollutant,
  onYear,
  onMonth,
}: {
  year: Year
  month: number
  ready: boolean
  availableMonths: readonly MonthRef[]
  tones: ReadonlyMap<number, MonthTone>
  pollutant: Pollutant
  onYear: (year: Year) => void
  onMonth: (month: number) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const monthsThisYear = new Set(
    availableMonths.filter((ref) => ref.year === year).map((ref) => ref.month),
  )

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="month-picker" ref={rootRef}>
      <button
        type="button"
        className={open ? "month-picker-button is-open" : "month-picker-button"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {MONTHS[month]} {year}
        <Caret open={open} />
      </button>
      {open ? (
        <div className="month-picker-panel" role="dialog" aria-label="Elegir año y mes">
          <div className="year-switch" role="group" aria-label="Año">
            {YEARS.map((option) => {
              const hasData = availableMonths.some((ref) => ref.year === option)
              return (
                <button
                  key={option}
                  type="button"
                  className={option === year ? "is-selected" : undefined}
                  aria-pressed={option === year}
                  aria-disabled={ready && !hasData}
                  onClick={() => {
                    if (ready && !hasData) return
                    onYear(option)
                  }}
                >
                  {option}
                </button>
              )
            })}
          </div>
          <div className="month-grid" role="group" aria-label={`Meses de ${year}`}>
            {MONTHS.map((name, index) => {
              const available = !ready || monthsThisYear.has(index)
              const tone = tones.get(year * 12 + index)
              const selected = index === month
              const label = monthChoiceLabel(name, year, pollutant, ready, available, tone)
              return (
                <button
                  key={name}
                  type="button"
                  className={monthChipClass(selected, tone?.level)}
                  style={monthChipStyle(selected, tone?.level)}
                  aria-pressed={selected}
                  aria-disabled={!available}
                  aria-label={available ? label : `${name} de ${year}, mes sin datos`}
                  title={available ? label : "Mes sin datos"}
                  onClick={() => {
                    if (!available) return
                    onMonth(index)
                    setOpen(false)
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
          <p className="month-picker-hint">El color es el nivel más habitual.</p>
        </div>
      ) : null}
    </div>
  )
}

function monthChipClass(selected: boolean, level: AirQualityLevel | null | undefined): string {
  const classes = ["month-chip"]
  if (level) classes.push("has-level")
  if (selected) classes.push("is-selected")
  return classes.join(" ")
}

function monthChipStyle(
  selected: boolean,
  level: AirQualityLevel | null | undefined,
): CSSProperties | undefined {
  if (!level && !selected) return undefined
  return {
    backgroundColor: level?.color,
    color: level && !DARK_MONTH_INK.has(level.id) ? "#ffffff" : undefined,
    boxShadow: selected
      ? level
        ? "inset 0 0 0 2px #ffffff, inset 0 0 0 4px #1a2420"
        : "inset 0 0 0 2px #1a2420"
      : undefined,
  }
}

function monthChoiceLabel(
  name: string,
  year: number,
  pollutant: Pollutant,
  ready: boolean,
  available: boolean,
  tone: MonthTone | undefined,
): string {
  const when = `${name} de ${year}`
  if (!ready) return `${when}, cargando mediciones`
  if (!available) return `${when}, sin mediciones`
  if (!tone || tone.days === 0) return `${when}, sin mediciones de ${pollutantLabel(pollutant)}`
  if (!tone.level) return `${when}, con mediciones sin categoría ICA`
  return `${when}, nivel más habitual: ${tone.level.label}`
}

function usualMonthLevel(pollutant: Pollutant, values: readonly number[]): AirQualityLevel | null {
  const counts = new Map<string, { level: AirQualityLevel; count: number; rank: number }>()
  for (const value of values) {
    const level = airQualityLevel(pollutant, value)
    if (!level) continue
    const rank = AIR_QUALITY_LEVELS.findIndex((item) => item.id === level.id)
    const current = counts.get(level.id)
    if (current) current.count += 1
    else counts.set(level.id, { level, count: 1, rank })
  }
  let best: { level: AirQualityLevel; count: number; rank: number } | null = null
  for (const entry of counts.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.rank > best.rank)
    ) {
      best = entry
    }
  }
  return best?.level ?? null
}

function nearestMonth(months: readonly MonthRef[], month: number): MonthRef {
  return months.reduce((best, ref) => {
    const distance = Math.abs(ref.month - month)
    const bestDistance = Math.abs(best.month - month)
    if (distance < bestDistance || (distance === bestDistance && ref.month < best.month)) return ref
    return best
  })
}

function StatusCounts({ counts }: { counts: { sancionada: number; seguimiento: number } }) {
  return (
    <p className="status-counts">
      <span>
        <IndustryIcon style={INDUSTRY_STATUS_STYLE.sancionada} />
        {counts.sancionada} {counts.sancionada === 1 ? "sancionada" : "sancionadas"}
      </span>
      <span>
        <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} />
        {counts.seguimiento} en seguimiento
      </span>
    </p>
  )
}

function topSources(list: readonly Industry[]): {
  top: Array<{ key: string; label: string; count: number }>
  rest: number
} {
  const groups = new Map<string, { key: string; label: string; count: number }>()
  for (const industry of list) {
    const key = emissionSourceKey(industry.sourceRaw)
    const group = groups.get(key) ?? { key, label: emissionSourceLabel(industry.sourceRaw), count: 0 }
    group.count += 1
    groups.set(key, group)
  }
  const sorted = [...groups.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, "es"),
  )
  return { top: sorted.slice(0, SOURCE_LIST_LIMIT), rest: Math.max(0, sorted.length - SOURCE_LIST_LIMIT) }
}

function stationIdsInMunicipality(key: string): string[] {
  return stations.flatMap((station) =>
    station.municipality &&
    station.department &&
    municipalityKey(station.department, station.municipality) === key
      ? [station.id]
      : [],
  )
}

function hourlySeriesLabel(
  station: Station | null,
  municipality: MunicipalityRef | null,
  stationIds: string[] | null,
): string {
  if (station) return stationTitle(station)
  if (!municipality) return "Promedio de estaciones"
  const place = formatPlace(municipality.name)
  if (!stationIds || stationIds.length === 0) return `Sin estaciones en ${place}`
  return `Promedio en ${place}`
}

function municipalitySubtitle(municipality: MunicipalityRef): string {
  if (municipality.key === "bogota") return "Distrito Capital · incluye todas sus localidades"
  return `Municipio de ${formatPlace(municipality.department)}`
}

function monthCursor(ref: MonthRef): number {
  return ref.year * 12 + ref.month
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
