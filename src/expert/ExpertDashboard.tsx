import { useCallback, useEffect, useMemo, useState } from "react"
import * as d3 from "d3"
import { industries } from "../data/industries"
import { stations } from "../data/stations"
import { formatReading } from "../domain/airQuality"
import { SOURCE_OPTIONS, statusLabel } from "../domain/industry"
import type { Station } from "../domain/station"
import { CategoryBars, type BarGroup } from "./charts/CategoryBars"
import { CorrelationMatrix } from "./charts/CorrelationMatrix"
import { MovingAverageSeries } from "./charts/MovingAverageSeries"
import {
  correlationMatrix,
  dayStartHour,
  firstHourWithData,
  hourToDate,
  hourToIsoDate,
  loadMeasurements,
  movingAverageSeries,
  stationValuesAt,
  type MeasurementStore,
  type TimeWindow,
} from "./data/measurements"
import { insideBox, type GeoBox } from "./domain/geoBox"
import {
  countBy,
  fuelLabel,
  SANCTION_REASONS,
  sanctionCode,
  sourceLabel,
  STATUS_OPTIONS,
  type StatusFilter,
} from "./domain/industryGroups"
import { addDays, clampToPeriod, PERIODS, periodById, type PeriodId } from "./domain/periods"
import {
  CORRELATION_VARIABLES,
  hasLevels,
  POLLUTANT_VARIABLES,
  variableById,
  variableLevel,
  type VariableId,
} from "./domain/variables"
import { exposureHours } from "./domain/icaLevels"
import { ExpertMap } from "./map/ExpertMap"
import "./expert.css"

const MIN_CORRELATION_DAYS = 5
const DEFAULT_RANGE_DAYS = 31
// Sin clic en la serie, el mapa usa el mediodía (12:00 UTC) del primer día del rango.
const DEFAULT_MAP_HOUR_OF_DAY = 12

// Recuadro inicial sobre la Sabana Occidente, donde se concentran estaciones e industrias.
const INITIAL_SELECTION: GeoBox = { south: 4.48, west: -74.3, north: 4.84, east: -74.05 }

// Un color por estación, estable entre recortes.
const STATION_PALETTE = [...d3.schemeTableau10, ...d3.schemeDark2, "#17becf", "#bcbd22", "#393b79", "#8c6d31", "#843c39"]
const STATION_COLORS: Record<string, string> = Object.fromEntries(
  stations.map((station, index) => [station.id, STATION_PALETTE[index % STATION_PALETTE.length]]),
)

const STATUS_ORDER = ["seguimiento", "tramite", "sancionada"] as const

type LoadState =
  | { status: "loading" }
  | { status: "ready"; store: MeasurementStore }
  | { status: "error"; message: string }

