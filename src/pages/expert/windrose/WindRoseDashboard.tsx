import { useCallback, useEffect, useMemo, useState } from "react"
import { industries } from "../../../data/industries"
import { stations } from "../../../data/stations"
import { haversineKm } from "../../../domain/geo"
import { formatReading } from "../../../domain/airQuality"
import { placeWithDepartment, statusLabel } from "../../../domain/industry"
import { stationPlace, type Station } from "../../../domain/station"
import { loadMeasurements, type MeasurementStore } from "../data/measurements"
import { ICA_LEVELS, icaLevel } from "../domain/icaLevels"
import { WindRoseChart } from "./WindRoseChart"
import { WindRoseMap } from "./WindRoseMap"
import {
  bearingTo,
  CALM_MS,
  computeFan,
  computeRose,
  DAY_PARTS,
  DIRECTION_LABELS,
  hasSeries,
  maxSectorShare,
  monthById,
  monthlyMean,
  MONTH_OPTIONS,
  ROSE_POLLUTANTS,
  SECTOR_DEG,
  windHoursInMonth,
  windStationIds,
  type RosePollutant,
} from "./windRose"
import "../../standard/dashboard.css"
import "../expert.css"
import "./windrose.css"

// Radio del abanico en el mapa.
const FAN_RADIUS_KM = 15
const UPWIND_LIST_LIMIT = 6

type LoadState =
  | { status: "loading" }
  | { status: "ready"; store: MeasurementStore }
  | { status: "error"; message: string }

