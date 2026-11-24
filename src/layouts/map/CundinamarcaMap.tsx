import { useEffect, useRef, useState } from "react"
import {
  circle,
  circleMarker,
  divIcon,
  geoJSON,
  latLngBounds,
  type LatLngBounds,
  layerGroup,
  map as createMap,
  marker,
  polygon,
  polyline,
  tileLayer,
  type LayerGroup,
  type Map as LeafletMap,
  type Path,
} from "leaflet"
import "leaflet/dist/leaflet.css"
import { boyacaMunicipalities, municipalities } from "../../data/municipalities"
import {
  AIR_QUALITY_LEVELS,
  airQualityLevel,
  formatReading,
  pollutantLabel,
  type Pollutant,
} from "../../domain/airQuality"
import { LevelTip } from "../PollutantTip"

import { formatPlace, placeWithDepartment, statusLabel, type Industry } from "../../domain/industry"
import { destination } from "../../domain/wind"
import {
  stationPlace,
  stationStatusLabel,
  stationTitle,
  type Station,
  type StationLink,
} from "../../domain/station"
import { FACTORY_PATH, STATUS_FILL, industryMarkerHtml } from "./industryMarkers"
import { attachSmoothWheel, flyZoom, glideToBounds, smoothMapOptions } from "./smoothMap"

type CundinamarcaMapProps = {
  industries: Industry[]
  stations: Station[]
  selectedStationId: string | null
  links: StationLink[]
  searchRadiusKm?: number | null
  windBearing?: number | null
  windSpanDeg?: number | null
  hourLabel: string
  pollutant: Pollutant
  readings: Record<string, number>
  showHourBadge?: boolean
  onSelectStation: (id: string | null) => void
}

const ICONS = {
  sancionada: industryIcon(STATUS_FILL.sancionada),
  seguimiento: industryIcon(STATUS_FILL.seguimiento),
  tramite: industryIcon(STATUS_FILL.tramite),
}

