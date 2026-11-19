import { useEffect, useRef } from "react"
import * as d3 from "d3"
import { AIR_QUALITY_LEVELS, THRESHOLDS } from "../../domain/airQuality"
import { hourToDate, type SeriesPoint, type StationSeries } from "../data/measurements"
import { variableById, type VariableId } from "../domain/variables"

type MovingAverageSeriesProps = {
  series: StationSeries[]
  colors: Record<string, string>
  variable: VariableId
  startHour: number
  endHour: number
  emptyMessage: string
}

// Bandas suaves del boceto, en el orden de AIR_QUALITY_LEVELS.
const BAND_FILLS = ["#d1ebd1", "#fffab8", "#fad4bd", "#f7b8b8", "#dbc2e5"]
const FONT = "IBM Plex Sans, sans-serif"

export function MovingAverageSeries({
  series,
  colors,
  variable,
  startHour,
  endHour,
  emptyMessage,
}: MovingAverageSeriesProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const svgElement = svgRef.current
    const tip = tipRef.current
    if (!wrap || !svgElement || !tip) return
    const meta = variableById(variable)

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      if (width < 60 || height < 60) return
      const margin = { top: 24, right: 64, bottom: 40, left: 52 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom

      const svg = d3.select(svgElement).attr("width", width).attr("height", height)
      svg.selectAll("*").remove()
      tip.hidden = true
      const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

      const values = series.flatMap((item) => item.points.flatMap((point) => (point.value == null ? [] : [point.value])))
      const cuts = meta.pollutant ? THRESHOLDS[meta.pollutant] : null
      const dataMax = values.length ? (d3.max(values) ?? 1) : 1
      const dataMin = values.length ? (d3.min(values) ?? 0) : 0
      // Se muestra al menos la banda Moderado para que el nivel tenga contexto.
      const yMax = cuts ? Math.max(dataMax, cuts[1]) : dataMax
      const yMin = cuts || dataMin >= 0 ? 0 : dataMin

      const x = d3
        .scaleUtc()
        .domain([hourToDate(startHour), hourToDate(endHour)])
        .range([0, innerWidth])
      const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([innerHeight, 0])

      if (cuts) {
        const edges = [0, ...cuts, Number.POSITIVE_INFINITY]
        AIR_QUALITY_LEVELS.forEach((level, index) => {
          const low = edges[index]
          const high = Math.min(edges[index + 1], y.domain()[1])
          if (low >= y.domain()[1]) return
          plot
            .append("rect")
            .attr("x", 0)
            .attr("width", innerWidth)
            .attr("y", y(high))
            .attr("height", Math.max(0, y(low) - y(high)))
            .attr("fill", BAND_FILLS[index])
          plot
            .append("text")
            .attr("x", innerWidth + 6)
            .attr("y", (y(low) + y(high)) / 2)
            .attr("dy", "0.35em")
            .attr("fill", "#666")
            .attr("font-size", 10)
            .attr("font-family", FONT)
            .text(level.label)
        })
      }

      plot
        .append("g")
        .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(() => ""))
        .call((group) => group.select(".domain").remove())
        .call((group) => group.selectAll("line").attr("stroke", "#b3b3b3").attr("stroke-opacity", 0.6))

      const span = endHour - startHour
      const format = span > 24 * 45 ? d3.utcFormat("%d/%m/%y") : span > 24 * 4 ? d3.utcFormat("%d/%m") : d3.utcFormat("%d/%m %Hh")

      plot
        .append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(innerWidth / 90))).tickFormat((value) => format(value as Date)))
        .call(styleAxis)

      plot
        .append("g")
        .call(d3.axisLeft(y).ticks(5))
        .call(styleAxis)

      plot
        .append("text")
        .attr("x", 0)
        .attr("y", -10)
        .attr("fill", "#1a2420")
        .attr("font-size", 11)
        .attr("font-family", FONT)
        .text(`${meta.label} (${meta.unit}) · media móvil 24 h`)

      plot
        .append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 34)
        .attr("text-anchor", "middle")
        .attr("fill", "#595959")
        .attr("font-size", 11)
        .attr("font-family", FONT)
        .text("Hora UTC (rango seleccionado)")

      const line = d3
        .line<SeriesPoint>()
        .defined((point) => point.value != null)
        .x((point) => x(hourToDate(point.hour)))
        .y((point) => y(point.value ?? 0))

      plot
        .append("g")
        .selectAll("path")
        .data(series)
        .join("path")
        .attr("fill", "none")
        .attr("stroke", (item) => colors[item.stationId] ?? "#1a3c32")
        .attr("stroke-width", 1.6)
        .attr("stroke-linejoin", "round")
        .attr("d", (item) => line(item.points))

      if (values.length === 0) {
        plot
          .append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#5c6b64")
          .attr("font-size", 13)
          .attr("font-family", FONT)
          .text(emptyMessage)
        return
      }

      // Lectura al pasar el cursor: valor de cada estación en la hora más cercana.
      const rule = plot
        .append("line")
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#1a2420")
        .attr("stroke-width", 1)
        .attr("visibility", "hidden")
        .attr("pointer-events", "none")

      plot
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .on("pointermove", (event: PointerEvent) => {
          const [px] = d3.pointer(event)
          const date = x.invert(px)
          const hour = Math.round((date.getTime() - hourToDate(0).getTime()) / 3_600_000)
          const offset = hour - startHour
          rule.attr("x1", x(hourToDate(hour))).attr("x2", x(hourToDate(hour))).attr("visibility", "visible")
          const rows = series
            .map((item) => ({ id: item.stationId, value: item.points[offset]?.value ?? null }))
            .sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity))
          tip.innerHTML = `<strong>${d3.utcFormat("%d/%m/%Y %H:00")(hourToDate(hour))} UTC</strong>${rows
            .map(
              (row) =>
                `<span><i style="background:${colors[row.id] ?? "#1a3c32"}"></i>Est. ${row.id}<b>${
                  row.value == null ? "—" : row.value.toLocaleString("es-CO", { maximumFractionDigits: 1 })
                }</b></span>`,
            )
            .join("")}`
          tip.hidden = false
          const left = margin.left + px + 14
          tip.style.left = `${left + tip.offsetWidth > width ? margin.left + px - tip.offsetWidth - 14 : left}px`
          tip.style.top = `${margin.top + 8}px`
        })
        .on("pointerleave", () => {
          rule.attr("visibility", "hidden")
          tip.hidden = true
        })
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [colors, emptyMessage, endHour, series, startHour, variable])

  return (
    <div className="series-plot" ref={wrapRef}>
      <svg ref={svgRef} />
      <div className="chart-tip" ref={tipRef} hidden />
    </div>
  )
}

function styleAxis(group: d3.Selection<SVGGElement, unknown, null, undefined>) {
  group.select(".domain").attr("stroke", "#1a1a1a")
  group.selectAll("line").attr("stroke", "#1a1a1a")
  group.selectAll("text").attr("fill", "#1a2420").attr("font-size", 11).attr("font-family", FONT)
}
