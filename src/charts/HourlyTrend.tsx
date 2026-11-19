import { useEffect, useRef } from "react"
import * as d3 from "d3"
import {
  AIR_QUALITY_LEVELS,
  THRESHOLDS,
  airQualityLevel,
  pollutantLabel,
  type Pollutant,
} from "../domain/airQuality"
import { formatCompactInstant, formatHour } from "../domain/time"

type HourPoint = {
  hour: number
  value: number | null
}

// Mismos fondos suaves que la serie del usuario experto, en el orden de AIR_QUALITY_LEVELS.
const BAND_FILLS = ["#d1ebd1", "#fffab8", "#fad4bd", "#f7b8b8", "#dbc2e5"]

type HourlyTrendProps = {
  year: number
  month: number
  day: number
  hour: number
  pollutant: Pollutant
  series: Array<number | null>
  seriesLabel: string
  onHour: (hour: number) => void
}

export function HourlyTrend({
  year,
  month,
  day,
  hour,
  pollutant,
  series,
  seriesLabel,
  onHour,
}: HourlyTrendProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const selected = series[hour] ?? null

  useEffect(() => {
    const wrap = wrapRef.current
    const svgElement = svgRef.current
    if (!wrap || !svgElement) return

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      if (width < 40 || height < 40) return

      const cuts = THRESHOLDS[pollutant]
      const showLabels = cuts != null && width >= 280
      const margin = { top: 10, right: showLabels ? 68 : 12, bottom: 28, left: 42 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom
      if (innerWidth < 20 || innerHeight < 20) return
      const svg = d3.select(svgElement)
      svg.attr("width", width).attr("height", height)
      svg.selectAll("*").remove()

      const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)
      const points: HourPoint[] = series.map((value, index) => ({ hour: index, value }))
      const present = points.flatMap((point) => (point.value == null ? [] : [point.value]))
      const dataMax = present.length === 0 ? 1 : Math.max(...present, 1)
      // Igual que en la serie del experto: al menos la banda Moderado, para leer el nivel.
      const yMax = cuts ? Math.max(dataMax, cuts[1]) : dataMax

      const xScale = d3.scaleLinear().domain([0, 23]).range([0, innerWidth])
      const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0])

      if (cuts) {
        const yTop = yScale.domain()[1]
        const edges = [0, ...cuts, Number.POSITIVE_INFINITY]
        AIR_QUALITY_LEVELS.forEach((level, index) => {
          const low = edges[index]
          const high = Math.min(edges[index + 1], yTop)
          if (low >= yTop) return
          const bandTop = yScale(high)
          const bandHeight = Math.max(0, yScale(low) - bandTop)
          plot
            .append("rect")
            .attr("x", 0)
            .attr("width", innerWidth)
            .attr("y", bandTop)
            .attr("height", bandHeight)
            .attr("fill", BAND_FILLS[index])
            .attr("pointer-events", "none")
          if (showLabels && bandHeight >= 14) {
            plot
              .append("text")
              .attr("x", innerWidth + 6)
              .attr("y", bandTop + bandHeight / 2)
              .attr("dy", "0.35em")
              .attr("fill", "#666")
              .attr("font-size", 10)
              .attr("font-family", "IBM Plex Sans, sans-serif")
              .attr("pointer-events", "none")
              .text(level.label)
          }
        })
      }

      plot
        .append("g")
        .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerWidth).tickFormat(() => ""))
        .call((group) => group.select(".domain").remove())
        .call((group) => group.selectAll("line").attr("stroke", "#e3e8e5"))

      const axis = d3
        .axisBottom(xScale)
        .tickValues([0, 3, 6, 9, 12, 15, 18, 21, 23])
        .tickFormat((value) => formatHour(Number(value)).slice(0, 2))

      plot
        .append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(axis)
        .call((group) => group.select(".domain").attr("stroke", "#d3ddd7"))
        .call((group) =>
          group
            .selectAll("text")
            .attr("fill", "#5c6b64")
            .attr("font-size", 11)
            .attr("font-family", "IBM Plex Sans, sans-serif"),
        )
        .call((group) => group.selectAll("line").attr("stroke", "#d3ddd7"))

      plot
        .append("g")
        .call(d3.axisLeft(yScale).ticks(4).tickFormat((value) => formatAxis(value)))
        .call((group) => group.select(".domain").remove())
        .call((group) => group.selectAll("line").remove())
        .call((group) =>
          group
            .selectAll("text")
            .attr("fill", "#5c6b64")
            .attr("font-size", 11)
            .attr("font-family", "IBM Plex Sans, sans-serif"),
        )

      const line = d3
        .line<HourPoint>()
        .defined((point) => point.value != null)
        .x((point) => xScale(point.hour))
        .y((point) => yScale(point.value ?? 0))

      plot
        .append("path")
        .datum(points)
        .attr("fill", "none")
        .attr("stroke", "#1a3c32")
        .attr("stroke-width", 2)
        .attr("d", line)

      plot
        .selectAll("circle.reading")
        .data(points.filter((point) => point.value != null))
        .join("circle")
        .attr("class", "reading")
        .attr("cx", (point) => xScale(point.hour))
        .attr("cy", (point) => yScale(point.value ?? 0))
        .attr("r", (point) => (point.hour === hour ? 5 : 3.5))
        .attr("fill", (point) => airQualityLevel(pollutant, point.value ?? 0)?.color ?? "#1a3c32")
        .attr("stroke", "#1a3c32")
        .attr("stroke-width", (point) => (point.hour === hour ? 2 : 1))

      plot
        .append("line")
        .attr("x1", xScale(hour))
        .attr("x2", xScale(hour))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#1a3c32")
        .attr("stroke-width", 1.5)
        .attr("pointer-events", "none")

      if (present.length === 0) {
        plot
          .append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#5c6b64")
          .attr("font-size", 12)
          .attr("font-family", "IBM Plex Sans, sans-serif")
          .text("Sin mediciones este día")
      }

      plot
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (event) => {
          const [x] = d3.pointer(event)
          const nextHour = Math.round(xScale.invert(x))
          onHour(Math.max(0, Math.min(23, nextHour)))
        })
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [hour, onHour, pollutant, series])

  return (
    <section className="trend-card" aria-label="Tendencia horaria">
      <header className="trend-header">
        <div>
          <h2>Tendencia horaria</h2>
          <p>
            {formatCompactInstant(year, month, day)} · {pollutantLabel(pollutant)} · {seriesLabel}
          </p>
        </div>
        <p>
          {selected == null
            ? `Sin medición a las ${formatHour(hour)} UTC`
            : `${formatAxis(selected)} a las ${formatHour(hour)} UTC`}
        </p>
      </header>
      <div className="trend-plot" ref={wrapRef}>
        <svg ref={svgRef} />
      </div>
    </section>
  )
}

function formatAxis(value: d3.NumberValue): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return ""
  return number.toLocaleString("es-CO", {
    maximumFractionDigits: number >= 10 ? 0 : 1,
  })
}
