import { useEffect, useRef } from "react"
import * as d3 from "d3"
import type { CorrelationResult } from "../data/measurements"
import { variableById, type VariableId } from "../domain/variables"

export type CorrelationPanel = {
  title: string
  result: CorrelationResult | null
  // Aviso propio del panel (p. ej. «sin horas con lluvia»); reemplaza la matriz.
  message?: string | null
}

type CorrelationMatrixProps = {
  variables: VariableId[]
  panels: CorrelationPanel[]
  // Aviso general: reemplaza todos los paneles.
  message: string | null
  // Ancho que ocupan las matrices cuando las limita la altura; la tarjeta se ajusta a él
  // y deja el resto de la fila a las barras de industrias.
  onContentWidth?: (width: number) => void
}

const FONT = "IBM Plex Sans, sans-serif"
// Divergente rojo (positiva) – blanco – azul (negativa); no se cruza con la escala de contaminación.
const color = (value: number) => d3.interpolateRdBu((1 - value) / 2)

// Varias matrices lado a lado con las mismas variables: las filas se rotulan solo a la
// izquierda y la leyenda de -1 a 1 es una sola, a la derecha.
export function CorrelationMatrix({ variables, panels, message, onContentWidth }: CorrelationMatrixProps) {
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

      const count = variables.length
      const left = 74
      const titleHeight = 18
      const top = titleHeight + 30
      const legendWidth = 34
      const gap = 16
      const columns = Math.max(1, panels.length || 2)
      const heightCell = Math.max(12, (height - top - 8) / count)
      onContentWidth?.(Math.ceil(left + heightCell * count * columns + gap * (columns - 1) + legendWidth + 8))

      if (message || panels.length === 0) {
        centeredText(svg.append("g"), width / 2, height / 2, message ?? "Sin datos")
        return
      }

      const cell = Math.max(
        12,
        Math.min(
          (width - left - legendWidth - gap * (columns - 1) - 8) / (count * columns),
          (height - top - 8) / count,
        ),
      )
      const side = cell * count
      const panelX = (index: number) => left + index * (side + gap)

      variables.forEach((id, index) => {
        svg
          .append("text")
          .attr("x", left - 6)
          .attr("y", top + index * cell + cell / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "end")
          .attr("font-size", 11)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(variableById(id).label)
      })

      panels.forEach((panel, panelIndex) => {
        const x0 = panelX(panelIndex)
        svg
          .append("text")
          .attr("x", x0 + side / 2)
          .attr("y", 12)
          .attr("text-anchor", "middle")
          .attr("font-size", 12)
          .attr("font-weight", 600)
          .attr("font-family", FONT)
          .attr("fill", "#1a2420")
          .text(panel.title)

        const plot = svg.append("g").attr("transform", `translate(${x0},${top})`)
        variables.forEach((id, index) => {
          plot
            .append("text")
            .attr("transform", `translate(${index * cell + cell / 2 + 3},-6) rotate(-40)`)
            .attr("text-anchor", "start")
            .attr("font-size", 10.5)
            .attr("font-family", FONT)
            .attr("fill", "#1a2420")
            .text(variableById(id).short)
        })

        const result = panel.result
        if (!result || panel.message) {
          plot
            .append("rect")
            .attr("width", side)
            .attr("height", side)
            .attr("rx", 6)
            .attr("fill", "#f3f5f4")
          wrapText(plot, side / 2, side / 2, side - 16, panel.message ?? "Sin datos")
          return
        }

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
            tip.innerHTML = `<strong>${panel.title} · ${rowMeta.label} × ${columnMeta.label}</strong><span>r = ${
              item.value == null ? "sin datos suficientes" : item.value.toLocaleString("es-CO", { maximumFractionDigits: 3 })
            }</span><span>${item.pairs.toLocaleString("es-CO")} horas con ambos datos</span>`
            tip.hidden = false
            const [px, py] = d3.pointer(event, wrap)
            tip.style.left = `${Math.max(4, Math.min(px + 12, width - tip.offsetWidth - 4))}px`
            tip.style.top = `${Math.max(4, py - tip.offsetHeight - 10)}px`
          })
          .on("pointerleave", function () {
            d3.select(this).select("rect").attr("stroke", "#ffffff").attr("stroke-width", 1)
            tip.hidden = true
          })
      })

      // Leyenda vertical de -1 a 1, compartida por los paneles.
      const legendX = panelX(columns - 1) + side + 12
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
        .attr("height", side)
        .attr("fill", `url(#${gradientId})`)
      const legendScale = d3.scaleLinear().domain([1, -1]).range([top, top + side])
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
  }, [message, onContentWidth, panels, variables])

  return (
    <div className="matrix-plot" ref={wrapRef}>
      <svg ref={svgRef} />
      <div className="chart-tip" ref={tipRef} hidden />
    </div>
  )
}

type Group = d3.Selection<SVGGElement, unknown, null, undefined>

function centeredText(parent: Group, x: number, y: number, text: string) {
  parent
    .append("text")
    .attr("x", x)
    .attr("y", y)
    .attr("text-anchor", "middle")
    .attr("fill", "#5c6b64")
    .attr("font-size", 12)
    .attr("font-family", FONT)
    .text(text)
}

// Texto centrado partido en líneas para que quepa dentro de un panel vacío.
function wrapText(parent: Group, x: number, y: number, maxWidth: number, text: string) {
  const perLine = Math.max(10, Math.floor(maxWidth / 6.2))
  const lines: string[] = []
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1]
    if (last && `${last} ${word}`.length <= perLine) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  lines.forEach((line, index) => centeredText(parent, x, y + (index - (lines.length - 1) / 2) * 15, line))
}

function formatR(value: number): string {
  return value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