export function ExpertDashboard() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [periodId, setPeriodId] = useState<PeriodId>("2024")
  const [dateFrom, setDateFrom] = useState("2024-01-01")
  const [dateTo, setDateTo] = useState("2024-01-31")
  const [pickedHour, setPickedHour] = useState<number | null>(null)
  const [status, setStatus] = useState<StatusFilter>("todas")
  const [selection, setSelection] = useState<GeoBox | null>(INITIAL_SELECTION)
  const [variable, setVariable] = useState<VariableId>("pm25")
  const [corrFrom, setCorrFrom] = useState("2024-01-01")
  const [corrTo, setCorrTo] = useState("2024-01-07")

  const period = periodById(periodId)

  useEffect(() => {
    let alive = true
    loadMeasurements()
      .then((store) => alive && setLoad({ status: "ready", store }))
      .catch((error: unknown) =>
        alive && setLoad({ status: "error", message: error instanceof Error ? error.message : String(error) }),
      )
    return () => {
      alive = false
    }
  }, [])

  const store = load.status === "ready" ? load.store : null

  // Cambiar de periodo reinicia los rangos desde el primer día con mediciones del periodo.
  function choosePeriod(id: PeriodId) {
    const next = periodById(id)
    const firstHour = store ? firstHourWithData(store, dayStartHour(next.first), dayStartHour(next.last) + 23) : null
    const start = firstHour == null ? next.first : hourToIsoDate(firstHour)
    setPeriodId(id)
    setDateFrom(start)
    setDateTo(clampToPeriod(addDays(start, DEFAULT_RANGE_DAYS - 1), next))
    setCorrFrom(start)
    setCorrTo(clampToPeriod(addDays(start, 6), next))
    setPickedHour(null)
  }

  function chooseDate(which: "from" | "to", value: string) {
    if (!value) return
    const date = clampToPeriod(value, period)
    if (which === "from") setDateFrom(date)
    else setDateTo(date)
    setPickedHour(null)
  }

  function chooseCorrDate(which: "from" | "to", value: string) {
    if (!value) return
    const date = clampToPeriod(value, period)
    if (which === "from") setCorrFrom(date)
    else setCorrTo(date)
  }

  const timeWindow = useMemo<TimeWindow>(() => {
    const [first, last] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom]
    return { startHour: dayStartHour(first), endHour: dayStartHour(last) + 23, hourFrom: 0, hourTo: 23 }
  }, [dateFrom, dateTo])

  const mapHour =
    pickedHour != null && pickedHour >= timeWindow.startHour && pickedHour <= timeWindow.endHour
      ? pickedHour
      : timeWindow.startHour + DEFAULT_MAP_HOUR_OF_DAY

  const visibleIndustries = useMemo(
    () => (status === "todas" ? industries : industries.filter((industry) => industry.status === status)),
    [status],
  )

  const pickedStations = useMemo(
    () => (selection ? stations.filter((station) => insideBox(selection, station.latitude, station.longitude)) : stations),
    [selection],
  )
  const pickedIndustries = useMemo(
    () =>
      selection
        ? visibleIndustries.filter((industry) => insideBox(selection, industry.latitude, industry.longitude))
        : visibleIndustries,
    [selection, visibleIndustries],
  )
  const selectedStationIds = useMemo(
    () => new Set(selection ? pickedStations.map((station) => station.id) : []),
    [pickedStations, selection],
  )
  const selectedIndustryIds = useMemo(
    () => new Set(selection ? pickedIndustries.map((industry) => industry.id) : []),
    [pickedIndustries, selection],
  )
  const pickedStationIds = useMemo(() => pickedStations.map((station) => station.id), [pickedStations])

  // Valor de cada estación (todas, no solo las del recuadro) en la hora del mapa.
  const readings = useMemo(
    () => (store ? stationValuesAt(store, variable, mapHour) : {}),
    [mapHour, store, variable],
  )
  const stationFill = useMemo(() => {
    const fill: Record<string, string> = {}
    for (const [id, value] of Object.entries(readings)) {
      fill[id] = variableLevel(variable, value)?.color ?? "#c9d3ce"
    }
    return fill
  }, [readings, variable])

  const stationDetail = useCallback(
    (station: Station) => {
      const meta = variableById(variable)
      const value = readings[station.id]
      const when = formatInstant(mapHour)
      if (value == null) return `Sin ${meta.label} el ${when}`
      const level = variableLevel(variable, value)
      return `${meta.label} ${formatReading(value)} ${meta.unit}${level ? ` · ${level.label}` : ""} · ${when}`
    },
    [mapHour, readings, variable],
  )

  const series = useMemo(
    () => (store ? movingAverageSeries(store, pickedStationIds, variable, timeWindow, exposureHours(variable)) : []),
    [pickedStationIds, store, timeWindow, variable],
  )

  const corrDays = Math.round((dayStartHour(corrTo) - dayStartHour(corrFrom)) / 24) + 1
  const corrMessage =
    load.status === "loading"
      ? "Cargando mediciones…"
      : load.status === "error"
        ? load.message
        : corrDays < MIN_CORRELATION_DAYS
          ? `Elige al menos ${MIN_CORRELATION_DAYS} días. Ahora: ${Math.max(0, corrDays)}.`
          : pickedStationIds.length === 0
            ? "El recuadro no incluye estaciones"
            : null
  const correlation = useMemo(() => {
    if (!store || corrMessage) return null
    return correlationMatrix(
      store,
      pickedStationIds,
      dayStartHour(corrFrom),
      dayStartHour(corrTo) + 23,
      CORRELATION_VARIABLES,
    )
  }, [corrFrom, corrMessage, corrTo, pickedStationIds, store])

  const barGroups = useMemo<BarGroup[]>(() => {
    if (status === "todas") {
      return [
        {
          title: "Estado de la industria",
          counts: countBy(
            pickedIndustries,
            (industry) => statusLabel(industry.status),
            3,
            STATUS_ORDER.map((id) => statusLabel(id)),
          ),
        },
      ]
    }
    if (status === "sancionada") {
      return [
        {
          title: "Razón de la sanción",
          counts: countBy(pickedIndustries, sanctionCode, 6, SANCTION_REASONS.map((reason) => reason.code)),
        },
      ]
    }
    return [
      {
        title: "Tipo de fuente de emisión",
        counts: countBy(
          pickedIndustries,
          sourceLabel,
          6,
          SOURCE_OPTIONS.filter((option) => option.id !== "todos").map((option) => option.label),
        ).filter((item) => item.count > 0 || item.label !== "Sin dato"),
      },
      { title: "Tipo de combustible", counts: countBy(pickedIndustries, fuelLabel, 5) },
    ]
  }, [pickedIndustries, status])

  const sanctionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const industry of pickedIndustries) {
      const code = sanctionCode(industry)
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return counts
  }, [pickedIndustries])

  const meta = variableById(variable)
  const seriesEmpty =
    load.status === "loading"
      ? "Cargando mediciones…"
      : load.status === "error"
        ? load.message
        : pickedStationIds.length === 0
          ? "El recuadro no incluye estaciones"
          : `Sin ${meta.label} para estas estaciones en el rango`
  const statusName =
    status === "todas"
      ? ""
      : (STATUS_OPTIONS.find((option) => option.id === status)?.label.toLocaleLowerCase("es") ?? "")

  return (
    <div className="dashboard expert">
      <header className="dashboard-header expert-header">
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          Vista experta · {formatDay(timeWindow.startHour)} – {formatDay(timeWindow.endHour)} · Mapa:{" "}
          {meta.label} el {formatInstant(mapHour)}
        </p>
      </header>

      <div className="expert-layout">
        <section className="range-bar" aria-label="Periodo y rango de fechas">
          <div className="range-group">
            <span>Datos disponibles</span>
            <div className="segmented" role="radiogroup" aria-label="Periodo con datos">
              {PERIODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === periodId}
                  className={option.id === periodId ? "is-selected" : undefined}
                  onClick={() => choosePeriod(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="range-group">
            <span>Rango de fechas (inicio – fin)</span>
            <div className="range-inputs">
              <input
                type="date"
                value={dateFrom}
                min={period.first}
                max={period.last}
                aria-label="Fecha de inicio"
                onChange={(event) => chooseDate("from", event.target.value)}
              />
              <span aria-hidden="true">–</span>
              <input
                type="date"
                value={dateTo}
                min={period.first}
                max={period.last}
                aria-label="Fecha de fin"
                onChange={(event) => chooseDate("to", event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="status-filter" aria-label="Industrias en el mapa">
          <span>Industrias en el mapa</span>
          <div className="segmented" role="radiogroup" aria-label="Industrias en el mapa">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === status}
                className={option.id === status ? "is-selected" : undefined}
                onClick={() => setStatus(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <ExpertMap
          industries={visibleIndustries}
          stations={stations}
          selection={selection}
          selectedStationIds={selectedStationIds}
          selectedIndustryIds={selectedIndustryIds}
          stationFill={stationFill}
          stationRing={STATION_COLORS}
          stationDetail={stationDetail}
          hourLabel={`${formatInstant(mapHour)} · ${stationCountLabel(Object.keys(readings).length)}`}
          onSelection={setSelection}
        />

        <section className="chart-card series-card" aria-label="Media móvil por estación">
          <header className="chart-header">
            <h2>Comportamiento media móvil por estación</h2>
            <div className="chart-header-tools">
              <span className="chart-note">Clic en la serie para elegir la hora del mapa</span>
              <label className="dark-select">
                <span>Variable:</span>
                <select value={variable} onChange={(event) => setVariable(event.target.value as VariableId)}>
                  {POLLUTANT_VARIABLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </header>
          <ul className="station-keys" aria-label="Estaciones en la serie">
            {series.map((item) => (
              <li key={item.stationId}>
                <i style={{ background: STATION_COLORS[item.stationId] }} />
                Est. {item.stationId}
              </li>
            ))}
            {!hasLevels(variable) && series.length > 0 && (
              <li className="key-note">{meta.label} no tiene bandas de calidad del aire</li>
            )}
            {pickedHour != null && (
              <li className="key-action">
                <button type="button" onClick={() => setPickedHour(null)}>
                  Volver al mediodía del primer día
                </button>
              </li>
            )}
          </ul>
          <MovingAverageSeries
            series={series}
            colors={STATION_COLORS}
            variable={variable}
            startHour={timeWindow.startHour}
            endHour={timeWindow.endHour}
            mapHour={mapHour}
            onMapHour={setPickedHour}
            emptyMessage={seriesEmpty}
          />
        </section>

        <div className="bottom-row">
          <section className="chart-card matrix-card" aria-label="Matriz de correlación">
            <header className="chart-header">
              <h2>Matriz de correlación</h2>
              <span className="chart-note">contaminantes y meteorología</span>
            </header>
            <div className="matrix-range">
              <span>Periodo (mín. {MIN_CORRELATION_DAYS} días)</span>
              <div className="range-inputs compact">
                <input
                  type="date"
                  value={corrFrom}
                  min={period.first}
                  max={period.last}
                  aria-label="Inicio del periodo de correlación"
                  onChange={(event) => chooseCorrDate("from", event.target.value)}
                />
                <span aria-hidden="true">–</span>
                <input
                  type="date"
                  value={corrTo}
                  min={period.first}
                  max={period.last}
                  aria-label="Fin del periodo de correlación"
                  onChange={(event) => chooseCorrDate("to", event.target.value)}
                />
              </div>
            </div>
            <CorrelationMatrix result={correlation} message={corrMessage} />
            <p className="chart-foot">
              Pearson con el promedio horario de {pickedStationIds.length}{" "}
              {pickedStationIds.length === 1 ? "estación" : "estaciones"} · todas las horas del periodo
            </p>
          </section>

          <section className="chart-card bars-card" aria-label="Industrias seleccionadas">
            <header className="chart-header">
              <h2>Industrias seleccionadas</h2>
              <span className="chart-note">
                {pickedIndustries.length} {statusName} {selection ? "dentro del recuadro" : "en total"}
              </span>
            </header>
            <div className={status === "sancionada" ? "bars-body has-legend" : "bars-body"}>
              <CategoryBars groups={barGroups} axisLabel="N.º de industrias" />
              {status === "sancionada" && (
                <aside className="code-legend" aria-label="Significado de los códigos de sanción">
                  <h3>Códigos de sanción</h3>
                  <dl>
                    {SANCTION_REASONS.map((reason) => (
                      <div key={reason.code}>
                        <dt>
                          {reason.code}
                          <span>{sanctionCounts.get(reason.code) ?? 0}</span>
                        </dt>
                        <dd>{reason.text}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              )}
            </div>
            {status === "todas" && (
              <p className="chart-foot">Elige un estado para ver fuente y combustible o la razón de sanción.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function stationCountLabel(count: number): string {
  if (count === 0) return "sin datos a esta hora"
  return `${count} ${count === 1 ? "estación" : "estaciones"} con dato`
}

function formatDay(hour: number): string {
  return d3.utcFormat("%d/%m/%Y")(hourToDate(hour))
}

function formatInstant(hour: number): string {
  return `${d3.utcFormat("%d/%m/%Y %H:00")(hourToDate(hour))} UTC`
}
