import { useCallback, useEffect, useMemo, useState } from "react"
import * as d3 from "d3"
import { industries } from "../../data/industries"
import { stations } from "../../data/stations"
import { formatReading } from "../../domain/airQuality"
import { SOURCE_OPTIONS, type IndustryStatus } from "../../domain/industry"
import type { Station } from "../../domain/station"
import { formatHour } from "../../domain/time"
import { CategoryBars, type BarGroup } from "./charts/CategoryBars"
import { CorrelationMatrix } from "./charts/CorrelationMatrix"
import { MovingAverageSeries } from "./charts/MovingAverageSeries"
import {
  correlationMatrix,
  dayStartHour,
  hourToIsoDate,
  loadMeasurements,
  movingAverageSeries,
  stationMeans,
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
} from "./domain/industryGroups"
import { hasLevels, VARIABLES, variableById, variableLevel, type VariableId } from "./domain/variables"
import { ExpertMap } from "./map/ExpertMap"
import "./expert.css"

const DATA_FIRST_DAY = "2024-01-01"
const DATA_LAST_DAY = "2025-05-27"
const MIN_CORRELATION_DAYS = 7

// Recuadro inicial sobre la Sabana Occidente, donde se concentran estaciones e industrias.
const INITIAL_SELECTION: GeoBox = { south: 4.48, west: -74.3, north: 4.84, east: -74.05 }

// Un color por estación, estable entre recortes.
const STATION_PALETTE = [...d3.schemeTableau10, ...d3.schemeDark2, ...d3.schemeSet1.slice(0, 5)]
const STATION_COLORS: Record<string, string> = Object.fromEntries(
  stations.map((station, index) => [station.id, STATION_PALETTE[index % STATION_PALETTE.length]]),
)

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

type LoadState =
  | { status: "loading" }
  | { status: "ready"; store: MeasurementStore }
  | { status: "error"; message: string }

