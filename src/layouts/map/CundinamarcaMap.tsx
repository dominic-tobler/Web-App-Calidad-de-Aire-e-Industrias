import { useEffect, useRef, useState } from "react"
import {
  circle,
  circleMarker,
  divIcon,
  DomEvent,
  geoJSON,
  type GeoJSON,
  type PathOptions,
  latLngBounds,
  type LatLngBounds,
  layerGroup,
  map as createMap,
  marker,
  polygon,
  tileLayer,
  tooltip,
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
import { ICA_UNCLASSIFIED } from "../../domain/icaLevels"
import { LevelTip } from "../PollutantTip"

import {
  formatPlace,
  industryMunicipalityKey,
  municipalityKey,
  placeWithDepartment,
  statusLabel,
  type Industry,
} from "../../domain/industry"
import { destination, WIND_SECTOR_DEG, WIND_SECTORS, type WindRegion } from "../../domain/wind"
import {
  stationPlace,
  stationStatusLabel,
  stationTitle,
  type Station,
  type StationLink,
} from "../../domain/station"
import { INDUSTRY_ICON_SIZE, INDUSTRY_STATUS_STYLE, industryMarkerHtml, type MarkerStyle } from "./industryMarkers"
import { IndustryIcon } from "./IndustryIcon"
import { attachSmoothWheel, flyZoom, glideToBounds, smoothMapOptions } from "./smoothMap"
import { windArrowIcon } from "./windArrow"

type CundinamarcaMapProps = {
  industries: Industry[]
  stations: Station[]
  selectedStationId: string | null
  links: StationLink[]
  searchRadiusKm?: number | null
  windRegions?: readonly WindRegion[]
  hourLabel: string
  pollutant: Pollutant
  readings: Record<string, number>
  showHourBadge?: boolean
  onSelectStation: (id: string | null) => void
  // Municipio elegido (clave de municipalityKey). Con él, el mapa lo resalta, se acerca y
  // atenúa las industrias de otros municipios.
  selectedMunicipalityKey?: string | null
  onSelectMunicipality?: (municipality: MunicipalityRef | null) => void
}

export type MunicipalityRef = { key: string; name: string; department: string }

const REGION_OPACITY = [0.34, 0.24, 0.16]

const ICONS = {
  sancionada: industryIcon(INDUSTRY_STATUS_STYLE.sancionada),
  seguimiento: industryIcon(INDUSTRY_STATUS_STYLE.seguimiento),
  tramite: industryIcon(INDUSTRY_STATUS_STYLE.tramite),
}

// Opacidad de las industrias que quedan fuera de la zona marcada al elegir una estación.
const OUTSIDER_OPACITY = 0.28

export function CundinamarcaMap({
  industries,
  stations,
  selectedStationId,
  links,
  searchRadiusKm = null,
  windRegions = [],
  hourLabel,
  pollutant,
  readings,
  showHourBadge = false,
  onSelectStation,
  selectedMunicipalityKey = null,
  onSelectMunicipality,
}: CundinamarcaMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const industriesLayerRef = useRef<LayerGroup | null>(null)
  const radiusLayerRef = useRef<LayerGroup | null>(null)
  const stationsLayerRef = useRef<LayerGroup | null>(null)
  const territoryLayersRef = useRef<GeoJSON[]>([])
  const municipalityLayersRef = useRef(new Map<string, Path & { getBounds(): LatLngBounds }>())
  const overviewBoundsRef = useRef<LatLngBounds | null>(null)
  const hadSelectionRef = useRef(false)
  const selectStationRef = useRef(onSelectStation)
  const selectMunicipalityRef = useRef(onSelectMunicipality)
  const selectedMunicipalityRef = useRef(selectedMunicipalityKey)
  const [municipality, setMunicipality] = useState<string | null>(null)

  useEffect(() => {
    selectStationRef.current = onSelectStation
    selectMunicipalityRef.current = onSelectMunicipality
  }, [onSelectStation, onSelectMunicipality])

  useEffect(() => {
    const host = hostRef.current
    if (!host || mapRef.current) return

    const municipalityLayers = municipalityLayersRef.current
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

    const territory = (
      data: typeof municipalities,
      styles: { base: PathOptions; hover: PathOptions; selected: PathOptions },
    ) => {
      const keyOf = (feature?: { properties?: { name?: string; department?: string } }) =>
        municipalityKey(feature?.properties?.department ?? "", feature?.properties?.name ?? "")
      const group: GeoJSON = geoJSON(data, {
        style: (feature) => (keyOf(feature) === selectedMunicipalityRef.current ? styles.selected : styles.base),
        onEachFeature(feature, layer) {
          const name = feature.properties?.name
          if (!name || !isPath(layer)) return
          const key = keyOf(feature)
          const department = feature.properties?.department ?? ""
          municipalityLayers.set(key, layer as Path & { getBounds(): LatLngBounds })
          layer.on("mouseover", () => {
            if (key !== selectedMunicipalityRef.current) layer.setStyle(styles.hover)
            setMunicipality(placeWithDepartment(name, department))
          })
          layer.on("mouseout", () => {
            group.resetStyle(layer)
            setMunicipality(null)
          })
          layer.on("click", (event) => {
            // Sin esto el clic llega al mapa, que lo toma como "quitar la selección".
            DomEvent.stopPropagation(event)
            selectMunicipalityRef.current?.({ key, name, department })
          })
        },
      }).addTo(map)
      territoryLayersRef.current.push(group)
      return group
    }

    const boyaca = territory(boyacaMunicipalities, BOYACA_STYLES)
    const boundaries = territory(municipalities, CUNDINAMARCA_STYLES)

    const bounds = boundaries.getBounds().pad(0)
    bounds.extend(boyaca.getBounds())
    for (const station of stations) bounds.extend([station.latitude, station.longitude])
    overviewBoundsRef.current = bounds
    map.createPane("search-radius")
    map.createPane("industries")
    map.createPane("stations")
    const radiusPane = map.getPane("search-radius")
    const industriesPane = map.getPane("industries")
    const stationsPane = map.getPane("stations")
    if (radiusPane) {
      radiusPane.style.zIndex = "405"
      radiusPane.style.pointerEvents = "none"
    }
    if (industriesPane) industriesPane.style.zIndex = "410"
    if (stationsPane) stationsPane.style.zIndex = "430"

    radiusLayerRef.current = layerGroup().addTo(map)
    industriesLayerRef.current = layerGroup().addTo(map)
    stationsLayerRef.current = layerGroup().addTo(map)
    map.on("click", () => {
      selectStationRef.current(null)
      selectMunicipalityRef.current?.(null)
    })
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
      stationsLayerRef.current = null
      territoryLayersRef.current = []
      municipalityLayers.clear()
    }
  }, [stations])

  // Resalta el municipio elegido. resetStyle vuelve a evaluar el estilo de cada polígono.
  useEffect(() => {
    selectedMunicipalityRef.current = selectedMunicipalityKey
    for (const group of territoryLayersRef.current) group.resetStyle()
    if (selectedMunicipalityKey) municipalityLayersRef.current.get(selectedMunicipalityKey)?.bringToFront()
  }, [selectedMunicipalityKey])

  useEffect(() => {
    const layer = industriesLayerRef.current
    if (!layer) return

    layer.clearLayers()
    const linked = new Set(links.map((link) => link.industry.id))
    const isOutsider = (industry: Industry) => {
      if (selectedStationId != null) return !linked.has(industry.id)
      if (selectedMunicipalityKey != null) return industryMunicipalityKey(industry) !== selectedMunicipalityKey
      return false
    }
    for (const industry of industries) {
      marker([industry.latitude, industry.longitude], {
        pane: "industries",
        icon: ICONS[industry.status],
        opacity: isOutsider(industry) ? OUTSIDER_OPACITY : 1,
        title: placeWithDepartment(industry.municipality, industry.department),
        keyboard: true,
      })
        .bindTooltip(tooltipHtml(industry), {
          direction: "top",
          offset: [0, -13],
          opacity: 1,
          className: "industry-tooltip",
        })
        .addTo(layer)
    }
  }, [industries, links, selectedMunicipalityKey, selectedStationId])

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

    windRegions.forEach((region, rank) => {
      const center = region.sector * WIND_SECTOR_DEG
      const points: Array<[number, number]> = [[station.latitude, station.longitude]]
      for (let step = 0; step <= 8; step += 1) {
        const bearing = center - WIND_SECTOR_DEG / 2 + (WIND_SECTOR_DEG * step) / 8
        points.push(destination(station.latitude, station.longitude, bearing, searchRadiusKm))
      }
      polygon(points, {
        pane: "search-radius",
        color: "#1a4dd9",
        weight: 1.5,
        fillColor: "#1a4dd9",
        fillOpacity: REGION_OPACITY[rank] ?? 0.12,
        interactive: false,
      }).addTo(layer)
      marker(destination(station.latitude, station.longitude, center, searchRadiusKm * 0.4), {
        pane: "search-radius",
        interactive: false,
        keyboard: false,
        icon: windArrowIcon(center),
      }).addTo(layer)
      const share = `${Math.round(region.share * 100)}%`
      tooltip({ permanent: true, direction: "center", className: "fan-label", pane: "tooltipPane" })
        .setLatLng(destination(station.latitude, station.longitude, center, searchRadiusKm * 0.72))
        .setContent(`${rank + 1} · ${WIND_SECTORS[region.sector].short} ${share}`)
        .addTo(layer)
    })
  }, [searchRadiusKm, selectedStationId, stations, windRegions])

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

    const municipalityLayer = selectedMunicipalityKey
      ? municipalityLayersRef.current.get(selectedMunicipalityKey)
      : undefined
    if (!station && municipalityLayer) {
      glideToBounds(map, municipalityLayer.getBounds(), {
        ...padding,
        maxZoom: 12,
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
  }, [links, searchRadiusKm, selectedMunicipalityKey, selectedStationId, stations])

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
        fillColor:
          value == null ? (selected ? "#1a3c32" : "#ffffff") : (level?.color ?? ICA_UNCLASSIFIED),
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

type MapLegendProps = {
  // Solo con una estación elegida: explica el radio, los lados del viento y las industrias atenuadas.
  selection?: { radiusKm: number; hasWind: boolean } | null
  // Con un municipio elegido: explica el resaltado y las industrias atenuadas.
  municipalitySelected?: boolean
}

export function MapLegend({ selection = null, municipalitySelected = false }: MapLegendProps) {
  return (
    <section className="map-legend" aria-label="Leyenda del mapa">
      <div className="legend-block">
        <h2>Calidad del aire (ICA)</h2>
        <p>
          Estaciones: lectura a la hora elegida. Calendario: promedio del día. <LevelTip />
        </p>
        <ul className="level-scale" aria-label="Colores del Índice de calidad del aire">
          {AIR_QUALITY_LEVELS.map((level) => (
            <li key={level.id} title={`${level.label} · ICA ${level.ica}`}>
              <i style={{ background: level.color }} />
              {level.label}
            </li>
          ))}
          <li title="Hay medición, pero el ICA no clasifica este valor">
            <i style={{ background: ICA_UNCLASSIFIED }} />
            Sin categoría ICA
          </li>
          <li title="La estación no midió a esta hora">
            <i className="is-no-reading" />
            Sin medición
          </li>
        </ul>
      </div>
      <div className="legend-block">
        <h2>Capas del mapa</h2>
        <ul className="legend-items">
          <li>
            <span className="station-dot is-ica" />
            Estación
          </li>
          <li>
            <IndustryIcon style={INDUSTRY_STATUS_STYLE.sancionada} />
            Industria sancionada
          </li>
          <li>
            <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} />
            Industria en seguimiento
          </li>
          <li>
            <span className="territory-swatch is-cundinamarca" />
            Cundinamarca
          </li>
          <li>
            <span className="territory-swatch is-boyaca" />
            Boyacá
          </li>
        </ul>
      </div>
      {selection && (
        <div className="legend-block">
          <h2>Estación elegida</h2>
          <ul className="legend-items is-single">
            <li>
              <span className="radius-swatch" />
              Radio de búsqueda de {selection.radiusKm} km
            </li>
            {selection.hasWind && (
              <li>
                <span className="wind-swatch" />
                De dónde vino el viento este día. La onda apunta a la estación. Más intenso, más horas
              </li>
            )}
            <li>
              <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} opacity={OUTSIDER_OPACITY} />
              {selection.hasWind ? "Industria fuera de esos lados" : "Industria fuera del radio"}
            </li>
          </ul>
        </div>
      )}
      {!selection && municipalitySelected && (
        <div className="legend-block">
          <h2>Municipio elegido</h2>
          <ul className="legend-items is-single">
            <li>
              <span className="territory-swatch is-selected" />
              Borde marcado: el municipio elegido
            </li>
            <li>
              <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} opacity={OUTSIDER_OPACITY} />
              Industria de otro municipio
            </li>
          </ul>
        </div>
      )}
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

