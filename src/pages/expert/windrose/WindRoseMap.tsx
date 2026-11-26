import { useEffect, useRef, useState } from "react"
import {
  circle,
  circleMarker,
  divIcon,
  geoJSON,
  latLngBounds,
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
import { boyacaMunicipalities, municipalities } from "../../../data/municipalities"
import { formatPlace, placeWithDepartment, statusLabel, type Industry } from "../../../domain/industry"
import { stationPlace, stationTitle, type Station } from "../../../domain/station"
import { IndustryIcon } from "../../../layouts/map/IndustryIcon"
import {
  INDUSTRY_ICON_SIZE,
  INDUSTRY_STATUS_STYLE,
  industryMarkerHtml,
  type MarkerStyle,
} from "../../../layouts/map/industryMarkers"
import { attachSmoothWheel, flyZoom, smoothMapOptions } from "../../../layouts/map/smoothMap"
import { ICA_LEVELS } from "../domain/icaLevels"
import { DIRECTION_LABELS, SECTOR_DEG, destination, type FanSector } from "./windRose"

type WindRoseMapProps = {
  industries: Industry[]
  stations: Station[]
  selectedId: string | null
  stationFill: Record<string, string>
  stationDetail: (station: Station) => string
  quietStationIds: ReadonlySet<string>
  fan: FanSector[]
  fanRadiusKm: number
  upwindIds: ReadonlySet<string>
  onSelect: (id: string) => void
}

const FAN_COLOR = "#1a4dd9"
const FAN_OPACITY = [0.34, 0.24, 0.16]

const ICONS = {
  sancionada: industryIcon(INDUSTRY_STATUS_STYLE.sancionada, false),
  seguimiento: industryIcon(INDUSTRY_STATUS_STYLE.seguimiento, false),
  tramite: industryIcon(INDUSTRY_STATUS_STYLE.tramite, false),
}
const DIMMED_ICONS = {
  sancionada: industryIcon(INDUSTRY_STATUS_STYLE.sancionada, true),
  seguimiento: industryIcon(INDUSTRY_STATUS_STYLE.seguimiento, true),
  tramite: industryIcon(INDUSTRY_STATUS_STYLE.tramite, true),
}

const BOYACA_STYLE = { color: "#8a6232", weight: 1.25, fillColor: "#c4a574", fillOpacity: 0.4 }

export function WindRoseMap({
  industries,
  stations,
  selectedId,
  stationFill,
  stationDetail,
  quietStationIds,
  fan,
  fanRadiusKm,
  upwindIds,
  onSelect,
}: WindRoseMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const industriesLayerRef = useRef<LayerGroup | null>(null)
  const fanLayerRef = useRef<LayerGroup | null>(null)
  const stationsLayerRef = useRef<LayerGroup | null>(null)
  const onSelectRef = useRef(onSelect)
  const [municipality, setMunicipality] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Monta Leaflet una vez, igual que el mapa de la vista experta.
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
      boxZoom: false,
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
        layer.on("mouseover", () => setMunicipality(placeWithDepartment(name, feature.properties?.department)))
        layer.on("mouseout", () => setMunicipality(null))
      },
    }).addTo(map)

    const boundaries = geoJSON(municipalities, {
      style: { color: "#6e857a", weight: 1, fillColor: "#1a3c32", fillOpacity: 0.12 },
      onEachFeature(feature, layer) {
        const name = feature.properties?.name
        if (!name || !isPath(layer)) return
        layer.on("mouseover", () => {
          layer.setStyle({ fillOpacity: 0.24, weight: 1.6, color: "#1a3c32" })
          setMunicipality(placeWithDepartment(name, feature.properties?.department))
        })
        layer.on("mouseout", () => {
          boundaries.resetStyle(layer)
          setMunicipality(null)
        })
      },
    }).addTo(map)

    for (const [name, zIndex] of [["fan", "405"], ["industries", "410"], ["stations", "430"]] as const) {
      map.createPane(name)
      const pane = map.getPane(name)
      if (pane) pane.style.zIndex = zIndex
    }
    const fanPane = map.getPane("fan")
    if (fanPane) fanPane.style.pointerEvents = "none"

    fanLayerRef.current = layerGroup().addTo(map)
    industriesLayerRef.current = layerGroup().addTo(map)
    stationsLayerRef.current = layerGroup().addTo(map)
    const detachWheel = attachSmoothWheel(map)
    mapRef.current = map

    const bounds = boundaries.getBounds().pad(0)
    bounds.extend(boyaca.getBounds())
    const fit = () => {
      if (host.clientWidth < 40 || host.clientHeight < 40 || !bounds.isValid()) return false
      map.invalidateSize()
      map.fitBounds(bounds, { paddingTopLeft: [16, 16], paddingBottomRight: [16, 96] })
      return true
    }
    let fitted = fit()
    const observer = new ResizeObserver(() => {
      if (!fitted) fitted = fit()
      else map.invalidateSize()
    })
    observer.observe(host)

    return () => {
      detachWheel()
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Al elegir estación, el mapa se acerca al radio del abanico.
  useEffect(() => {
    const map = mapRef.current
    const station = stations.find((item) => item.id === selectedId)
    if (!map || !station) return
    const north = destination(station.latitude, station.longitude, 0, fanRadiusKm * 1.15)
    const south = destination(station.latitude, station.longitude, 180, fanRadiusKm * 1.15)
    const east = destination(station.latitude, station.longitude, 90, fanRadiusKm * 1.15)
    const west = destination(station.latitude, station.longitude, 270, fanRadiusKm * 1.15)
    const focus = latLngBounds([south[0], west[1]], [north[0], east[1]])
    const run = () => {
      if (map.getContainer().clientWidth < 40) return
      map.invalidateSize()
      map.flyToBounds(focus, { paddingTopLeft: [24, 24], paddingBottomRight: [24, 110], duration: 0.6 })
    }
    run()
  }, [fanRadiusKm, selectedId, stations])

  // Abanico: 3 sectores desde donde llega más carga del contaminante.
  useEffect(() => {
    const layer = fanLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const station = stations.find((item) => item.id === selectedId)
    if (!station || fan.length === 0) return

    circle([station.latitude, station.longitude], {
      pane: "fan",
      radius: fanRadiusKm * 1000,
      color: FAN_COLOR,
      weight: 1,
      dashArray: "4 4",
      fill: false,
      interactive: false,
    }).addTo(layer)

    fan.forEach((item, rank) => {
      const center = item.sector * SECTOR_DEG
      const points: Array<[number, number]> = [[station.latitude, station.longitude]]
      for (let step = 0; step <= 8; step += 1) {
        const bearing = center - SECTOR_DEG / 2 + (SECTOR_DEG * step) / 8
        points.push(destination(station.latitude, station.longitude, bearing, fanRadiusKm))
      }
      polygon(points, {
        pane: "fan",
        color: FAN_COLOR,
        weight: 1.5,
        fillColor: FAN_COLOR,
        fillOpacity: FAN_OPACITY[rank] ?? 0.12,
        interactive: false,
      }).addTo(layer)
      tooltip({ permanent: true, direction: "center", className: "fan-label", pane: "tooltipPane" })
        .setLatLng(destination(station.latitude, station.longitude, center, fanRadiusKm * 0.72))
        .setContent(`${rank + 1} · ${DIRECTION_LABELS[item.sector]} ${Math.round(item.share * 100)}%`)
        .addTo(layer)
    })
  }, [fan, fanRadiusKm, selectedId, stations])

  // Industrias: fábrica roja sólida = sancionada; fábrica azul sólida = seguimiento o trámite. Fuera del abanico se atenúan.
  useEffect(() => {
    const layer = industriesLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const dimOthers = selectedId !== null && fan.length > 0
    for (const industry of industries) {
      const upwind = upwindIds.has(industry.id)
      marker([industry.latitude, industry.longitude], {
        pane: "industries",
        icon: dimOthers && !upwind ? DIMMED_ICONS[industry.status] : ICONS[industry.status],
        keyboard: false,
        zIndexOffset: upwind ? 500 : 0,
      })
        .bindTooltip(industryTooltip(industry, upwind), {
          direction: "top",
          offset: [0, -13],
          opacity: 1,
          className: "industry-tooltip",
        })
        .addTo(layer)
    }
  }, [fan.length, industries, selectedId, upwindIds])

  // Estaciones con viento: clic = elegir. Las que no tienen viento en el mes salen tenues.
  useEffect(() => {
    const layer = stationsLayerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const station of stations) {
      const picked = station.id === selectedId
      const quiet = quietStationIds.has(station.id)
      const point = circleMarker([station.latitude, station.longitude], {
        pane: "stations",
        radius: picked ? 10 : 7,
        color: picked ? FAN_COLOR : "#1a3c32",
        weight: picked ? 4 : 1.5,
        opacity: quiet && !picked ? 0.45 : 1,
        fillColor: stationFill[station.id] ?? "#ffffff",
        fillOpacity: quiet && !picked ? 0.35 : 1,
        dashArray: quiet ? "3 2" : undefined,
        bubblingMouseEvents: false,
      })
      point.on("click", () => onSelectRef.current(station.id))
      point.bindTooltip(
        `<strong>${escapeHtml(stationTitle(station))}</strong><span>${escapeHtml(stationPlace(station))}</span><span>${escapeHtml(stationDetail(station))}</span>`,
        { direction: "top", offset: [0, -8], opacity: 1, className: "station-tooltip" },
      )
      point.addTo(layer)
      if (picked) point.bringToFront()
    }
  }, [quietStationIds, selectedId, stationDetail, stationFill, stations])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (map) flyZoom(map, delta)
  }

  return (
    <div className="map-frame expert-map windrose-map">
      <div
        ref={hostRef}
        className="leaflet-host"
        role="application"
        aria-label="Mapa con las estaciones que miden viento; clic en una estación para ver sus rosas"
      />

      <div className="map-tools">
        <div className="map-zoom">
          <button type="button" onClick={() => zoomBy(1)} aria-label="Acercar mapa">
            +
          </button>
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Alejar mapa">
            −
          </button>
        </div>
      </div>

      {municipality && <div className="municipality-label">{municipality}</div>}

      <div className="map-footer">
        <div className="expert-map-notes">
          <p className="brush-hint">
            Clic en una estación. El abanico azul marca las 3 direcciones con más carga del contaminante.
          </p>
          <div className="symbol-legend">
            <div className="symbol-row">
              <span>
                <span className="station-dot" /> Estación con viento
              </span>
              <span>
                <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} /> Seguimiento / trámite
              </span>
              <span>
                <IndustryIcon style={INDUSTRY_STATUS_STYLE.sancionada} /> Sancionada
              </span>
            </div>
          </div>
        </div>
        <div className="contamination-scale ica-legend">
          <p>ICA medio del mes</p>
          <ul>
            {ICA_LEVELS.map((level) => (
              <li key={level.id} title={`${level.label} · ICA ${level.ica}`}>
                <i style={{ background: level.color }} />
                {level.short}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function isPath(layer: unknown): layer is Path {
  return typeof layer === "object" && layer !== null && "setStyle" in layer
}

function industryIcon(style: MarkerStyle, dimmed: boolean) {
  return divIcon({
    className: dimmed ? "industry-marker is-dimmed" : "industry-marker",
    iconSize: [INDUSTRY_ICON_SIZE, INDUSTRY_ICON_SIZE],
    iconAnchor: [INDUSTRY_ICON_SIZE / 2, INDUSTRY_ICON_SIZE / 2],
    html: industryMarkerHtml(style),
  })
}

function industryTooltip(industry: Industry, upwind: boolean) {
  const place = escapeHtml(placeWithDepartment(industry.municipality, industry.department))
  const vereda = industry.vereda ? ` · ${escapeHtml(formatPlace(industry.vereda))}` : ""
  const note = upwind ? "<span>Dentro del abanico (viento arriba)</span>" : ""
  return `<strong>${place}${vereda}</strong><span>${escapeHtml(statusLabel(industry.status))} · Expediente ${industry.expediente}</span>${note}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