export function WindRoseDashboard() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [monthId, setMonthId] = useState(MONTH_OPTIONS[0].id)
  const [stationId, setStationId] = useState<string | null>(null)
  const [fanPollutant, setFanPollutant] = useState<RosePollutant>("pm25")

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
  const month = monthById(monthId)

  // Solo aparecen las estaciones que tienen algún dato de viento.
  const windIds = useMemo(() => (store ? windStationIds(store) : new Set<string>()), [store])
  const windStations = useMemo(() => stations.filter((station) => windIds.has(station.id)), [windIds])

  const windHours = useMemo(() => {
    const hours: Record<string, number> = {}
    if (!store) return hours
    for (const station of windStations) hours[station.id] = windHoursInMonth(store, station.id, month)
    return hours
  }, [month, store, windStations])
  const quietStationIds = useMemo(
    () => new Set(windStations.filter((station) => !windHours[station.id]).map((station) => station.id)),
    [windHours, windStations],
  )

  // Estación por defecto: la que más horas de viento tiene en el mes.
  const selectedId =
    stationId && windIds.has(stationId)
      ? stationId
      : ([...windStations].sort((left, right) => (windHours[right.id] ?? 0) - (windHours[left.id] ?? 0))[0]?.id ?? null)
  const selected = windStations.find((station) => station.id === selectedId) ?? null

  const roses = useMemo(() => {
    if (!store || !selectedId) return null
    return ROSE_POLLUTANTS.map((pollutant) =>
      DAY_PARTS.map((part) =>
        hasSeries(store, selectedId, pollutant.id) ? computeRose(store, selectedId, pollutant.id, month, part.id) : null,
      ),
    )
  }, [month, selectedId, store])
  const maxShare = useMemo(() => maxSectorShare(roses?.flat() ?? []), [roses])

  // Si la estación no mide el contaminante elegido, el abanico usa el otro PM.
  const fanVariable: RosePollutant =
    store && selectedId && !hasSeries(store, selectedId, fanPollutant)
      ? fanPollutant === "pm25" ? "pm10" : "pm25"
      : fanPollutant
  const fan = useMemo(
    () => (store && selectedId ? computeFan(store, selectedId, fanVariable, month) : []),
    [fanVariable, month, selectedId, store],
  )
  const fanSectors = useMemo(() => fan.map((item) => item.sector), [fan])

  // Industrias dentro del abanico: a menos del radio y en uno de los 3 sectores.
  const upwind = useMemo(() => {
    if (!selected || fan.length === 0) return []
    return industries
      .map((industry) => {
        const distanceKm = haversineKm(selected.latitude, selected.longitude, industry.latitude, industry.longitude)
        const bearing = bearingTo(selected.latitude, selected.longitude, industry.latitude, industry.longitude)
        const sector = fan.find((item) => angularGap(bearing, item.sector * SECTOR_DEG) <= SECTOR_DEG / 2)
        return { industry, distanceKm, bearing, sector }
      })
      .filter((item) => item.sector && item.distanceKm <= FAN_RADIUS_KM)
      .sort((left, right) => left.distanceKm - right.distanceKm)
  }, [fan, selected])
  const upwindIds = useMemo(() => new Set(upwind.map((item) => item.industry.id)), [upwind])
  const upwindByStatus = useMemo(() => {
    const counts = { seguimiento: 0, tramite: 0, sancionada: 0 }
    for (const item of upwind) counts[item.industry.status] += 1
    return counts
  }, [upwind])

  // Color de las estaciones: nivel ICA de la media mensual del contaminante del abanico.
  const means = useMemo(() => {
    const values: Record<string, number> = {}
    if (!store) return values
    for (const station of windStations) {
      const mean = monthlyMean(store, station.id, fanPollutant, month)
      if (mean != null) values[station.id] = mean
    }
    return values
  }, [fanPollutant, month, store, windStations])
  const stationFill = useMemo(() => {
    const fill: Record<string, string> = {}
    for (const [id, value] of Object.entries(means)) fill[id] = icaLevel(fanPollutant, value)?.color ?? "#c9d3ce"
    return fill
  }, [fanPollutant, means])

  const pollutantLabel = ROSE_POLLUTANTS.find((item) => item.id === fanPollutant)?.label ?? ""
  const stationDetail = useCallback(
    (station: Station) => {
      const hours = windHours[station.id] ?? 0
      const mean = means[station.id]
      const meanText = mean == null ? `sin ${pollutantLabel}` : `${pollutantLabel} medio ${formatReading(mean)} µg/m³`
      return hours ? `${hours} h con viento en el mes · ${meanText}` : "Sin datos de viento este mes"
    },
    [means, pollutantLabel, windHours],
  )

  const emptyMessage =
    load.status === "loading"
      ? "Cargando mediciones…"
      : load.status === "error"
        ? load.message
        : !selected
          ? "Elige una estación"
          : "Sin horas con viento y contaminante"

  return (
    <div className="dashboard expert windrose">
      <header className="dashboard-header expert-header">
        <h1>Calidad del aire en Cundinamarca</h1>
        <p className="header-context">
          Vista experta · Rosas de contaminación · {month.long}
          {selected ? ` · Estación ${selected.id}, ${stationPlace(selected)}` : ""}
        </p>
      </header>

      <div className="expert-layout">
        <section className="range-bar month-bar" aria-label="Mes">
          {[2024, 2025].map((year) => (
            <div className="range-group" key={year}>
              <span>Mes · {year}</span>
              <div className="segmented" role="radiogroup" aria-label={`Meses de ${year}`}>
                {MONTH_OPTIONS.filter((option) => option.year === year).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={option.id === monthId}
                    className={option.id === monthId ? "is-selected" : undefined}
                    onClick={() => setMonthId(option.id)}
                  >
                    {option.short}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="status-filter station-summary" aria-label="Estación seleccionada">
          <span>Estación seleccionada</span>
          {selected ? (
            <p>
              <strong>Estación {selected.id}</strong> · {stationPlace(selected)} ·{" "}
              {windHours[selected.id] ?? 0} h con viento en {month.long}
            </p>
          ) : (
            <p>{load.status === "loading" ? "Cargando…" : "Clic en una estación del mapa"}</p>
          )}
        </section>

        <WindRoseMap
          industries={industries}
          stations={windStations}
          selectedId={selectedId}
          stationFill={stationFill}
          stationDetail={stationDetail}
          quietStationIds={quietStationIds}
          fan={fan}
          fanRadiusKm={FAN_RADIUS_KM}
          upwindIds={upwindIds}
          onSelect={setStationId}
        />

        <section className="chart-card roses-card" aria-label="Rosas de contaminación">
          <header className="chart-header">
            <h2>Rosas de contaminación</h2>
            <span className="chart-note">
              % de horas del mes según la dirección desde donde llega el viento · hora local (UTC−5)
            </span>
          </header>
          <div className="roses-body">
            <div className="roses-grid">
              <span />
              {DAY_PARTS.map((part) => (
                <span className="roses-col" key={part.id}>
                  {part.label} <em>{part.hours}</em>
                </span>
              ))}
              {ROSE_POLLUTANTS.map((pollutant, row) => (
                <RoseRow
                  key={pollutant.id}
                  label={pollutant.label}
                  cells={DAY_PARTS.map((part, column) => ({
                    key: `${pollutant.id}-${part.id}`,
                    data: roses?.[row][column] ?? null,
                    empty:
                      store && selectedId && !hasSeries(store, selectedId, pollutant.id)
                        ? `Esta estación no mide ${pollutant.label}`
                        : emptyMessage,
                  }))}
                  maxShare={maxShare}
                  fanSectors={fanSectors}
                />
              ))}
            </div>

            <aside className="roses-side">
              <div className="side-block">
                <h3>Nivel ICA de la hora</h3>
                <ul className="ica-list">
                  {ICA_LEVELS.map((level) => (
                    <li key={level.id}>
                      <i style={{ background: level.color }} />
                      {level.label}
                    </li>
                  ))}
                </ul>
                <p className="side-note">
                  Centro = % de horas en calma (viento &lt; {CALM_MS.toLocaleString("es-CO")} m/s). Cortes ICA de 24 h
                  aplicados a valores horarios.
                </p>
              </div>

              <div className="side-block">
                <h3>Abanico en el mapa</h3>
                <div className="segmented compact" role="radiogroup" aria-label="Contaminante del abanico">
                  {ROSE_POLLUTANTS.map((pollutant) => (
                    <button
                      key={pollutant.id}
                      type="button"
                      role="radio"
                      aria-checked={pollutant.id === fanPollutant}
                      className={pollutant.id === fanPollutant ? "is-selected" : undefined}
                      onClick={() => setFanPollutant(pollutant.id)}
                    >
                      {pollutant.label}
                    </button>
                  ))}
                </div>
                {fanVariable !== fanPollutant && (
                  <p className="side-note">
                    Esta estación no mide {pollutantLabel}; el abanico usa{" "}
                    {ROSE_POLLUTANTS.find((item) => item.id === fanVariable)?.label}.
                  </p>
                )}
                {fan.length === 0 ? (
                  <p className="side-note">Sin datos de {pollutantLabel} con viento para esta estación y mes.</p>
                ) : (
                  <>
                    <ol className="fan-list">
                      {fan.map((item) => (
                        <li key={item.sector}>
                          <b>{DIRECTION_LABELS[item.sector]}</b>
                          <span>
                            {Math.round(item.share * 100)}% de la carga · {formatReading(item.mean)} µg/m³ medio
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="side-note">
                      Carga = suma de {ROSE_POLLUTANTS.find((item) => item.id === fanVariable)?.label} que llega desde cada dirección (frecuencia × concentración),
                      día y noche juntos. Radio {FAN_RADIUS_KM} km.
                    </p>
                  </>
                )}
              </div>

              {fan.length > 0 && (
                <div className="side-block">
                  <h3>
                    Industrias viento arriba <span className="side-count">{upwind.length}</span>
                  </h3>
                  <p className="side-note">
                    {upwindByStatus.seguimiento} en seguimiento · {upwindByStatus.tramite} en trámite ·{" "}
                    {upwindByStatus.sancionada} sancionadas
                  </p>
                  <ul className="upwind-list">
                    {upwind.slice(0, UPWIND_LIST_LIMIT).map((item) => (
                      <li key={item.industry.id}>
                        <span>
                          <strong>{placeWithDepartment(item.industry.municipality, item.industry.department)}</strong>
                          <em className={`status-${item.industry.status}`}>{statusLabel(item.industry.status)}</em>
                        </span>
                        <span className="upwind-distance">
                          {item.distanceKm.toLocaleString("es-CO", { maximumFractionDigits: 1 })} km ·{" "}
                          {DIRECTION_LABELS[item.sector?.sector ?? 0]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {upwind.length === 0 && <p className="side-note">Ninguna industria dentro del abanico.</p>}
                  {upwind.length > UPWIND_LIST_LIMIT && (
                    <p className="side-note">y {upwind.length - UPWIND_LIST_LIMIT} más (resaltadas en el mapa)</p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </div>
  )
}

type RoseRowProps = {
  label: string
  cells: Array<{ key: string; data: ReturnType<typeof computeRose> | null; empty: string }>
  maxShare: number
  fanSectors: readonly number[]
}

function RoseRow({ label, cells, maxShare, fanSectors }: RoseRowProps) {
  return (
    <>
      <span className="roses-row">{label}</span>
      {cells.map((cell) => (
        <WindRoseChart key={cell.key} data={cell.data} maxShare={maxShare} fanSectors={fanSectors} emptyMessage={cell.empty} />
      ))}
    </>
  )
}

function angularGap(left: number, right: number): number {
  const gap = Math.abs(left - right) % 360
  return gap > 180 ? 360 - gap : gap
}
