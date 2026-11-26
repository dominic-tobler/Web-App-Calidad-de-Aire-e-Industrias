export type IndustryMark = "sancionada" | "seguimiento"

export type MarkerStyle = { mark: IndustryMark }

// Mismos colores. La fábrica ocupa el icono entero: el marco la dejaba demasiado chica.
const SANCTION = "#d9685b"
const WATCH = "#58add9"
const HALO = "#000000"

export const INDUSTRY_ICON_SIZE = 22

// Sancionada = fábrica roja sólida. Seguimiento y trámite = fábrica azul sólida.
export const INDUSTRY_STATUS_STYLE = {
  sancionada: { mark: "sancionada" },
  seguimiento: { mark: "seguimiento" },
  tramite: { mark: "seguimiento" },
} as const satisfies Record<string, MarkerStyle>

// Chimenea alta, dos dientes de sierra y nave ancha. El borde negro la separa del mapa gris.
const FACTORY = "M2.8 21.4V12.6H5.1V3.2H8.2V10.4L11.4 7.6 14.2 10.6 17 7.6 19.6 10.6H21.2V21.4Z"

function factory(color: string) {
  return `<path fill="${color}" stroke="${HALO}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke fill" d="${FACTORY}"/>`
}

function sanctionMark() {
  return factory(SANCTION)
}

function watchMark() {
  return factory(WATCH)
}

export function industryMarkInner(style: MarkerStyle) {
  return style.mark === "sancionada" ? sanctionMark() : watchMark()
}

export function industryMarkerHtml(style: MarkerStyle, size = INDUSTRY_ICON_SIZE) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${industryMarkInner(style)}</svg>`
}