export function CundinamarcaMap({
  industries,
  stations,
  selectedStationId,
  links,
  searchRadiusKm = null,
  windBearing = null,
  windSpanDeg = null,
  hourLabel,
  pollutant,
  readings,
  showHourBadge = false,
  onSelectStation,
}: CundinamarcaMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const industriesLayerRef = useRef<LayerGroup | null>(null)
  const radiusLayerRef = useRef<LayerGroup | null>(null)
  const linksLayerRef = useRef<LayerGroup | null>(null)
  const stationsLayerRef = useRef<LayerGroup | null>(null)
  const overviewBoundsRef = useRef<LatLngBounds | null>(null)
  const hadSelectionRef = useRef(false)
  const selectStationRef = useRef(onSelectStation)
  const [municipality, setMunicipality] = useState<string | null>(null)

  useEffect(() => {
    selectStationRef.current = onSelectStation
  }, [onSelectStation])

  useEffect(() => {
    const host = hostRef.current
    if (!host || mapRef.current) return

    const map = createMap(host, {
      zoomControl: false,
      ...smoothMapOptions,
      minZoom: 6,
      maxZoom: 18,
      center: [5, -74.1],
      zoom: 8,
    })

    tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
        maxZoom: 18,
        maxNativeZoom: 16,
        updateWhenZooming: false,
      },
    ).addTo(map)

    const boyaca = geoJSON(boyacaMunicipalities, {
      style: BOYACA_STYLE,
      onEachFeature(feature, layer) {
        const name = feature.properties?.name
        if (!name || !isPath(layer)) return
        layer.on("mouseover", () => {
          layer.setStyle({ fillOpacity: 0.55, weight: 1.8, color: "#6e4a24" })
          setMunicipality(placeWithDepartment(name, feature.properties?.department))
        })
        layer.on("mouseout", () => {
          boyaca.resetStyle(layer)
          setMunicipality(null)
        })
      },
    }).addTo(map)

    const boundaries = geoJSON(municipalities, {
      style: {
        color: "#6e857a",
        weight: 1,
        fillColor: "#1a3c32",
        fillOpacity: 0.12,
      },
      onEachFeature(feature, layer) {
        const name = feature.properties?.name
        if (!name || !isPath(layer)) return
        layer.on("mouseover", () => {
          layer.setStyle({ fillOpacity: 0.28, weight: 1.8, color: "#1a3c32" })
          setMunicipality(placeWithDepartment(name, feature.properties?.department))
        })
        layer.on("mouseout", () => {
          boundaries.resetStyle(layer)
          setMunicipality(null)
        })
      },
    }).addTo(map)

    const bounds = boundaries.getBounds().pad(0)
    bounds.extend(boyaca.getBounds())
    for (const station of stations) bounds.extend([station.latitude, station.longitude])
    overviewBoundsRef.current = bounds
    map.createPane("search-radius")
    map.createPane("industries")
    map.createPane("station-links")
    map.createPane("stations")
    const radiusPane = map.getPane("search-radius")
    const industriesPane = map.getPane("industries")
    const linksPane = map.getPane("station-links")
    const stationsPane = map.getPane("stations")
    if (radiusPane) {
      radiusPane.style.zIndex = "405"
      radiusPane.style.pointerEvents = "none"
    }
    if (industriesPane) industriesPane.style.zIndex = "410"
    if (linksPane) linksPane.style.zIndex = "420"
    if (stationsPane) stationsPane.style.zIndex = "430"

    radiusLayerRef.current = layerGroup().addTo(map)
    industriesLayerRef.current = layerGroup().addTo(map)
    linksLayerRef.current = layerGroup().addTo(map)
    stationsLayerRef.current = layerGroup().addTo(map)
    map.on("click", () => selectStationRef.current(null))
    const detachWheel = attachSmoothWheel(map)
    mapRef.current = map

    const fit = () => {
      if (host.clientWidth < 40 || host.clientHeight < 40 || !bounds.isValid()) return false
      map.invalidateSize()
      map.fitBounds(bounds, overlayPadding(host))
      return true
    }

    let fitted = fit()
    const observer = new ResizeObserver(() => {
      if (!fitted) {
        fitted = fit()
        return
      }
      map.invalidateSize()
    })
    observer.observe(host)

    return () => {
      detachWheel()
      observer.disconnect()
      map.remove()
      mapRef.current = null
      industriesLayerRef.current = null
      radiusLayerRef.current = null
      linksLayerRef.current = null
      stationsLayerRef.current = null
    }
  }, [stations])

  useEffect(() => {
    const layer = industriesLayerRef.current
    if (!layer) return

    layer.clearLayers()
    const linked = new Set(links.map((link) => link.industry.id))
    const dimOutsiders = selectedStationId != null
    for (const industry of industries) {
      marker([industry.latitude, industry.longitude], {
        pane: "industries",
        icon: ICONS[industry.status],
        opacity: dimOutsiders && !linked.has(industry.id) ? 0.28 : 1,
        title: placeWithDepartment(industry.municipality, industry.department),
        keyboard: true,
      })
        .bindTooltip(tooltipHtml(industry), {
          direction: "top",
          offset: [0, -8],
          opacity: 1,
          className: "industry-tooltip",
        })
        .addTo(layer)
    }
  }, [industries, links, selectedStationId])

  useEffect(() => {
    const layer = linksLayerRef.current
    const station = stations.find((item) => item.id === selectedStationId)
    if (!layer) return

    layer.clearLayers()
    if (!station) return

    for (const link of links) {
      polyline(
        [
          [station.latitude, station.longitude],
          [link.industry.latitude, link.industry.longitude],
        ],
        {
          pane: "station-links",
          color: "#1a3c32",
          weight: 2,
          opacity: 0.9,
          interactive: false,
        },
      ).addTo(layer)
    }
  }, [links, selectedStationId, stations])

  useEffect(() => {
    const layer = radiusLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const station = stations.find((item) => item.id === selectedStationId)
    if (!station || searchRadiusKm == null) return

    circle([station.latitude, station.longitude], {
      pane: "search-radius",
      radius: searchRadiusKm * 1000,
      color: "#1a4dd9",
      weight: 1.25,
      dashArray: "4 4",
      fill: false,
      interactive: false,
    }).addTo(layer)

    if (windBearing == null || windSpanDeg == null) return
    const points: Array<[number, number]> = [[station.latitude, station.longitude]]
    for (let step = 0; step <= 10; step += 1) {
      const bearing = windBearing - windSpanDeg / 2 + (windSpanDeg * step) / 10
      points.push(destination(station.latitude, station.longitude, bearing, searchRadiusKm))
    }
    polygon(points, {
      pane: "search-radius",
      color: "#1a4dd9",
      weight: 1.5,
      fillColor: "#1a4dd9",
      fillOpacity: 0.2,
      interactive: false,
    }).addTo(layer)
  }, [searchRadiusKm, selectedStationId, stations, windBearing, windSpanDeg])

  useEffect(() => {
    const map = mapRef.current
    const host = hostRef.current
    if (!map || !host) return
    const station = stations.find((item) => item.id === selectedStationId)
    const padding = overlayPadding(host)

    if (station && searchRadiusKm != null) {
      const north = destination(station.latitude, station.longitude, 0, searchRadiusKm * 1.08)
      const south = destination(station.latitude, station.longitude, 180, searchRadiusKm * 1.08)
      const east = destination(station.latitude, station.longitude, 90, searchRadiusKm * 1.08)
      const west = destination(station.latitude, station.longitude, 270, searchRadiusKm * 1.08)
      glideToBounds(map, latLngBounds([south[0], west[1]], [north[0], east[1]]), {
        ...padding,
        maxZoom: 13,
        duration: 1.2,
      })
      hadSelectionRef.current = true
      return
    }

    if (station && links.length > 0) {
      const focus = latLngBounds([
        [station.latitude, station.longitude],
        [station.latitude, station.longitude],
      ])
      for (const link of links) {
        focus.extend([link.industry.latitude, link.industry.longitude])
      }
      glideToBounds(map, focus, {
        ...padding,
        maxZoom: 15,
        duration: 1.2,
      })
      hadSelectionRef.current = true
      return
    }

    if (hadSelectionRef.current && overviewBoundsRef.current) {
      glideToBounds(map, overviewBoundsRef.current, {
        ...padding,
        duration: 1.15,
      })
      hadSelectionRef.current = false
    }
  }, [links, searchRadiusKm, selectedStationId, stations])

  useEffect(() => {
    const layer = stationsLayerRef.current
    if (!layer) return

    layer.clearLayers()
    for (const station of stations) {
      const selected = station.id === selectedStationId
      const value = readings[station.id]
      const level = value == null ? null : airQualityLevel(pollutant, value)
      const point = circleMarker([station.latitude, station.longitude], {
        pane: "stations",
        radius: selected ? 8 : 6,
        color: "#1a3c32",
        weight: selected ? 3 : 2,
        fillColor: level?.color ?? (selected ? "#1a3c32" : "#ffffff"),
        fillOpacity: 1,
        bubblingMouseEvents: false,
      })
      point.on("click", () => selectStationRef.current(station.id))
      point.bindTooltip(stationTooltipHtml(station, readingDetail(pollutant, value)), {
        direction: "top",
        offset: [0, -8],
        opacity: 1,
        className: "station-tooltip",
      })
      point.addTo(layer)
      if (selected) point.bringToFront()
    }
  }, [pollutant, readings, selectedStationId, stations])

  const zoomBy = (direction: "in" | "out") => {
    const map = mapRef.current
    if (!map) return
    flyZoom(map, direction === "in" ? 1 : -1)
  }

  const frameOverview = () => {
    const map = mapRef.current
    const host = hostRef.current
    const bounds = overviewBoundsRef.current
    if (!map || !host || !bounds?.isValid()) return
    glideToBounds(map, bounds, {
      ...overlayPadding(host),
      duration: 1.15,
    })
    hadSelectionRef.current = false
  }

  return (
    <div className="map-frame">
      <div
        ref={hostRef}
        className="leaflet-host"
        role="application"
        aria-label="Mapa de Cundinamarca y del borde con Boyacá, con estaciones de calidad del aire y fuentes de emisión"
      />

      {showHourBadge && <div className="hour-badge">Hora {hourLabel}</div>}

      <div className="map-zoom">
        <button type="button" onClick={() => zoomBy("in")} aria-label="Acercar mapa">
          +
        </button>
        <button type="button" onClick={() => zoomBy("out")} aria-label="Alejar mapa">
          −
        </button>
        <button type="button" className="map-reframe" onClick={frameOverview} aria-label="Reencuadrar mapa" title="Reencuadrar mapa">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              d="M6 2.5H3.5V5M10 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11"
            />
          </svg>
        </button>
      </div>

      {municipality && <div className="municipality-label">{municipality}</div>}
    </div>
  )
}

