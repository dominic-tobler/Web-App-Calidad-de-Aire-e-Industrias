import { useEffect, useRef } from "react"
import * as d3 from "d3"
import { ICA_LEVELS } from "../domain/icaLevels"
import { DIRECTION_LABELS, MIN_ROSE_HOURS, SECTOR_COUNT, SECTOR_DEG, type RoseData } from "./windRose"

type WindRoseChartProps = {
  data: RoseData | null
  maxShare: number
  fanSectors: readonly number[]
  emptyMessage: string
}

const FONT = "IBM Plex Sans, sans-serif"
const TO_RAD = Math.PI / 180

// Rosa polar apilada: el largo de cada pétalo es el % de horas del mes con viento
// desde ese sector, y cada tramo es el nivel ICA del contaminante en esas horas.
export function WindRoseChart({ data, maxShare, fanSectors, emptyMessage }: WindRoseChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const svgElement = svgRef.current
    const tip = tipRef.current
    if (!wrap || !svgElement || !tip) return

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      const svg = d3.select(svgElement).attr("width", width).attr("height", height)
      svg.selectAll("*").remove()
      tip.hidden = true
      if (width < 60 || height < 60) return

      const outer = Math.max(20, Math.min(width, height) / 2 - 18)
      const inner = outer * 0.16
      const root = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 4})`)

      if (!data || data.total === 0) {
        root
          .append("circle")
          .attr("r", outer)
          .attr("fill", "none")
          .attr("stroke", "#d3ddd7")
          .attr("stroke-dasharray", "3 3")
        root
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", "#5c6b64")
          .attr("font-size", 12)
          .attr("font-family", FONT)
          .text(emptyMessage)
        return
      }

      const radius = d3.scaleLinear().domain([0, Math.max(maxShare, 0.01)]).range([inner, outer])
      const ticks = radius.ticks(3).filter((tick) => tick > 0)

      // Rejilla: anillos de % y radios cada 45°.
      for (const tick of ticks) {
        root
          .append("circle")
          .attr("r", radius(tick))
          .attr("fill", "none")
          .attr("stroke", "#d3ddd7")
          .attr("stroke-width", 0.8)
      }
      for (let angle = 0; angle < 360; angle += 45) {
        root
          .append("line")
          .attr("x1", inner * Math.sin(angle * TO_RAD))
          .attr("y1", -inner * Math.cos(angle * TO_RAD))
          .attr("x2", outer * Math.sin(angle * TO_RAD))
          .attr("y2", -outer * Math.cos(angle * TO_RAD))
          .attr("stroke", "#e3e8e5")
          .attr("stroke-width", 0.8)
      }

      // Sectores del abanico del mapa, como contorno de fondo.
      const fanArc = d3.arc<number>()
        .innerRadius(inner)
        .outerRadius(outer)
        .startAngle((sector) => (sector * SECTOR_DEG - SECTOR_DEG / 2) * TO_RAD)
        .endAngle((sector) => (sector * SECTOR_DEG + SECTOR_DEG / 2) * TO_RAD)
      root
        .append("g")
        .selectAll("path")
        .data(fanSectors)
        .join("path")
        .attr("d", fanArc)
        .attr("fill", "#1a4dd9")
        .attr("fill-opacity", 0.07)
        .attr("stroke", "#1a4dd9")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 2")
        .attr("pointer-events", "none")

      // Pétalos apilados por nivel ICA.
      type Segment = { sector: number; level: number; start: number; end: number }
      const segments: Segment[] = []
      data.counts.forEach((levels, sector) => {
        let cumulative = 0
        levels.forEach((count, level) => {
          if (count === 0) return
          const start = cumulative / data.total
          cumulative += count
          segments.push({ sector, level, start, end: cumulative / data.total })
        })
      })
      const pad = 1.2 * TO_RAD
      const petal = d3.arc<Segment>()
        .innerRadius((item) => radius(item.start))
        .outerRadius((item) => radius(item.end))
        .startAngle((item) => (item.sector * SECTOR_DEG - SECTOR_DEG / 2) * TO_RAD + pad)
        .endAngle((item) => (item.sector * SECTOR_DEG + SECTOR_DEG / 2) * TO_RAD - pad)

      root
        .append("g")
        .selectAll("path")
        .data(segments)
        .join("path")
        .attr("d", petal)
        .attr("fill", (item) => ICA_LEVELS[item.level].color)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.6)

      // Etiquetas de % en el eje N y de los puntos cardinales.
      for (const tick of ticks) {
        root
          .append("text")
          .attr("x", 3)
          .attr("y", -radius(tick) - 2)
          .attr("fill", "#5c6b64")
          .attr("font-size", 9)
          .attr("font-family", FONT)
          .text(`${Math.round(tick * 100)}%`)
      }
      for (const [label, angle] of [["N", 0], ["E", 90], ["S", 180], ["O", 270]] as const) {
        root
          .append("text")
          .attr("x", (outer + 10) * Math.sin(angle * TO_RAD))
          .attr("y", -(outer + 10) * Math.cos(angle * TO_RAD))
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", "#1a2420")
          .attr("font-size", 10)
          .attr("font-weight", 600)
          .attr("font-family", FONT)
          .text(label)
      }

      // Calma en el centro.
      root.append("circle").attr("r", inner).attr("fill", "#ffffff").attr("stroke", "#d3ddd7")
      root
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", "#1a2420")
        .attr("font-size", Math.max(8, Math.min(11, inner * 0.55)))
        .attr("font-family", FONT)
        .text(`${Math.round((data.calm / data.total) * 100)}%`)
        .append("title")
        .text("Horas en calma (viento < 0,5 m/s)")

      // Zonas de lectura por sector para el tooltip.
      const hit = d3.arc<number>()
        .innerRadius(inner)
        .outerRadius(outer)
        .startAngle((sector) => (sector * SECTOR_DEG - SECTOR_DEG / 2) * TO_RAD)
        .endAngle((sector) => (sector * SECTOR_DEG + SECTOR_DEG / 2) * TO_RAD)
      root
        .append("g")
        .selectAll("path")
        .data(d3.range(SECTOR_COUNT))
        .join("path")
        .attr("d", hit)
        .attr("fill", "transparent")
        .on("pointermove", (event: PointerEvent, sector) => {
          const levels = data.counts[sector]
          const hours = d3.sum(levels)
          const share = hours / data.total
          tip.innerHTML = `<strong>Desde el ${DIRECTION_LABELS[sector]} · ${formatShare(share)} de las horas</strong>${
            hours === 0
              ? "<span>Sin horas con viento desde aquí</span>"
              : levels
                  .map((count, level) =>
                    count === 0
                      ? ""
                      : `<span><i style="background:${ICA_LEVELS[level].color}"></i>${ICA_LEVELS[level].label}<b>${count} h</b></span>`,
                  )
                  .join("")
          }`
          tip.hidden = false
          const [px, py] = d3.pointer(event, wrap)
          tip.style.left = `${Math.min(px + 12, width - tip.offsetWidth - 4)}px`
          tip.style.top = `${Math.max(4, Math.min(py + 12, height - tip.offsetHeight - 4))}px`
        })
        .on("pointerleave", () => {
          tip.hidden = true
        })
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [data, emptyMessage, fanSectors, maxShare])

  return (
    <div className="rose-plot" ref={wrapRef}>
      <svg ref={svgRef} />
      {data && data.total > 0 && (
        <span className={data.total < MIN_ROSE_HOURS ? "rose-n is-low" : "rose-n"}>
          n = {data.total} h{data.total < MIN_ROSE_HOURS ? " · pocos datos" : ""}
        </span>
      )}
      <div className="chart-tip" ref={tipRef} hidden />
    </div>
  )
}

function formatShare(value: number): string {
  return `${(value * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`
}
