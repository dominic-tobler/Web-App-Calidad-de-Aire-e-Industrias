import { useEffect, useRef, useState } from "react"
import {
  circleMarker,
  divIcon,
  geoJSON,
  layerGroup,
  map as createMap,
  marker,
  rectangle,
  tileLayer,
  tooltip,
  type LatLngBounds,
  type LayerGroup,
  type LeafletMouseEvent,
  type Map as LeafletMap,
  type Path,
  type Rectangle,
} from "leaflet"
import "leaflet/dist/leaflet.css"
import { boyacaMunicipalities, municipalities } from "../../../data/municipalities"
import { formatPlace, placeWithDepartment, statusLabel, type Industry } from "../../../domain/industry"
import { stationPlace, stationStatusLabel, stationTitle, type Station } from "../../../domain/station"
import { STAR_PATH, STATUS_FILL } from "../../../layouts/map/industryMarkers"
import { flyZoom, smoothMapOptions } from "../../../layouts/map/smoothMap"
import type { GeoBox } from "../domain/geoBox"


type ExpertMapProps = {
  industries: Industry[]
  stations: Station[]
  selection: GeoBox | null
  selectedStationIds: ReadonlySet<string>
  selectedIndustryIds: ReadonlySet<string>
  stationFill: Record<string, string>
  stationRing: Record<string, string>
  stationDetail: (station: Station) => string
  onSelection: (box: GeoBox | null) => void
}

const BRUSH_COLOR = "#1a4dd9"
const NEUTRAL_FILL = "#ffffff"

const ICONS = {
  sancionada: starIcon(STATUS_FILL.sancionada, false),
  seguimiento: starIcon(STATUS_FILL.seguimiento, false),
  tramite: starIcon(STATUS_FILL.tramite, false),
}

const DIMMED_ICONS = {
  sancionada: starIcon(STATUS_FILL.sancionada, true),
  seguimiento: starIcon(STATUS_FILL.seguimiento, true),
  tramite: starIcon(STATUS_FILL.tramite, true),
}

const HANDLE_ICON = divIcon({ className: "brush-handle", iconSize: [10, 10], iconAnchor: [5, 5] })

