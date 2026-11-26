import { useCallback, useEffect, useMemo, useState } from "react"
import * as d3 from "d3"
import { industries } from "../../data/industries"
import { stations } from "../../data/stations"
import { formatReading } from "../../domain/airQuality"
import { COLOMBIA_TIME_LABEL, type Year } from "../../domain/time"
import { ViewNav } from "../../layouts/ViewNav"
import { useCommonState } from "../../state/commonState"
import { SOURCE_OPTIONS, statusLabel } from "../../domain/industry"
import type { Station } from "../../domain/station"
import { CategoryBars, type BarGroup } from "./charts/CategoryBars"
import { CorrelationMatrix, type CorrelationPanel } from "./charts/CorrelationMatrix"
import { MovingAverageSeries } from "./charts/MovingAverageSeries"
import {
  correlationByRain,
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
  matchesStatus,
  SANCTION_REASONS,
  sanctionCode,
  sourceLabel,
  STATUS_OPTIONS,
  type StatusFilter,
} from "./domain/industryGroups"
import { addDays, clampToPeriod, PERIODS, periodById, weeksCovering, type PeriodId } from "./domain/periods"
import {
  CORRELATION_VARIABLES,
  hasLevels,
  POLLUTANT_VARIABLES,
  variableById,
  variableLevel,
  type VariableId,
} from "./domain/variables"
import { exposureHours, ICA_UNCLASSIFIED } from "./domain/icaLevels"
import { ExpertMap } from "./map/ExpertMap"
import "../standard/dashboard.css"
import "./expert.css"

