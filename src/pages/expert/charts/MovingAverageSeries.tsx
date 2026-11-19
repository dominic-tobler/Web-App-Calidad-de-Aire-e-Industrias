import { useEffect, useRef } from "react"
import * as d3 from "d3"
import { exposureHours, icaBands, icaCuts } from "../domain/icaLevels"
import { hourToDate, type SeriesPoint, type StationSeries } from "../data/measurements"
import { variableById, type VariableId } from "../domain/variables"

type MovingAverageSeriesProps = {
  series: StationSeries[]
  colors: Record<string, string>
  variable: VariableId
  startHour: number
  endHour: number
  mapHour: number
  onMapHour: (hour: number) => void
  emptyMessage: string
}

const FONT = "IBM Plex Sans, sans-serif"

export function MovingAverageSeries({
  series,
  colors,
  variable,
  startHour,
  endHour,
  mapHour,
  onMapHour,
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
      const margin = { top: 24, right: 72, bottom: 40, left: 52 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom

      const svg = d3.select(svgElement).attr("width", width).attr("height", height)
      svg.selectAll("*").remove()
      tip.hidden = true
      const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

      const values = series.flatMap((item) => item.points.flatMap((point) => (point.value == null ? [] : [point.value])))
      const bands = icaBands(variable)
      const dataMax = values.length ? (d3.max(values) ?? 1) : 1
      // El eje cubre los datos y, si la primera banda arranca en 0, al menos esa banda completa.
      const startsAtZero = bands[0]?.low === 0
      const contextTop = startsAtZero ? bands[0].high * 1.08 : 0
      const yMax = Math.max(dataMax * 1.05, contextTop, 1)
      const yMin = 0

      const x = d3
        .scaleUtc()
        .domain([hourToDate(startHour), hourToDate(endHour)])
        .range([0, innerWidth])
      const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([innerHeight, 0])
      const yTop = y.domain()[1]

      for (const band of bands) {
        if (band.low >= yTop) continue
        const high = Math.min(band.high, yTop)
        plot
          .append("rect")
          .attr("x", 0)
          .attr("width", innerWidth)
          .attr("y", y(high))
          .attr("height", Math.max(0, y(band.low) - y(high)))
          .attr("fill", band.level.band)
          .append("title")
          .text(`${band.level.label} (ICA ${band.level.ica}): ${formatCut(band.low)}–${formatCut(band.high)} ${meta.unit}`)
        plot
          .append("text")
          .attr("x", innerWidth + 6)
          .attr("y", (y(band.low) + y(high)) / 2)
          .attr("dy", "0.35em")
          .attr("fill", "#555")
          .attr("font-size", 10)
          .attr("font-family", FONT)
          .text(band.level.short)
      }

      const note = icaCuts(variable)?.note
      const firstLow = bands[0]?.low ?? 0
      if (note && firstLow > 0 && firstLow >= yTop) {
        plot
          .append("text")
          .attr("x", innerWidth - 4)
          .attr("y", 12)
          .attr("text-anchor", "end")
          .attr("fill", "#595959")
          .attr("font-size", 11)
          .attr("font-family", FONT)
          .text(`${note}: desde ${formatCut(firstLow)} ${meta.unit}`)
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
        .text(`${meta.label} (${meta.unit}) · media móvil ${exposureHours(variable)} h · bandas ICA`)

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

      // Hora que colorea el mapa: línea fija con etiqueta.
      if (mapHour >= startHour && mapHour <= endHour) {
        const mx = x(hourToDate(mapHour))
        plot
          .append("line")
          .attr("x1", mx)
          .attr("x2", mx)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .attr("stroke", "#1a4dd9")
          .attr("stroke-width", 2)
          .attr("pointer-events", "none")
        const tag = d3.utcFormat("%d/%m %H:00")(hourToDate(mapHour))
        const anchorEnd = mx > innerWidth - 90
        plot
          .append("text")
          .attr("x", anchorEnd ? mx - 4 : mx + 4)
          .attr("y", 12)
          .attr("text-anchor", anchorEnd ? "end" : "start")
          .attr("fill", "#1a4dd9")
          .attr("font-size", 11)
          .attr("font-weight", 600)
          .attr("font-family", FONT)
          .attr("pointer-events", "none")
          .text(`Mapa · ${tag}`)
      }

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

      const hourAt = (px: number) => {
        const hour = Math.round((x.invert(px).getTime() - hourToDate(0).getTime()) / 3_600_000)
        return Math.max(startHour, Math.min(endHour, hour))
      }

      plot
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (event: PointerEvent) => {
          const [px] = d3.pointer(event)
          onMapHour(hourAt(px))
        })
        .on("pointermove", (event: PointerEvent) => {
          const [px] = d3.pointer(event)
          const hour = hourAt(px)
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
            .join("")}<em>Clic: usar esta hora en el mapa</em>`
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
  }, [colors, emptyMessage, endHour, mapHour, onMapHour, series, startHour, variable])

  return (
    <div className="series-plot" ref={wrapRef}>
      <svg ref={svgRef} />
      <div className="chart-tip" ref={tipRef} hidden />
    </div>
  )
}

function formatCut(value: number): string {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 1 })
}

function styleAxis(group: d3.Selection<SVGGElement, unknown, null, undefined>) {
  group.select(".domain").attr("stroke", "#1a1a1a")
  group.selectAll("line").attr("stroke", "#1a1a1a")
  group.selectAll("text").attr("fill", "#1a2420").attr("font-size", 11).attr("font-family", FONT)
}
