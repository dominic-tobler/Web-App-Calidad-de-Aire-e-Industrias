import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Pollutant } from "../domain/airQuality"
import { hourlySeries, hourlySeriesForStations } from "../data/observations"
import { daysInMonth, type Year } from "../domain/time"

export type CommonView = "exploracion" | "analisis"
export type AnalysisMode = "dispersion" | "grupos" | "enlaces"

export type CommonState = {
  year: Year
  month: number
  day: number
  hour: number
  pollutant: Pollutant
  source: string
  view: CommonView
  analysisMode: AnalysisMode
  mapExpanded: boolean
  playing: boolean
  selectedStationId: string | null
  // Null: promedio de todas las estaciones cuando no hay una elegida.
  // Lista: promedio de esas estaciones, por ejemplo las de un municipio.
  hourlyStationIds: string[] | null
}

type CommonContextValue = {
  state: CommonState
  setYear: (year: Year) => void
  setMonth: (month: number) => void
  setDay: (day: number) => void
  setDate: (year: Year, month: number, day: number) => void
  setHour: (hour: number) => void
  setPollutant: (pollutant: Pollutant) => void
  setSource: (source: string) => void
  setView: (view: CommonView) => void
  setAnalysisMode: (mode: AnalysisMode) => void
  setMapExpanded: (expanded: boolean) => void
  setPlaying: (playing: boolean) => void
  setSelectedStation: (id: string | null) => void
  setHourlyStationIds: (ids: string[] | null) => void
  shiftMonth: (delta: number) => void
}

const CommonContext = createContext<CommonContextValue | null>(null)

// 26 de enero de 2024, 20:00, estación 3 y PM2.5: el viento llega del sur,
// la estación está en nivel muy alto y hay industrias de ese lado.
// Así el mapa, la rosa y la serie se leen sin elegir nada.
const initialState: CommonState = {
  year: 2024,
  month: 0,
  day: 26,
  hour: 20,
  pollutant: "pm25",
  source: "todos",
  view: "exploracion",
  analysisMode: "dispersion",
  mapExpanded: false,
  playing: false,
  selectedStationId: "3",
  hourlyStationIds: null,
}

export function CommonStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CommonState>(initialState)

  useEffect(() => {
    if (!state.playing) return
    const timer = window.setInterval(() => {
      setState((current) => {
        const hour = nextHourWithReading(current)
        if (hour == null) return { ...current, playing: false }
        return { ...current, hour }
      })
    }, 800)
    return () => window.clearInterval(timer)
  }, [state.playing])

  const value = useMemo<CommonContextValue>(() => {
    const patch = (partial: Partial<CommonState>) => {
      setState((current) => {
        const next = { ...current, ...partial }
        next.day = Math.min(next.day, daysInMonth(next.year, next.month))
        return next
      })
    }

    return {
      state,
      setYear: (year) => patch({ year }),
      setMonth: (month) => patch({ month }),
      setDay: (day) => patch({ day }),
      setDate: (year, month, day) => patch({ year, month, day }),
      setHour: (hour) => patch({ hour }),
      setPollutant: (pollutant) => patch({ pollutant }),
      setSource: (source) => patch({ source }),
      setView: (view) => patch({ view }),
      setAnalysisMode: (analysisMode) => patch({ analysisMode }),
      setMapExpanded: (mapExpanded) => patch({ mapExpanded }),
      setPlaying: (playing) => {
        setState((current) => {
          if (!playing) return { ...current, playing: false }
          if (readingAtState(current) != null) return { ...current, playing: true }
          const hour = nextHourWithReading(current)
          if (hour == null) return current
          return { ...current, playing: true, hour }
        })
      },
      setSelectedStation: (id) => {
        setState((current) => ({
          ...current,
          selectedStationId: id !== null && current.selectedStationId === id ? null : id,
        }))
      },
      setHourlyStationIds: (ids) => {
        setState((current) => {
          const next = ids ? [...ids] : null
          if (sameStationIds(current.hourlyStationIds, next)) return current
          return { ...current, hourlyStationIds: next }
        })
      },
      shiftMonth: (delta) => {
        setState((current) => {
          const cursor = current.year * 12 + current.month + delta
          const min = 2024 * 12
          const max = 2025 * 12 + 11
          if (cursor < min || cursor > max) return current
          const year = Math.floor(cursor / 12) as Year
          const month = cursor % 12
          return {
            ...current,
            year,
            month,
            day: Math.min(current.day, daysInMonth(year, month)),
          }
        })
      },
    }
  }, [state])

  return <CommonContext.Provider value={value}>{children}</CommonContext.Provider>
}

function readingAtState(current: CommonState): number | null {
  return seriesFor(current)[current.hour] ?? null
}

// La siguiente hora del mismo día que sí tiene medición. Null si no hay otra.
function nextHourWithReading(current: CommonState): number | null {
  const series = seriesFor(current)
  for (let step = 1; step < 24; step += 1) {
    const hour = (current.hour + step) % 24
    if (series[hour] != null) return hour
  }
  return null
}

// Estación elegida, o el promedio de las estaciones indicadas (un municipio),
// o el promedio de todas si no hay ninguna lista.
function seriesFor(current: CommonState): Array<number | null> {
  if (current.selectedStationId) {
    return hourlySeries(
      current.pollutant,
      current.year,
      current.month,
      current.day,
      current.selectedStationId,
    )
  }
  return hourlySeriesForStations(
    current.pollutant,
    current.year,
    current.month,
    current.day,
    current.hourlyStationIds,
  )
}

function sameStationIds(left: string[] | null, right: string[] | null): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

export function useCommonState(): CommonContextValue {
  const value = useContext(CommonContext)
  if (!value) {
    throw new Error("useCommonState debe usarse dentro de CommonStateProvider")
  }
  return value
}