export function ExpertDashboard() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [dateFrom, setDateFrom] = useState("2024-01-01")
  const [dateTo, setDateTo] = useState("2024-01-31")
  const [hourFrom, setHourFrom] = useState(0)
  const [hourTo, setHourTo] = useState(23)
  const [status, setStatus] = useState<IndustryStatus>("seguimiento")
  const [selection, setSelection] = useState<GeoBox | null>(INITIAL_SELECTION)
  const [variable, setVariable] = useState<VariableId>("pm25")
  const [corrFrom, setCorrFrom] = useState("2024-01-01")
  const [corrTo, setCorrTo] = useState("2024-01-14")

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

  const timeWindow = useMemo<TimeWindow>(() => {
    const [first, last] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom]
    return { startHour: dayStartHour(first), endHour: dayStartHour(last) + 23, hourFrom, hourTo }
  }, [dateFrom, dateTo, hourFrom, hourTo])

  const visibleIndustries = useMemo(
    () => industries.filter((industry) => industry.status === status),
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

  const means = useMemo(
    () => (store ? stationMeans(store, variable, timeWindow) : {}),
    [store, timeWindow, variable],
  )
  const stationFill = useMemo(() => {
    const fill: Record<string, string> = {}
    for (const [id, value] of Object.entries(means)) {
      fill[id] = variableLevel(variable, value)?.color ?? "#c9d3ce"
    }
    return fill
  }, [means, variable])

  const stationDetail = useCallback(
    (station: Station) => {
      const meta = variableById(variable)
      const value = means[station.id]
      if (value == null) return `Sin ${meta.label} en el rango`
      const level = variableLevel(variable, value)
      return `${meta.label} medio ${formatReading(value)} ${meta.unit}${level ? ` · ${level.label}` : ""}`
    },
    [means, variable],
  )

  const series = useMemo(
    () => (store ? movingAverageSeries(store, pickedStationIds, variable, timeWindow) : []),
    [pickedStationIds, store, timeWindow, variable],
  )

  const corrDays = Math.round((dayStartHour(corrTo) - dayStartHour(corrFrom)) / 24) + 1
  const corrMessage =
    load.status === "loading"
      ? "Cargando mediciones…"
      : load.status === "error"
        ? load.message
        : corrDays < MIN_CORRELATION_DAYS
          ? `Elige al menos ${MIN_CORRELATION_DAYS} días (una semana completa). Ahora: ${Math.max(0, corrDays)}.`
          : pickedStationIds.length === 0
            ? "El recuadro no incluye estaciones"
            : null
  const correlation = useMemo(() => {
    if (!store || corrMessage) return null
    return correlationMatrix(store, pickedStationIds, dayStartHour(corrFrom), dayStartHour(corrTo) + 23)
  }, [corrFrom, corrMessage, corrTo, pickedStationIds, store])

  const barGroups = useMemo<BarGroup[]>(() => {
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
  const statusName = STATUS_OPTIONS.find((option) => option.id === status)?.label.toLocaleLowerCase("es") ?? ""

  return (
    <div className="dashboard expert">
      <header className="dashboard-header expert-header">
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          Vista experta · {formatDay(timeWindow.startHour)} – {formatDay(timeWindow.endHour)} ·{" "}
          {formatHour(hourFrom)}–{formatHour(hourTo)} UTC
        </p>
      </header>

      <div className="expert-layout">
        <section className="range-bar" aria-label="Rango de fechas y horas">
          <div className="range-group">
            <span>Rango de fechas (inicio – fin)</span>
            <div className="range-inputs">
              <input
                type="date"
                value={dateFrom}
                min={DATA_FIRST_DAY}
                max={DATA_LAST_DAY}
                aria-label="Fecha de inicio"
                onChange={(event) => event.target.value && setDateFrom(event.target.value)}
              />
              <span aria-hidden="true">–</span>
              <input
                type="date"
                value={dateTo}
                min={DATA_FIRST_DAY}
                max={DATA_LAST_DAY}
                aria-label="Fecha de fin"
                onChange={(event) => event.target.value && setDateTo(event.target.value)}
              />
            </div>
          </div>
          <div className="range-group">
            <span>Rango de horas (inicio – fin)</span>
            <div className="range-inputs">
              <HourSelect label="Hora de inicio" value={hourFrom} onChange={setHourFrom} />
              <span aria-hidden="true">–</span>
              <HourSelect label="Hora de fin" value={hourTo} onChange={setHourTo} />
            </div>
          </div>
        </section>

        <section className="status-filter" aria-label="Estado de las industrias">
          <span>Estado de las industrias</span>
          <div className="segmented" role="radiogroup" aria-label="Estado de las industrias">
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
          onSelection={setSelection}
        />

        <section className="chart-card series-card" aria-label="Media móvil por estación">
          <header className="chart-header">
            <h2>Comportamiento media móvil por estación</h2>
            <div className="chart-header-tools">
              <span className="chart-note">Una línea por estación seleccionada</span>
              <label className="dark-select">
                <span>Variable:</span>
                <select value={variable} onChange={(event) => setVariable(event.target.value as VariableId)}>
                  {VARIABLES.map((item) => (
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
          </ul>
          <MovingAverageSeries
            series={series}
            colors={STATION_COLORS}
            variable={variable}
            startHour={timeWindow.startHour}
            endHour={timeWindow.endHour}
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
                  min={DATA_FIRST_DAY}
                  max={DATA_LAST_DAY}
                  aria-label="Inicio del periodo de correlación"
                  onChange={(event) => event.target.value && setCorrFrom(event.target.value)}
                />
                <span aria-hidden="true">–</span>
                <input
                  type="date"
                  value={corrTo}
                  min={DATA_FIRST_DAY}
                  max={DATA_LAST_DAY}
                  aria-label="Fin del periodo de correlación"
                  onChange={(event) => event.target.value && setCorrTo(event.target.value)}
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
          </section>
        </div>
      </div>
    </div>
  )
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (hour: number) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {HOURS.map((hour) => (
        <option key={hour} value={hour}>
          {formatHour(hour)}
        </option>
      ))}
    </select>
  )
}

function formatDay(hour: number): string {
  const [year, month, day] = hourToIsoDate(hour).split("-")
  return `${day}/${month}/${year}`
}