const DEFAULT_RANGE_DAYS = 31
// Ancho mínimo de la tarjeta de barras cuando la matriz toma el ancho que necesita.
const MIN_BARS_WIDTH = 360
// Parte del ancho ideal de la matriz que se le da; el resto pasa a las barras.
const MATRIX_WIDTH_SHARE = 0.9
// Sin clic en la serie, el mapa usa el mediodía (12:00 COT) del primer día del rango.
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
  const { state: common, setDate, setHour } = useCommonState()
  // Al llegar desde la vista estándar se parte de su día, hora, contaminante y estación.
  const [initial] = useState(() => initialFromCommon(common))
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [periodId, setPeriodId] = useState<PeriodId>(initial.periodId)
  const [dateFrom, setDateFrom] = useState(initial.dateFrom)
  const [dateTo, setDateTo] = useState(initial.dateTo)
  const [pickedHour, setPickedHour] = useState<number | null>(initial.pickedHour)
  // Hora bajo el cursor en la serie; mientras exista, manda sobre la hora fijada.
  const [hoverHour, setHoverHour] = useState<number | null>(null)
  const [status, setStatus] = useState<StatusFilter>("todas")
  const [selection, setSelection] = useState<GeoBox | null>(initial.selection)
  const [variable, setVariable] = useState<VariableId>(initial.variable)
  // Lunes de la semana elegida para las matrices; si deja de estar en el rango del mapa,
  // se usa la primera semana disponible.
  const [corrWeek, setCorrWeek] = useState<string | null>(null)
  const [matrixWidth, setMatrixWidth] = useState<number | null>(null)

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
    const start = clampToPeriod(firstHour == null ? next.first : hourToIsoDate(firstHour), next)
    setPeriodId(id)
    setDateFrom(start)
    setDateTo(clampToPeriod(addDays(start, DEFAULT_RANGE_DAYS - 1), next))
    setCorrWeek(null)
    setPickedHour(null)
  }

  function chooseDate(which: "from" | "to", value: string) {
    if (!value) return
    const date = clampToPeriod(value, period)
    if (which === "from") setDateFrom(date)
    else setDateTo(date)
    setPickedHour(null)
  }

  const timeWindow = useMemo<TimeWindow>(() => {
    const [first, last] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom]
    return { startHour: dayStartHour(first), endHour: dayStartHour(last) + 23, hourFrom: 0, hourTo: 23 }
  }, [dateFrom, dateTo])

  const mapHour =
    pickedHour != null && pickedHour >= timeWindow.startHour && pickedHour <= timeWindow.endHour
      ? pickedHour
      : timeWindow.startHour + DEFAULT_MAP_HOUR_OF_DAY
  const shownHour =
    hoverHour != null && hoverHour >= timeWindow.startHour && hoverHour <= timeWindow.endHour ? hoverHour : mapHour

  const visibleIndustries = useMemo(
    () => (status === "todas" ? industries : industries.filter((industry) => matchesStatus(status, industry.status))),
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

  // Valor de cada estación (todas, no solo las del recuadro) en la hora que muestra el mapa.
  const readings = useMemo(
    () => (store ? stationValuesAt(store, variable, shownHour) : {}),
    [shownHour, store, variable],
  )
  const stationFill = useMemo(() => {
    const fill: Record<string, string> = {}
    for (const [id, value] of Object.entries(readings)) {
      fill[id] = variableLevel(variable, value)?.color ?? ICA_UNCLASSIFIED
    }
    return fill
  }, [readings, variable])

  const stationDetail = useCallback(
    (station: Station) => {
      const meta = variableById(variable)
      const value = readings[station.id]
      const when = formatInstant(shownHour)
      if (value == null) return `Sin ${meta.label} el ${when}`
      const level = variableLevel(variable, value)
      return `${meta.label} ${formatReading(value)} ${meta.unit}${level ? ` · ${level.label}` : ""} · ${when}`
    },
    [readings, shownHour, variable],
  )

  const series = useMemo(
    () => (store ? movingAverageSeries(store, pickedStationIds, variable, timeWindow, exposureHours(variable)) : []),
    [pickedStationIds, store, timeWindow, variable],
  )

  // Semanas (lunes a domingo) con al menos un día dentro del rango de fechas del mapa.
  const corrWeeks = useMemo(() => weeksCovering(dateFrom, dateTo), [dateFrom, dateTo])
  const weekFrom = corrWeek != null && corrWeeks.includes(corrWeek) ? corrWeek : corrWeeks[0]
  const weekTo = addDays(weekFrom, 6)
  const [rangeFirst, rangeLast] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom]
  const weekExceedsRange = weekFrom < rangeFirst || weekTo > rangeLast
  const weekNote = weekExceedsRange
    ? "Usa la semana completa, incluidos días fuera del rango del mapa"
    : "Solo semanas que tocan el rango del mapa"

  const corrMessage =
    load.status === "loading"
      ? "Cargando mediciones…"
      : load.status === "error"
        ? load.message
        : pickedStationIds.length === 0
          ? "El recuadro no incluye estaciones"
          : null
  const correlation = useMemo(() => {
    if (!store || corrMessage) return null
    return correlationByRain(store, pickedStationIds, dayStartHour(weekFrom), dayStartHour(weekTo) + 23, CORRELATION_VARIABLES)
  }, [corrMessage, pickedStationIds, store, weekFrom, weekTo])
  const corrFoot = `Pearson con el promedio horario de ${pickedStationIds.length} ${
    pickedStationIds.length === 1 ? "estación" : "estaciones"
  } · con lluvia = precipitación media del recuadro > 0 mm · sin dato de lluvia cuenta como sin lluvia`
  const corrPanels = useMemo<CorrelationPanel[]>(() => {
    if (!correlation) return []
    return [
      {
        title: `Sin lluvia · ${hoursLabel(correlation.dry.hours)}`,
        result: correlation.dry,
        message: correlation.dry.hours === 0 ? "Sin horas sin lluvia esta semana" : null,
      },
      {
        title: `Con lluvia · ${hoursLabel(correlation.wet.hours)}`,
        result: correlation.wet,
        message:
          correlation.rainStations === 0
            ? "Ninguna estación del recuadro mide precipitación: todas las horas cuentan como sin lluvia"
            : correlation.wet.hours === 0
              ? "No llovió en las estaciones del recuadro esta semana"
              : null,
      },
    ]
  }, [correlation])

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
  const statusName = STATUS_OPTIONS.find((option) => option.id === status)?.count ?? ""

  // La vista estándar abre en el día y la hora que se ven en el mapa de esta vista.
  function syncToCommon() {
    const iso = hourToIsoDate(mapHour)
    const [year, month, day] = iso.split("-").map(Number)
    setDate(year as Year, month - 1, day)
    setHour(mapHour - dayStartHour(iso))
  }

  return (
    <div className="dashboard expert">
      <header className="dashboard-header expert-header">
        <ViewNav current="experta" className="is-bare" onLeave={syncToCommon} />
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          Vista experta · {formatDay(timeWindow.startHour)} – {formatDay(timeWindow.endHour)} · Mapa:{" "}
          {meta.label} el {formatInstant(shownHour)}
        </p>
      </header>

      <div className="expert-layout is-overview">
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
            <span>Rango de fechas, hora de Colombia</span>
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

        <ExpertMap
          industries={visibleIndustries}
          stations={stations}
          selection={selection}
          selectedStationIds={selectedStationIds}
          selectedIndustryIds={selectedIndustryIds}
          stationFill={stationFill}
          stationRing={STATION_COLORS}
          stationDetail={stationDetail}
          hourLabel={`${formatInstant(shownHour)} ·${stationCountLabel(Object.keys(readings).length)}`}
          onSelection={setSelection}
        />

        <section className="chart-card series-card" aria-label="Media móvil por estación">
          <header className="chart-header">
            <h2>Comportamiento media móvil por estación</h2>
            <div className="chart-header-tools">
              <span className="chart-note">Pase el cursor por la serie para ver esa hora en el mapa · clic para fijarla</span>
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
            onHoverHour={setHoverHour}
            emptyMessage={seriesEmpty}
          />
        </section>

        <div
          className="bottom-row"
          style={
            matrixWidth == null
              ? undefined
              : { gridTemplateColumns: `minmax(0, ${Math.round((matrixWidth + 2) * MATRIX_WIDTH_SHARE)}px) minmax(${MIN_BARS_WIDTH}px, 1fr)` }
          }
        >
          <section className="chart-card matrix-card" aria-label="Matriz de correlación">
            <header className="chart-header">
              <h2>Matriz de correlación</h2>
              <span className="chart-note">contaminantes y meteorología</span>
            </header>
            <div className="matrix-range">
              <label className="week-select">
                <span>Semana (lun – dom)</span>
                <select
                  value={weekFrom}
                  aria-label="Semana de las matrices de correlación"
                  onChange={(event) => setCorrWeek(event.target.value)}
                >
                  {corrWeeks.map((monday) => (
                    <option key={monday} value={monday}>
                      {formatWeek(monday)}
                    </option>
                  ))}
                </select>
              </label>
              <span className={weekExceedsRange ? "week-note is-outside" : "week-note"} title={weekNote}>
                {weekNote}
              </span>
            </div>
            <CorrelationMatrix
              variables={CORRELATION_VARIABLES}
              panels={corrPanels}
              message={corrMessage}
              onContentWidth={setMatrixWidth}
            />
            <p className="chart-foot" title={corrFoot}>
              {corrFoot}
            </p>
          </section>

          <section className="chart-card bars-card" aria-label="Industrias seleccionadas">
            <header className="chart-header">
              <h2>Industrias seleccionadas</h2>
              <span className="chart-note">
                {pickedIndustries.length} {statusName} {selection ? "dentro del recuadro" : "en total"}
              </span>
            </header>
            {/* El estado solo afecta a las industrias: estrellas del mapa y estas barras. */}
            <div className="bars-filter">
              <div className="segmented is-compact" role="radiogroup" aria-label="Estado de la industria: filtra el mapa y estas barras">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={option.id === status}
                    className={option.id === status ? "is-selected" : undefined}
                    title={option.title}
                    onClick={() => setStatus(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={status === "sancionada" ? "bars-body has-legend" : "bars-body"}>
              <CategoryBars groups={barGroups} axisLabel="N.º de industrias" />
              {status === "sancionada" && (
                <aside className="code-legend" aria-label="Significado de los códigos de sanción">
                  <h3>Códigos de sanción</h3>
                  <dl>
                    {SANCTION_REASONS.map((reason) => (
                      <div key={reason.code}>
                        <dt>{reason.code}:</dt>
                        <dd>
                          <span>{reason.text}</span>
                          <span className="code-count" title="Industrias con este código">
                            {sanctionCounts.get(reason.code) ?? 0}
                          </span>
                        </dd>
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

type CommonState = ReturnType<typeof useCommonState>["state"]

// Margen en grados alrededor de una estación que queda fuera del recuadro inicial.
const STATION_BOX_MARGIN = 0.15

function initialFromCommon(common: CommonState) {
  const iso = isoDate(common.year, common.month + 1, common.day)
  const period = PERIODS.find((option) => iso >= option.first && iso <= option.last)

  const pollutant = String(common.pollutant)
  const variable: VariableId = POLLUTANT_VARIABLES.find((item) => item.id === pollutant)?.id ?? "pm25"

  const station = stations.find((item) => item.id === common.selectedStationId)
  const selection: GeoBox =
    station && !insideBox(INITIAL_SELECTION, station.latitude, station.longitude)
      ? {
          south: station.latitude - STATION_BOX_MARGIN,
          north: station.latitude + STATION_BOX_MARGIN,
          west: station.longitude - STATION_BOX_MARGIN,
          east: station.longitude + STATION_BOX_MARGIN,
        }
      : INITIAL_SELECTION

  // Fecha fuera de los periodos con datos: el rango por defecto de siempre.
  if (!period) {
    return {
      periodId: "2024" as PeriodId,
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
      pickedHour: null,
      selection,
      variable,
    }
  }

  // El mes completo del día elegido, recortado al periodo.
  const lastDayOfMonth = new Date(Date.UTC(common.year, common.month + 1, 0)).getUTCDate()
  return {
    periodId: period.id,
    dateFrom: clampToPeriod(isoDate(common.year, common.month + 1, 1), period),
    dateTo: clampToPeriod(isoDate(common.year, common.month + 1, lastDayOfMonth), period),
    pickedHour: dayStartHour(iso) + common.hour,
    selection,
    variable,
  }
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function stationCountLabel(count: number): string {
  if (count === 0) return "sin datos a esta hora"
  return `${count} ${count === 1 ? "estación" : "estaciones"} con dato`
}

function hoursLabel(hours: number): string {
  return `${hours.toLocaleString("es-CO")} h`
}

// «05/02 – 11/02/2024», con el año del domingo.
function formatWeek(monday: string): string {
  const sunday = addDays(monday, 6)
  const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const start = monday.slice(0, 4) === sunday.slice(0, 4) ? short(monday) : `${short(monday)}/${monday.slice(0, 4)}`
  return `${start} – ${short(sunday)}/${sunday.slice(0, 4)}`
}

function formatDay(hour: number): string {
  return d3.utcFormat("%d/%m/%Y")(hourToDate(hour))
}

function formatInstant(hour: number): string {
  return `${d3.utcFormat("%d/%m/%Y %H:00")(hourToDate(hour))} ${COLOMBIA_TIME_LABEL}`
}