export function MapLegend() {
  return (
    <section className="map-legend" aria-label="Leyenda del mapa">
      <div className="legend-block">
        <h2>Capas del mapa</h2>
        <ul className="legend-items">
          <li>
            <span className="territory-swatch is-cundinamarca" />
            Cundinamarca
          </li>
          <li>
            <span className="territory-swatch is-boyaca" />
            Boyacá
          </li>
          <li>
            <span className="station-dot" />
            Estación
          </li>
          <li>
            <IndustryIcon fill={STATUS_FILL.seguimiento} />
            Industria en seguimiento
          </li>
          <li>
            <IndustryIcon fill={STATUS_FILL.sancionada} />
            Industria sancionada
          </li>
        </ul>
      </div>
      <div className="legend-block">
        <h2>Nivel de contaminación</h2>
        <p>
          Una sola escala. En el calendario pinta el promedio del día; en el mapa, la lectura de cada
          estación a la hora elegida. <LevelTip />
        </p>
        <ul className="level-scale" aria-label="Colores del nivel de contaminación">
          {AIR_QUALITY_LEVELS.map((level) => (
            <li key={level.id}>
              <i style={{ background: level.color }} />
              {level.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function overlayPadding(host: HTMLElement) {
  const stage = host.closest<HTMLElement>(".is-map-stage")
  if (!stage) {
    return {
      paddingTopLeft: [28, 52] as [number, number],
      paddingBottomRight: [28, 96] as [number, number],
    }
  }
  const styles = getComputedStyle(stage)
  const px = (name: string, fallback: number) => {
    const value = Number.parseFloat(styles.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    paddingTopLeft: [px("--map-pad-left", 28), px("--map-pad-top", 52)] as [number, number],
    paddingBottomRight: [px("--map-pad-right", 28), px("--map-pad-bottom", 96)] as [number, number],
  }
}

const BOYACA_STYLE = {
  color: "#8a6232",
  weight: 1.25,
  fillColor: "#c4a574",
  fillOpacity: 0.4,
}

function isPath(layer: unknown): layer is Path {
  return typeof layer === "object" && layer !== null && "setStyle" in layer
}

function industryIcon(fill: string) {
  return divIcon({
    className: "industry-marker",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: industryMarkerHtml(fill),
  })
}

function stationTooltipHtml(station: Station, detail: string) {
  const place = escapeHtml(stationPlace(station))
  return `<strong>${escapeHtml(stationTitle(station))}</strong><span>${place}</span><span>${escapeHtml(stationStatusLabel(station))}</span><span>${escapeHtml(detail)}</span>`
}

function readingDetail(pollutant: Pollutant, value: number | undefined): string {
  if (value == null) return "Sin medición a esta hora"
  const level = airQualityLevel(pollutant, value)
  const band = level ? ` · ${level.label}` : ""
  return `${pollutantLabel(pollutant)} ${formatReading(value)}${band}`
}

function tooltipHtml(industry: Industry) {
  const place = escapeHtml(placeWithDepartment(industry.municipality, industry.department))
  const vereda = industry.vereda ? ` · ${escapeHtml(formatPlace(industry.vereda))}` : ""
  const source = escapeHtml(industry.sourceRaw || "Fuente sin tipo")
  const fuel = escapeHtml(industry.fuel)
  const status = escapeHtml(statusLabel(industry.status))
  return `<strong>${place}${vereda}</strong><span>${source}</span><span>${fuel} · ${status}</span><span>Expediente ${industry.expediente}</span>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function IndustryIcon({ fill }: { fill: string }) {
  return (
    <svg className="industry-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill={fill} fillRule="evenodd" d={FACTORY_PATH} />
    </svg>
  )
}
