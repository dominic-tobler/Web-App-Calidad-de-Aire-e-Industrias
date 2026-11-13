import { useEffect, useRef, useState } from "react"
import {
  circleMarker,
  divIcon,
  geoJSON,
  latLngBounds,
  type LatLngBounds,
  layerGroup,
  map as createMap,
  marker,
  polyline,
  tileLayer,
  type LayerGroup,
  type Map as LeafletMap,
  type Path,
} from "leaflet"
import "leaflet/dist/leaflet.css"
import { municipalities } from "../data/municipalities"
import {
  airQualityLevel,
  formatReading,
  pollutantLabel,
  type Pollutant,
} from "../domain/airQuality"
import { formatPlace, statusLabel, type Industry } from "../domain/industry"
import {
  stationStatusLabel,
  stationTitle,
  type Station,
  type StationLink,
} from "../domain/station"

type CundinamarcaMapProps = {
  industries: Industry[]
  stations: Station[]
  selectedStationId: string | null
  links: StationLink[]
  hourLabel: string
  pollutant: Pollutant
  readings: Record<string, number>
  showHourBadge?: boolean
  onSelectStation: (id: string | null) => void
}

const STATUS_FILL = {
  sancionada: "#d6453d",
  seguimiento: "#243830",
  tramite: "#243830",
} as const

const STAR_PATH = "M6 0.7 7.5 4.3 11.3 4.5 8.3 7 9.3 10.8 6 8.8 2.7 10.8 3.7 7 0.7 4.5 4.5 4.3Z"

const ICONS = {
  sancionada: starIcon(STATUS_FILL.sancionada),
  seguimiento: starIcon(STATUS_FILL.seguimiento),
  tramite: starIcon(STATUS_FILL.tramite),
}

export function CundinamarcaMap({
  industries,
  stations,
  selectedStationId,
  links,
  hourLabel,
  pollutant,
  readings,
  showHourBadge = false,
  onSelectStation,
}: CundinamarcaMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const industriesLayerRef = useRef<LayerGroup | null>(null)
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
      zoomAnimation: false,
      fadeAnimation: false,
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
      },
    ).addTo(map)

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
          setMunicipality(formatPlace(name))
        })
        layer.on("mouseout", () => {
          boundaries.resetStyle(layer)
          setMunicipality(null)
        })
      },
    }).addTo(map)

    const bounds = boundaries.getBounds().pad(0)
    for (const station of stations) bounds.extend([station.latitude, station.longitude])
    overviewBoundsRef.current = bounds
    map.createPane("industries")
    map.createPane("station-links")
    map.createPane("stations")
    const industriesPane = map.getPane("industries")
    const linksPane = map.getPane("station-links")
    const stationsPane = map.getPane("stations")
    if (industriesPane) industriesPane.style.zIndex = "410"
    if (linksPane) linksPane.style.zIndex = "420"
    if (stationsPane) stationsPane.style.zIndex = "430"

    industriesLayerRef.current = layerGroup().addTo(map)
    linksLayerRef.current = layerGroup().addTo(map)
    stationsLayerRef.current = layerGroup().addTo(map)
    map.on("click", () => selectStationRef.current(null))
    mapRef.current = map

    const fit = () => {
      if (host.clientWidth < 40 || host.clientHeight < 40 || !bounds.isValid()) return false
      map.invalidateSize()
      map.fitBounds(bounds, {
        paddingTopLeft: [28, 52],
        paddingBottomRight: [28, 96],
      })
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
      observer.disconnect()
      map.remove()
      mapRef.current = null
      industriesLayerRef.current = null
      linksLayerRef.current = null
      stationsLayerRef.current = null
    }
  }, [stations])

  useEffect(() => {
    const layer = industriesLayerRef.current
    if (!layer) return

    layer.clearLayers()
    for (const industry of industries) {
      marker([industry.latitude, industry.longitude], {
        pane: "industries",
        icon: ICONS[industry.status],
        title: formatPlace(industry.municipality),
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
  }, [industries])

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
    const map = mapRef.current
    if (!map) return
    const station = stations.find((item) => item.id === selectedStationId)

    if (station && links.length > 0) {
      const focus = latLngBounds([
        [station.latitude, station.longitude],
        [station.latitude, station.longitude],
      ])
      for (const link of links) {
        focus.extend([link.industry.latitude, link.industry.longitude])
      }
      map.fitBounds(focus, {
        paddingTopLeft: [36, 48],
        paddingBottomRight: [36, 108],
        maxZoom: 15,
        animate: false,
      })
      hadSelectionRef.current = true
      return
    }

    if (hadSelectionRef.current && overviewBoundsRef.current) {
      map.fitBounds(overviewBoundsRef.current, {
        paddingTopLeft: [28, 52],
        paddingBottomRight: [28, 96],
        animate: false,
      })
      hadSelectionRef.current = false
    }
  }, [links, selectedStationId, stations])

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
    const next = map.getZoom() + (direction === "in" ? 1 : -1)
    map.setZoom(next)
  }

  return (
    <div className="map-frame">
      <div
        ref={hostRef}
        className="leaflet-host"
        role="application"
        aria-label="Mapa de Cundinamarca con estaciones de calidad del aire y fuentes de emisión"
      />

      {showHourBadge && <div className="hour-badge">Hora {hourLabel}</div>}

      <div className="map-zoom">
        <button type="button" onClick={() => zoomBy("in")} aria-label="Acercar mapa">
          +
        </button>
        <button type="button" onClick={() => zoomBy("out")} aria-label="Alejar mapa">
          −
        </button>
      </div>

      {municipality && <div className="municipality-label">{municipality}</div>}

      <div className="map-footer">
        <div className="symbol-legend">
          <span>
            <span className="station-dot" /> Estación
          </span>
          <span>
            <StarIcon fill="#243830" /> Seguimiento
          </span>
          <span>
            <StarIcon fill="#d6453d" /> Sancionada
          </span>
        </div>
        <div className="contamination-scale">
          <p>Nivel de contaminación</p>
          <div className="scale-row">
            <span>Bajo</span>
            <div className="scale-bar" />
            <span>Alto</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function isPath(layer: unknown): layer is Path {
  return typeof layer === "object" && layer !== null && "setStyle" in layer
}

function starIcon(fill: string) {
  return divIcon({
    className: "industry-marker",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><path fill="${fill}" stroke="#ffffff" stroke-width="0.6" d="${STAR_PATH}"/></svg>`,
  })
}

function stationTooltipHtml(station: Station, detail: string) {
  const place = station.municipality
    ? escapeHtml(formatPlace(station.municipality))
    : "Municipio sin asignar"
  return `<strong>${escapeHtml(stationTitle(station))}</strong><span>${place}</span><span>${escapeHtml(stationStatusLabel(station))}</span><span>${escapeHtml(detail)}</span>`
}

function readingDetail(pollutant: Pollutant, value: number | undefined): string {
  if (value == null) return "Sin medición a esta hora"
  const level = airQualityLevel(pollutant, value)
  const band = level ? ` · ${level.label}` : ""
  return `${pollutantLabel(pollutant)} ${formatReading(value)}${band}`
}

function tooltipHtml(industry: Industry) {
  const place = escapeHtml(formatPlace(industry.municipality))
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

function StarIcon({ fill }: { fill: string }) {
  return (
    <svg className="star-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path fill={fill} d={STAR_PATH} />
    </svg>
  )
}