export function ExpertMap({
  industries,
  stations,
  selection,
  selectedStationIds,
  selectedIndustryIds,
  stationFill,
  stationRing,
  stationDetail,
  onSelection,
}: ExpertMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const industriesLayerRef = useRef<LayerGroup | null>(null)
  const stationsLayerRef = useRef<LayerGroup | null>(null)
  const brushLayerRef = useRef<LayerGroup | null>(null)
  const draftRef = useRef<Rectangle | null>(null)
  const onSelectionRef = useRef(onSelection)
  const [brushing, setBrushing] = useState(true)
  const [municipality, setMunicipality] = useState<string | null>(null)

  useEffect(() => {
    onSelectionRef.current = onSelection
  }, [onSelection])

  // Monta Leaflet una vez: teselas, municipios y capas vacías.
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
      { attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ", maxZoom: 18, maxNativeZoom: 16 },
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

    for (const [name, zIndex] of [["industries", "410"], ["brush", "415"], ["stations", "430"]] as const) {
      map.createPane(name)
      const pane = map.getPane(name)
      if (pane) pane.style.zIndex = zIndex
    }
    const brushPane = map.getPane("brush")
    if (brushPane) brushPane.style.pointerEvents = "none"

    industriesLayerRef.current = layerGroup().addTo(map)
    brushLayerRef.current = layerGroup().addTo(map)
    stationsLayerRef.current = layerGroup().addTo(map)
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
      observer.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Arrastre del recuadro: con la herramienta activa el mapa no se desplaza.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()
    container.classList.toggle("is-brushing", brushing)
    if (!brushing) {
      map.dragging.enable()
      return
    }
    map.dragging.disable()

    let origin: [number, number] | null = null

    const start = (event: LeafletMouseEvent) => {
      if (event.originalEvent.button !== 0) return
      origin = [event.latlng.lat, event.latlng.lng]
      draftRef.current?.remove()
      draftRef.current = rectangle([origin, origin], {
        pane: "brush",
        color: BRUSH_COLOR,
        weight: 2,
        dashArray: "6 4",
        fillColor: "#3373e5",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map)
    }
    const move = (event: LeafletMouseEvent) => {
      if (!origin || !draftRef.current) return
      draftRef.current.setBounds([origin, [event.latlng.lat, event.latlng.lng]])
    }
    const end = (event: LeafletMouseEvent) => {
      if (!origin) return
      const startPoint = map.latLngToContainerPoint(origin)
      const endPoint = event.containerPoint
      const box = draftRef.current?.getBounds()
      draftRef.current?.remove()
      draftRef.current = null
      origin = null
      // Un clic sin arrastre limpia la selección.
      if (!box || startPoint.distanceTo(endPoint) < 6) {
        onSelectionRef.current(null)
        return
      }
      onSelectionRef.current(toGeoBox(box))
    }

    map.on("mousedown", start)
    map.on("mousemove", move)
    map.on("mouseup", end)
    return () => {
      map.off("mousedown", start)
      map.off("mousemove", move)
      map.off("mouseup", end)
      draftRef.current?.remove()
      draftRef.current = null
    }
  }, [brushing])

  // Recuadro confirmado, asas y contador.
  useEffect(() => {
    const layer = brushLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!selection) return

    const corners: Array<[number, number]> = [
      [selection.north, selection.west],
      [selection.north, selection.east],
      [selection.south, selection.west],
      [selection.south, selection.east],
    ]
    rectangle(
      [
        [selection.south, selection.west],
        [selection.north, selection.east],
      ],
      {
        pane: "brush",
        color: BRUSH_COLOR,
        weight: 2,
        dashArray: "6 4",
        fillColor: "#3373e5",
        fillOpacity: 0.12,
        interactive: false,
      },
    ).addTo(layer)
    for (const corner of corners) {
      marker(corner, { pane: "brush", icon: HANDLE_ICON, interactive: false, keyboard: false }).addTo(layer)
    }
    const stationCount = selectedStationIds.size
    const industryCount = selectedIndustryIds.size
    tooltip({
      permanent: true,
      direction: "top",
      offset: [0, -6],
      className: "brush-counter",
      pane: "tooltipPane",
    })
      .setLatLng([selection.north, (selection.west + selection.east) / 2])
      .setContent(
        `${stationCount} ${stationCount === 1 ? "estación" : "estaciones"} · ${industryCount} ${industryCount === 1 ? "industria seleccionada" : "industrias seleccionadas"}`,
      )
      .addTo(layer)
  }, [selection, selectedIndustryIds, selectedStationIds])

  // Industrias: misma convención de estrellas que la vista común.
  useEffect(() => {
    const layer = industriesLayerRef.current
    if (!layer) return
    layer.clearLayers()
    const dimOthers = selection !== null
    for (const industry of industries) {
      const picked = selectedIndustryIds.has(industry.id)
      marker([industry.latitude, industry.longitude], {
        pane: "industries",
        icon: dimOthers && !picked ? DIMMED_ICONS[industry.status] : ICONS[industry.status],
        keyboard: false,
      })
        .bindTooltip(industryTooltip(industry), {
          direction: "top",
          offset: [0, -8],
          opacity: 1,
          className: "industry-tooltip",
        })
        .addTo(layer)
    }
  }, [industries, selectedIndustryIds, selection])

  // Estaciones: relleno por nivel medio del periodo y anillo con el color de su línea.
  useEffect(() => {
    const layer = stationsLayerRef.current
    if (!layer) return
    layer.clearLayers()
    for (const station of stations) {
      const picked = selectedStationIds.has(station.id)
      const point = circleMarker([station.latitude, station.longitude], {
        pane: "stations",
        radius: picked ? 8 : 6.5,
        color: picked ? (stationRing[station.id] ?? BRUSH_COLOR) : "#1a3c32",
        weight: picked ? 4 : 1.5,
        fillColor: stationFill[station.id] ?? NEUTRAL_FILL,
        fillOpacity: 1,
        bubblingMouseEvents: true,
      })
      point.bindTooltip(
        `<strong>${escapeHtml(stationTitle(station))}</strong><span>${
          escapeHtml(stationPlace(station))
        } · ${escapeHtml(stationStatusLabel(station))}</span><span>${escapeHtml(stationDetail(station))}</span>`,
        { direction: "top", offset: [0, -8], opacity: 1, className: "station-tooltip" },
      )
      point.addTo(layer)
      if (picked) point.bringToFront()
    }
  }, [selectedStationIds, stationDetail, stationFill, stationRing, stations])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (map) flyZoom(map, delta)
  }

  return (
    <div className="map-frame expert-map">
      <div
        ref={hostRef}
        className="leaflet-host"
        role="application"
        aria-label="Mapa de Cundinamarca y del borde con Boyacá, con estaciones e industrias; arrastra para seleccionar"
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
        <button
          type="button"
          className={brushing ? "brush-tool is-active" : "brush-tool"}
          aria-pressed={brushing}
          aria-label={brushing ? "Desactivar selección por recuadro" : "Activar selección por recuadro"}
          title={brushing ? "Selección por recuadro activa (clic para mover el mapa)" : "Seleccionar con recuadro"}
          onClick={() => setBrushing((current) => !current)}
        >
          <span />
        </button>
      </div>

      {municipality && <div className="municipality-label">{municipality}</div>}

      <div className="map-footer">
        <div className="expert-map-notes">
          <p className="brush-hint">
            {brushing
              ? "Arrastra sobre el mapa para seleccionar estaciones e industrias cercanas. Un clic limpia la selección."
              : "Modo desplazamiento. Activa el recuadro para seleccionar."}
          </p>
          <div className="symbol-legend">
            <div className="territory-legend">
              <span>
                <span className="territory-swatch is-cundinamarca" /> Cundinamarca
              </span>
              <span>
                <span className="territory-swatch is-boyaca" /> Boyacá
              </span>
            </div>
            <div className="symbol-row">
              <span>
                <span className="station-dot" /> Estación
              </span>
              <span>
                <StarIcon fill={STATUS_FILL.seguimiento} /> Seguimiento / trámite
              </span>
              <span>
                <StarIcon fill={STATUS_FILL.sancionada} /> Sancionada
              </span>
            </div>
          </div>
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

function toGeoBox(bounds: LatLngBounds): GeoBox {
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
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

function starIcon(fill: string, dimmed: boolean) {
  return divIcon({
    className: dimmed ? "industry-marker is-dimmed" : "industry-marker",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true"><path fill="${fill}" stroke="#ffffff" stroke-width="0.6" d="${STAR_PATH}"/></svg>`,
  })
}

function industryTooltip(industry: Industry) {
  const place = escapeHtml(placeWithDepartment(industry.municipality, industry.department))
  const vereda = industry.vereda ? ` · ${escapeHtml(formatPlace(industry.vereda))}` : ""
  const detail =
    industry.status === "sancionada"
      ? escapeHtml(industry.sanctionReason ?? "Sin razón registrada")
      : `${escapeHtml(industry.sourceRaw || "Fuente sin tipo")} · ${escapeHtml(industry.fuel)}`
  return `<strong>${place}${vereda}</strong><span>${detail}</span><span>${escapeHtml(statusLabel(industry.status))} · Expediente ${industry.expediente}</span>`
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
