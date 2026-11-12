import { useEffect, useRef } from "react"
import * as d3 from "d3"
import { pollutantLabel, type Pollutant } from "../domain/airQuality"
import { formatCompactInstant, formatHour } from "../domain/time"

type HourlyTrendProps = {
  year: number
  month: number
  day: number
  hour: number
  pollutant: Pollutant
  onHour: (hour: number) => void
}

const BANDS = [
  { label: "Alto", color: "#f6d0cb" },
  { label: "Medio", color: "#f8e3c4" },
  { label: "Medio", color: "#f3efc8" },
  { label: "Bajo", color: "#d7ebdf" },
]

export function HourlyTrend({
  year,
  month,
  day,
  hour,
  pollutant,
  onHour,
}: HourlyTrendProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const svgElement = svgRef.current
    if (!wrap || !svgElement) return

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      if (width < 40 || height < 40) return

      const margin = { top: 8, right: 12, bottom: 28, left: 46 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom
      const svg = d3.select(svgElement)
      svg.attr("width", width).attr("height", height)
      svg.selectAll("*").remove()

      const plot = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`)

      const bandHeight = innerHeight / BANDS.length
      BANDS.forEach((band, index) => {
        plot
          .append("rect")
          .attr("x", 0)
          .attr("y", index * bandHeight)
          .attr("width", innerWidth)
          .attr("height", bandHeight)
          .attr("fill", band.color)
      })

      const xScale = d3.scaleLinear().domain([0, 23]).range([0, innerWidth])
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

      const yLabels = [
        { label: "Alto", y: 12 },
        { label: "Medio", y: innerHeight / 2 },
        { label: "Bajo", y: innerHeight - 4 },
      ]
      plot
        .selectAll("text.y-label")
        .data(yLabels)
        .join("text")
        .attr("class", "y-label")
        .attr("x", -8)
        .attr("y", (item) => item.y)
        .attr("text-anchor", "end")
        .attr("fill", "#5c6b64")
        .attr("font-size", 11)
        .attr("font-family", "IBM Plex Sans, sans-serif")
        .text((item) => item.label)

      plot
        .append("line")
        .attr("x1", xScale(hour))
        .attr("x2", xScale(hour))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#1a3c32")
        .attr("stroke-width", 1.5)

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
  }, [hour, onHour])

  return (
    <section className="trend-card" aria-label="Tendencia horaria">
      <header className="trend-header">
        <div>
          <h2>Tendencia horaria</h2>
          <p>
            {formatCompactInstant(year, month, day)} · {pollutantLabel(pollutant)}
          </p>
        </div>
        <p>Mapa filtrado a las {formatHour(hour)}</p>
      </header>
      <div className="trend-plot" ref={wrapRef}>
        <svg ref={svgRef} />
      </div>
    </section>
  )
}
