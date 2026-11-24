import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import * as d3 from "d3"
import {
  AIR_QUALITY_LEVELS,
  THRESHOLDS,
  airQualityLevel,
  type Pollutant,
} from "../domain/airQuality"
import { formatHour } from "../domain/time"

type HourPoint = {
  hour: number
  value: number | null
}

// Mismos fondos suaves que la serie del usuario experto, en el orden de AIR_QUALITY_LEVELS.
const BAND_FILLS = ["#d1ebd1", "#fffab8", "#fad4bd", "#f7b8b8", "#dbc2e5"]

type HourlyTrendProps = {
  hour: number
  pollutant: Pollutant
  series: Array<number | null>
  seriesLabel: string
  playing: boolean
  onHour: (hour: number) => void
  onPlaying: (playing: boolean) => void
}

const FONT = "IBM Plex Sans, sans-serif"
const AXIS_TITLE = "Concentración (µg/m³)"

export function HourlyTrend({
  hour,
  pollutant,
  series,
  seriesLabel,
  playing,
  onHour,
  onPlaying,
}: HourlyTrendProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const plotRef = useRef({ left: 0, width: 0 })
  const draggingRef = useRef(false)
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
      const showLabels = cuts != null && width >= 320
      const margin = { top: 8, right: showLabels ? 68 : 12, bottom: 26, left: 72 }
      const innerWidth = width - margin.left - margin.right
      const innerHeight = height - margin.top - margin.bottom
      if (innerWidth < 20 || innerHeight < 20) return
      const svg = d3.select(svgElement)
      svg.attr("width", width).attr("height", height)
      svg.selectAll("*").remove()

      plotRef.current = { left: margin.left, width: innerWidth }
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
              .attr("font-family", FONT)
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
        .tickValues(width < 460 ? [0, 6, 12, 18, 23] : [0, 3, 6, 9, 12, 15, 18, 21, 23])
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
            .attr("font-family", FONT),
        )
        .call((group) => group.selectAll("line").attr("stroke", "#d3ddd7"))

      plot
        .append("g")
        .call(d3.axisLeft(yScale).ticks(4).tickFormat((value) => formatAxis(value)))
        .call((group) => group.select(".domain").attr("stroke", "#c5d0ca"))
        .call((group) => group.selectAll("line").remove())
        .call((group) =>
          group
            .selectAll("text")
            .attr("fill", "#5c6b64")
            .attr("font-size", 11)
            .attr("font-family", FONT),
        )

      svg
        .append("text")
        .attr("transform", `translate(16,${margin.top + innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .attr("fill", "#5c6b64")
        .attr("font-size", 11)
        .attr("font-weight", 600)
        .attr("font-family", FONT)
        .text(innerHeight < 120 ? "µg/m³" : AXIS_TITLE)

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

      const cursorX = xScale(hour)
      const cursor = plot.append("g").attr("pointer-events", "none")
      cursor
        .append("line")
        .attr("x1", cursorX)
        .attr("x2", cursorX)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#1a3c32")
        .attr("stroke-width", 1.5)

      const badge = formatHour(hour)
      const badgeWidth = 46
      const badgeHeight = 18
      const badgeGap = 8
      const badgeOnLeft = cursorX + badgeGap + badgeWidth > innerWidth - 2
      const badgeX = badgeOnLeft ? cursorX - badgeGap - badgeWidth : cursorX + badgeGap
      const anchorY = selected == null ? innerHeight / 2 : yScale(selected)
      let badgeY = anchorY - badgeHeight - 8
      if (badgeY < 2) badgeY = Math.min(innerHeight - badgeHeight - 2, anchorY + 10)
      cursor
        .append("rect")
        .attr("x", badgeX)
        .attr("y", badgeY)
        .attr("width", badgeWidth)
        .attr("height", badgeHeight)
        .attr("rx", 9)
        .attr("fill", "#1a3c32")
      cursor
        .append("text")
        .attr("x", badgeX + badgeWidth / 2)
        .attr("y", badgeY + badgeHeight / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("fill", "#ffffff")
        .attr("font-size", 11)
        .attr("font-weight", 600)
        .attr("font-family", FONT)
        .text(badge)

      if (present.length === 0) {
        plot
          .append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#5c6b64")
          .attr("font-size", 12)
          .attr("font-family", FONT)
          .text("Sin mediciones este día")
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [hour, pollutant, series])

  function hourFromPointer(event: ReactPointerEvent<HTMLDivElement>): number {
    const wrap = wrapRef.current
    const plot = plotRef.current
    if (!wrap || plot.width <= 0) return hour
    const x = event.clientX - wrap.getBoundingClientRect().left - plot.left
    return Math.max(0, Math.min(23, Math.round((x / plot.width) * 23)))
  }

  function chooseHour(next: number) {
    if (playing) onPlaying(false)
    if (next !== hour) onHour(next)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Si el navegador no captura el puntero, el movimiento sigue llegando al control.
    }
    chooseHour(hourFromPointer(event))
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    chooseHour(hourFromPointer(event))
  }

  function endDrag() {
    draggingRef.current = false
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0
    if (step !== 0) {
      event.preventDefault()
      chooseHour(Math.max(0, Math.min(23, hour + step)))
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      chooseHour(0)
    } else if (event.key === "End") {
      event.preventDefault()
      chooseHour(23)
    }
  }

  return (
    <section className="trend-card" aria-label="Tendencia horaria">
      <header className="trend-header">
        <div className="trend-readout">
          <p className={selected == null ? "trend-value is-empty" : "trend-value"}>
            {selected == null ? (
              "Sin medición"
            ) : (
              <>
                <strong>{formatAxis(selected)}</strong>
                <span>µg/m³</span>
              </>
            )}
          </p>
          <p className="trend-caption">
            {seriesLabel} · {formatHour(hour)}
          </p>
        </div>
        <button
          type="button"
          className="trend-play"
          aria-pressed={playing}
          aria-label={playing ? "Pausar la animación del día" : "Reproducir el día"}
          onClick={() => onPlaying(!playing)}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? "Pausar" : "Reproducir"}
        </button>
      </header>
      <div className="trend-plot" ref={wrapRef}>
        <svg ref={svgRef} aria-hidden="true" />
        <div
          className="trend-scrub"
          role="slider"
          tabIndex={0}
          aria-label="Hora del día. Haz clic o arrastra sobre la gráfica para cambiarla."
          aria-valuemin={0}
          aria-valuemax={23}
          aria-valuenow={hour}
          aria-valuetext={formatHour(hour)}
          aria-orientation="horizontal"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
      </div>
    </section>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path d="M2.2 1.2v9.6L10.6 6 2.2 1.2z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path d="M1.8 1.2h3v9.6h-3zm5.4 0h3v9.6h-3z" fill="currentColor" />
    </svg>
  )
}

function formatAxis(value: d3.NumberValue): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return ""
  return number.toLocaleString("es-CO", {
    maximumFractionDigits: number >= 10 ? 0 : 1,
  })
}
