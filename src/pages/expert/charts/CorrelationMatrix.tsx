import { useEffect, useRef } from "react"
import * as d3 from "d3"
import type { CorrelationResult } from "../data/measurements"
import { variableById } from "../domain/variables"

type CorrelationMatrixProps = {
  result: CorrelationResult | null
  message: string | null
}

const FONT = "IBM Plex Sans, sans-serif"
// Divergente rojo (positiva) – blanco – azul (negativa); no se cruza con la escala de contaminación.
const color = (value: number) => d3.interpolateRdBu((1 - value) / 2)

export function CorrelationMatrix({ result, message }: CorrelationMatrixProps) {
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
      if (width < 80 || height < 80) return

      if (!result || message) {
        svg
          .append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#5c6b64")
          .attr("font-size", 12)
          .attr("font-family", FONT)
          .text(message ?? "Sin datos")
        return
      }

      const count = result.variables.length
      const left = 78
      const top = 30
      const legendWidth = 34
      const cell = Math.max(14, Math.min((width - left - legendWidth - 8) / count, (height - top - 8) / count))
      const plot = svg.append("g").attr("transform", `translate(${left},${top})`)

      result.variables.forEach((id, index) => {
        const meta = variableById(id)
        plot
          .append("text")
          .attr("x", -6)
          .attr("y", index * cell + cell / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "end")
          .attr("font-size", 11)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(meta.label)
        plot
          .append("text")
          .attr("transform", `translate(${index * cell + cell / 2 + 3},-6) rotate(-40)`)
          .attr("text-anchor", "start")
          .attr("font-size", 10.5)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(meta.short)
      })

      const cells = result.variables.flatMap((rowId, row) =>
        result.variables.map((columnId, column) => ({
          row,
          column,
          rowId,
          columnId,
          value: result.r[row][column],
          pairs: result.n[row][column],
        })),
      )

      const groups = plot
        .selectAll("g.cell")
        .data(cells)
        .join("g")
        .attr("class", "cell")
        .attr("transform", (item) => `translate(${item.column * cell},${item.row * cell})`)

      groups
        .append("rect")
        .attr("width", cell)
        .attr("height", cell)
        .attr("fill", (item) => (item.value == null ? "#eceeed" : color(item.value)))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 1)

      if (cell >= 19) {
        groups
          .append("text")
          .attr("x", cell / 2)
          .attr("y", cell / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("font-size", cell >= 32 ? 10 : cell >= 24 ? 8.5 : 7.5)
          .attr("font-family", FONT)
          .attr("pointer-events", "none")
          .attr("fill", (item) => (item.value != null && Math.abs(item.value) > 0.6 ? "#ffffff" : "#1a2420"))
          .text((item) => (item.value == null ? "—" : item.row === item.column ? "1" : formatR(item.value)))
      }

      groups
        .on("pointerenter", function (event: PointerEvent, item) {
          d3.select(this).select("rect").attr("stroke", "#1a2420").attr("stroke-width", 2)
          const rowMeta = variableById(item.rowId)
          const columnMeta = variableById(item.columnId)
          tip.innerHTML = `<strong>${rowMeta.label} × ${columnMeta.label}</strong><span>r = ${
            item.value == null ? "sin datos suficientes" : item.value.toLocaleString("es-CO", { maximumFractionDigits: 3 })
          }</span><span>${item.pairs.toLocaleString("es-CO")} horas con ambos datos</span>`
          tip.hidden = false
          const [px, py] = d3.pointer(event, wrap)
          tip.style.left = `${Math.min(px + 12, width - tip.offsetWidth - 4)}px`
          tip.style.top = `${Math.max(4, py - tip.offsetHeight - 10)}px`
        })
        .on("pointerleave", function () {
          d3.select(this).select("rect").attr("stroke", "#ffffff").attr("stroke-width", 1)
          tip.hidden = true
        })

      // Leyenda vertical de -1 a 1.
      const legendHeight = cell * count
      const legendX = left + cell * count + 14
      const gradientId = "corr-gradient"
      const gradient = svg
        .append("defs")
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", 0)
        .attr("y2", 1)
      d3.range(0, 1.0001, 0.1).forEach((stop) => {
        gradient
          .append("stop")
          .attr("offset", stop)
          .attr("stop-color", color(1 - stop * 2))
      })
      svg
        .append("rect")
        .attr("x", legendX)
        .attr("y", top)
        .attr("width", 10)
        .attr("height", legendHeight)
        .attr("fill", `url(#${gradientId})`)
      const legendScale = d3.scaleLinear().domain([1, -1]).range([top, top + legendHeight])
      for (const tick of [1, 0, -1]) {
        svg
          .append("text")
          .attr("x", legendX + 14)
          .attr("y", legendScale(tick))
          .attr("dy", "0.35em")
          .attr("font-size", 10)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(tick)
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [message, result])

  return (
    <div className="matrix-plot" ref={wrapRef}>
      <svg ref={svgRef} />
      <div className="chart-tip" ref={tipRef} hidden />
    </div>
  )
}

function formatR(value: number): string {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
