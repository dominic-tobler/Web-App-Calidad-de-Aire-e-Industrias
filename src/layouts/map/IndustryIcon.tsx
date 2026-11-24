import { FACTORY_PATH, type MarkerStyle } from "./industryMarkers"

// Ícono de industria para leyendas y paneles. Misma silueta y estilo que el marcador del mapa
// (industryMarkerHtml), en tamaño de texto.
export function IndustryIcon({ style, opacity }: { style: MarkerStyle; opacity?: number }) {
  return (
    <svg
      className="industry-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      style={opacity == null ? undefined : { opacity }}
    >
      <path
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        fillRule="evenodd"
        d={FACTORY_PATH}
      />
    </svg>
  )
}