const CUNDINAMARCA_STYLES: { base: PathOptions; hover: PathOptions; selected: PathOptions } = {
  base: { color: "#6e857a", weight: 1, fillColor: "#1a3c32", fillOpacity: 0.12 },
  hover: { color: "#1a3c32", weight: 1.8, fillColor: "#1a3c32", fillOpacity: 0.28 },
  selected: { color: "#1a3c32", weight: 2.5, fillColor: "#1a3c32", fillOpacity: 0.32 },
}

const BOYACA_STYLES: { base: PathOptions; hover: PathOptions; selected: PathOptions } = {
  base: { color: "#8a6232", weight: 1.25, fillColor: "#c4a574", fillOpacity: 0.4 },
  hover: { color: "#6e4a24", weight: 1.8, fillColor: "#c4a574", fillOpacity: 0.55 },
  selected: { color: "#6e4a24", weight: 2.5, fillColor: "#c4a574", fillOpacity: 0.62 },
}

function isPath(layer: unknown): layer is Path {
  return typeof layer === "object" && layer !== null && "setStyle" in layer
}

function industryIcon(style: MarkerStyle) {
  return divIcon({
    className: "industry-marker",
    iconSize: [INDUSTRY_ICON_SIZE, INDUSTRY_ICON_SIZE],
    iconAnchor: [INDUSTRY_ICON_SIZE / 2, INDUSTRY_ICON_SIZE / 2],
    html: industryMarkerHtml(style, INDUSTRY_ICON_SIZE),
  })
}

function stationTooltipHtml(station: Station, detail: string) {
  const place = escapeHtml(stationPlace(station))
  return `<strong>${escapeHtml(stationTitle(station))}</strong><span>${place}</span><span>${escapeHtml(stationStatusLabel(station))}</span><span>${escapeHtml(detail)}</span>`
}

function readingDetail(pollutant: Pollutant, value: number | undefined): string {
  if (value == null) return "Sin medición a esta hora"
  const level = airQualityLevel(pollutant, value)
  const band = level ? ` · ${level.label}` : " · sin categoría ICA"
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
