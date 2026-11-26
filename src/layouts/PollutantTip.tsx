import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  AIR_QUALITY_LEVELS,
  levelMeaning,
  pollutantInfo,
  type Pollutant,
} from "../domain/airQuality"
import { IndustryIcon } from "./map/IndustryIcon"
import { INDUSTRY_STATUS_STYLE } from "./map/industryMarkers"

export function PollutantTip({ pollutant }: { pollutant: Pollutant }) {
  const info = pollutantInfo(pollutant)
  return (
    <HoverTip label="¿Qué es?" contentKey={pollutant}>
      <strong>
        {info.label}
        <span>{info.plain}</span>
      </strong>
      <p>{info.about}</p>
      <p>{info.effect}</p>
      <p className="pollutant-tip-unit">
        La cifra está en µg/m³: microgramos de este contaminante en cada metro cúbico de aire.
        Mientras más alta, más hay en el aire.
      </p>
    </HoverTip>
  )
}

// Símbolos fijos de la leyenda «Capas del mapa».
export function LayersTip() {
  return (
    <HoverTip label="¿Qué significa?" contentKey="capas">
      <strong>Capas del mapa</strong>
      <ul className="level-tip-list">
        <li>
          <span className="station-dot is-ica" />
          <span>
            <b>Estación.</b> Mide la calidad del aire. El color es el nivel a la hora elegida.
          </span>
        </li>
        <li>
          <IndustryIcon style={INDUSTRY_STATUS_STYLE.sancionada} />
          <span>
            <b>Sancionada.</b> La autoridad ambiental le abrió un proceso sancionatorio por sus
            emisiones al aire: emitir sin permiso o sin cumplirlo, sin los requisitos de ley o por
            encima de los límites de la norma.
          </span>
        </li>
        <li>
          <IndustryIcon style={INDUSTRY_STATUS_STYLE.seguimiento} />
          <span>
            <b>En seguimiento.</b> La autoridad ambiental la vigila y revisa que cumpla, sin un
            proceso sancionatorio abierto.
          </span>
        </li>
        <li>
          <span className="territory-swatch is-cundinamarca" />
          <span>
            <b>Cundinamarca.</b> Municipios del departamento.
          </span>
        </li>
        <li>
          <span className="territory-swatch is-boyaca" />
          <span>
            <b>Boyacá.</b> Ráquira y Chiquinquirá, en el límite con Cundinamarca.
          </span>
        </li>
      </ul>
    </HoverTip>
  )
}

export function LevelTip() {
  return (
    <HoverTip label="¿Qué significa?" contentKey="nivel">
      <strong>Índice de calidad del aire</strong>
      <ul className="level-tip-list">
        {AIR_QUALITY_LEVELS.map((level) => (
          <li key={level.id}>
            <i style={{ background: level.color }} />
            <span>
              <b>
                {level.label} (ICA {level.ica}).
              </b>{" "}
              {levelMeaning(level.id)}
            </span>
          </li>
        ))}
      </ul>
    </HoverTip>
  )
}

function HoverTip({
  label,
  contentKey,
  children,
}: {
  label: string
  contentKey: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const tipId = useId()
  const visible = open || pinned

  function show() {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    setOpen(true)
  }

  function hide() {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 140)
  }

  useLayoutEffect(() => {
    if (!visible) return
    placeBubble(buttonRef.current, bubbleRef.current)
  }, [visible, contentKey])

  useEffect(() => {
    if (!visible) return
    const place = () => placeBubble(buttonRef.current, bubbleRef.current)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [visible])

  useEffect(() => {
    if (!pinned) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(false)
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || bubbleRef.current?.contains(target)) return
      setPinned(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [pinned])

  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  return (
    <span className="pollutant-tip" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={buttonRef}
        type="button"
        className="pollutant-tip-button"
        aria-expanded={visible}
        aria-describedby={visible ? tipId : undefined}
        onClick={() => setPinned((current) => !current)}
        onFocus={show}
        onBlur={hide}
      >
        {label}
      </button>
      {visible &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            className="pollutant-tip-bubble"
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  )
}

function placeBubble(button: HTMLButtonElement | null, bubble: HTMLDivElement | null) {
  if (!button || !bubble) return
  const rect = button.getBoundingClientRect()
  const margin = 8
  const width = bubble.offsetWidth
  const height = bubble.offsetHeight
  let left = rect.left
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
  left = Math.max(margin, left)
  const below = rect.bottom + margin
  const above = rect.top - height - margin
  const top = below + height > window.innerHeight - margin && above > margin ? above : below
  bubble.style.left = `${left}px`
  bubble.style.top = `${top}px`
  bubble.style.visibility = "visible"
}
