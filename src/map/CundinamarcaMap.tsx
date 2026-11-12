import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { municipalities, type MunicipalityFeature } from "../data/municipalities"
import { formatPlace, statusLabel, type Industry } from "../domain/industry"

type CundinamarcaMapProps = {
  industries: Industry[]
  hourLabel: string
  showHourBadge?: boolean
}

const STATUS_FILL = {
  sancionada: "#d6453d",
  seguimiento: "#243830",
  tramite: "#243830",
} as const

export function CundinamarcaMap({
  industries,
  hourLabel,
  showHourBadge = false,
}: CundinamarcaMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const transformRef = useRef(d3.zoomIdentity)
  const industriesRef = useRef(industries)
  const drawIndustriesRef = useRef<() => void>(() => {})
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<{ industry: Industry; x: number; y: number } | null>(null)
  const [municipality, setMunicipality] = useState<string | null>(null)

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement || size.width < 40 || size.height < 40) return

    const svg = d3.select(svgElement)
    svg.selectAll("*").remove()
    transformRef.current = d3.zoomIdentity

    const projection = d3.geoMercator().fitExtent(
      [
        [18, 48],
        [size.width - 52, size.height - 120],
      ],
      municipalities,
    )
    projectionRef.current = projection
    const path = d3.geoPath(projection)

    const root = svg.append("g").attr("class", "map-root")
    root
      .append("g")
      .attr("class", "municipalities")
      .selectAll("path")
      .data(municipalities.features)
      .join("path")
      .attr("d", (feature: MunicipalityFeature) => path(feature) ?? "")
      .attr("fill", "#f7faf8")
      .attr("stroke", "#d3ddd7")
      .attr("stroke-width", 0.8)
      .on("mouseenter", function (_, feature: MunicipalityFeature) {
        d3.select(this).attr("fill", "#e5f0ea")
        setMunicipality(formatPlace(feature.properties.name))
      })
      .on("mouseleave", function () {
        d3.select(this).attr("fill", "#f7faf8")
        setMunicipality(null)
      })

    root.append("g").attr("class", "industries")

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .on("zoom", (event) => {
        transformRef.current = event.transform
        root.attr("transform", event.transform.toString())
        root
          .selectAll(".municipalities path")
          .attr("stroke-width", 0.8 / event.transform.k)
        drawIndustriesRef.current()
      })

    zoomRef.current = zoom
    svg.call(zoom)
    drawIndustriesRef.current()
  }, [size])

  useEffect(() => {
    industriesRef.current = industries
    drawIndustriesRef.current = () => {
      const svgElement = svgRef.current
      const projection = projectionRef.current
      if (!svgElement || !projection) return

      const scale = 1 / transformRef.current.k
      const symbol = d3.symbol<Industry>().type(d3.symbolStar).size(46)
      const layer = d3.select(svgElement).select<SVGGElement>("g.industries")
      if (layer.empty()) return

      layer
        .selectAll<SVGPathElement, Industry>("path")
        .data(industriesRef.current, (industry) => industry.id)
        .join("path")
        .attr("d", symbol)
        .attr("fill", (industry) => STATUS_FILL[industry.status])
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.6)
        .attr("transform", (industry) => {
          const point = projection([industry.longitude, industry.latitude])
          if (!point) return "translate(-100,-100)"
          return `translate(${point[0]},${point[1]}) scale(${scale})`
        })
        .style("cursor", "pointer")
        .on("mouseenter", (event, industry) => {
          const rect = wrapRef.current?.getBoundingClientRect()
          if (!rect) return
          setHover({
            industry,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          })
        })
        .on("mouseleave", () => setHover(null))
    }

    drawIndustriesRef.current()
  }, [industries, size])

  const zoomBy = (factor: number) => {
    const svgElement = svgRef.current
    const zoom = zoomRef.current
    if (!svgElement || !zoom) return
    d3.select(svgElement).transition().duration(180).call(zoom.scaleBy, factor)
  }

  const tooltipLeft = hover ? Math.min(hover.x + 12, Math.max(size.width - 230, 8)) : 0
  const tooltipTop = hover ? Math.max(hover.y - 72, 8) : 0

  return (
    <div className="map-frame" ref={wrapRef}>
      <svg ref={svgRef} role="img" aria-label="Mapa de Cundinamarca con fuentes de emisión">
        <title>Mapa de Cundinamarca</title>
      </svg>

      {showHourBadge && <div className="hour-badge">Hora {hourLabel}</div>}

      <div className="map-zoom">
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Acercar mapa">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Alejar mapa">
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

      {hover && (
        <div className="map-tooltip" style={{ left: tooltipLeft, top: tooltipTop }}>
          <strong>
            {formatPlace(hover.industry.municipality)}
            {hover.industry.vereda ? ` · ${formatPlace(hover.industry.vereda)}` : ""}
          </strong>
          <span>{hover.industry.sourceRaw || "Fuente sin tipo"}</span>
          <span>
            {hover.industry.fuel} · {statusLabel(hover.industry.status)}
          </span>
          <span>Expediente {hover.industry.expediente}</span>
        </div>
      )}
    </div>
  )
}

function StarIcon({ fill }: { fill: string }) {
  return (
    <svg className="star-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path
        fill={fill}
        d="M6 0.7 7.5 4.3 11.3 4.5 8.3 7 9.3 10.8 6 8.8 2.7 10.8 3.7 7 0.7 4.5 4.5 4.3Z"
      />
    </svg>
  )
}
