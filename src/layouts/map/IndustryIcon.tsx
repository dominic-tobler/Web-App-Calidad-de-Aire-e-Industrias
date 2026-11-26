import { industryMarkInner, type MarkerStyle } from "./industryMarkers"

// Ícono de industria para leyendas y paneles. Misma marca que el marcador del mapa.
export function IndustryIcon({ style, opacity }: { style: MarkerStyle; opacity?: number }) {
  return (
    <svg
      className="industry-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      style={opacity == null ? undefined : { opacity }}
      dangerouslySetInnerHTML={{ __html: industryMarkInner(style) }}
    />
  )
}
