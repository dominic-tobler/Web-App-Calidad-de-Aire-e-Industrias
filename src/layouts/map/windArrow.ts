import { divIcon } from "leaflet"

const WIND_WAVE_WIDTH = 30
const WIND_WAVE_HEIGHT = 54

// Onda hacia la estación. `fromBearing` es el rumbo de donde vino el viento.
export function windArrowIcon(fromBearing: number) {
  const flow = (fromBearing + 180) % 360
  return divIcon({
    className: "leaflet-div-icon wind-arrow",
    iconSize: [WIND_WAVE_WIDTH, WIND_WAVE_HEIGHT],
    iconAnchor: [WIND_WAVE_WIDTH / 2, WIND_WAVE_HEIGHT / 2],
    html: `<svg viewBox="0 0 36 64" width="${WIND_WAVE_WIDTH}" height="${WIND_WAVE_HEIGHT}" aria-hidden="true" style="transform:rotate(${flow}deg)"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 60C5 49 31 43 18 32C5 21 31 16 18 11" stroke="#ffffff" stroke-width="7"/><path d="M8 17 18 3 28 17" stroke="#ffffff" stroke-width="7"/><path d="M18 60C5 49 31 43 18 32C5 21 31 16 18 11" stroke="#1a4dd9" stroke-width="2.6"/><path d="M8 17 18 3 28 17" stroke="#1a4dd9" stroke-width="2.6"/></g></svg>`,
  })
}
