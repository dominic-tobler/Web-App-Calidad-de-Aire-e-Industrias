export type MarkerStyle = { fill: string; stroke: string; strokeWidth: number }

// Convención de las industrias en todos los mapas (vista común y experta). El rojo queda
// reservado al ICA de las estaciones. Mismo tamaño para todos los estados; se distinguen
// por relleno: sancionada = fábrica sólida, seguimiento o en trámite = solo el contorno.
export const INDUSTRY_STATUS_STYLE = {
  sancionada: { fill: "#1a2420", stroke: "#ffffff", strokeWidth: 0.65 },
  seguimiento: { fill: "#ffffff", stroke: "#243830", strokeWidth: 1.1 },
  tramite: { fill: "#ffffff", stroke: "#243830", strokeWidth: 1.1 },
} as const satisfies Record<string, MarkerStyle>

// Silueta de fábrica (viewBox 16): chimenea, cubierta en diente de sierra,
// nave lateral y ventanas recortadas con fill-rule="evenodd".
export const FACTORY_PATH =
  "M1.2 14.8V7.1L2.2 6.4V1.15h1.5V5.34L3.9 5.2v1.5l2.8-2v1.5l2.8-2V8.8h5.3v6H1.2zM2.35 10.2h1.4v1.7h-1.4zM4.5 10.2h1.4v1.7H4.5zM6.7 10.2h1.4v1.7H6.7zM11.35 10.5h1.7v1.65h-1.7z"

export function industryMarkerHtml(style: MarkerStyle, size = 18) {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><path fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" fill-rule="evenodd" d="${FACTORY_PATH}"/></svg>`
}
