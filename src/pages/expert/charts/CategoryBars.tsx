import { useEffect, useRef } from "react"
import * as d3 from "d3"
import type { CategoryCount } from "../domain/industryGroups"

export type BarGroup = { title: string; counts: CategoryCount[] }

type CategoryBarsProps = {
  groups: BarGroup[]
  axisLabel: string
}

const FONT = "IBM Plex Sans, sans-serif"
const BAR_COLOR = "#1a4dd9"

// Barras horizontales con una escala x compartida entre grupos, para comparar longitudes.
export function CategoryBars({ groups, axisLabel }: CategoryBarsProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const svgElement = svgRef.current
    if (!wrap || !svgElement) return

    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      const svg = d3.select(svgElement).attr("width", width).attr("height", height)
      svg.selectAll("*").remove()
      if (width < 80 || height < 60) return

      // La tarjeta es angosta: las etiquetas ceden ancho a las barras cuando falta espacio.
      const labelWidth = Math.round(Math.min(118, Math.max(76, width * 0.4)))
      const labelChars = Math.max(10, Math.floor(labelWidth / 6.4))
      const right = 34
      const titleHeight = 22
      const groupGap = 12
      const footer = 18
      const rows = groups.reduce((sum, group) => sum + group.counts.length, 0)
      const available = height - footer - groups.length * titleHeight - (groups.length - 1) * groupGap - 8
      const band = Math.max(14, Math.min(34, available / Math.max(1, rows)))
      const maxCount = d3.max(groups.flatMap((group) => group.counts.map((item) => item.count))) ?? 0
      const x = d3
        .scaleLinear()
        .domain([0, Math.max(1, maxCount)])
        .range([0, width - labelWidth - right - 12])

      let cursor = 6
      for (const group of groups) {
        svg
          .append("text")
          .attr("x", 12)
          .attr("y", cursor + 13)
          .attr("font-size", 13)
          .attr("font-weight", 500)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(group.title)
        cursor += titleHeight

        const g = svg.append("g").attr("transform", `translate(${labelWidth + 12},${cursor})`)
        const y = d3
          .scaleBand<string>()
          .domain(group.counts.map((item) => item.label))
          .range([0, band * group.counts.length])
          .padding(0.28)

        g.append("line")
          .attr("x1", 0)
          .attr("x2", 0)
          .attr("y1", 0)
          .attr("y2", y.range()[1])
          .attr("stroke", "#1a1a1a")
          .attr("stroke-width", 1.5)

        const rowsSelection = g
          .selectAll("g.row")
          .data(group.counts)
          .join("g")
          .attr("class", "row")
          .attr("transform", (item) => `translate(0,${y(item.label) ?? 0})`)

        rowsSelection
          .append("text")
          .attr("x", -8)
          .attr("y", y.bandwidth() / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "end")
          .attr("font-size", 12)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text((item) => truncate(item.label, labelChars))
          .append("title")
          .text((item) => item.title ?? item.label)

        rowsSelection
          .append("rect")
          .attr("x", 1)
          .attr("height", y.bandwidth())
          .attr("width", (item) => x(item.count))
          .attr("fill", BAR_COLOR)
          .append("title")
          .text((item) => `${item.title ?? item.label}: ${item.count}`)

        rowsSelection
          .append("text")
          .attr("x", (item) => x(item.count) + 6)
          .attr("y", y.bandwidth() / 2)
          .attr("dy", "0.35em")
          .attr("font-size", 12)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .style("font-variant-numeric", "tabular-nums")
          .text((item) => item.count)

        cursor += y.range()[1] + groupGap
      }

      svg
        .append("text")
        .attr("x", labelWidth + 12 + (width - labelWidth - right - 12) / 2)
        .attr("y", Math.min(height - 4, cursor + 6))
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("font-family", FONT)
        .attr("fill", "#595959")
        .text(axisLabel)
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [axisLabel, groups])

  return (
    <div className="bars-plot" ref={wrapRef}>
      <svg ref={svgRef} />
    </div>
  )
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}
