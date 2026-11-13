import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Pollutant } from "../domain/airQuality"
import type { SourceCategory } from "../domain/industry"
import { daysInMonth, type Year } from "../domain/time"

export type CommonView = "exploracion" | "analisis"
export type AnalysisMode = "dispersion" | "grupos" | "enlaces"

export type CommonState = {
  year: Year
  month: number
  day: number
  hour: number
  pollutant: Pollutant
  source: SourceCategory
  view: CommonView
  analysisMode: AnalysisMode
  mapExpanded: boolean
  playing: boolean
  selectedStationId: string | null
}

type CommonContextValue = {
  state: CommonState
  setYear: (year: Year) => void
  setMonth: (month: number) => void
  setDay: (day: number) => void
  setHour: (hour: number) => void
  setPollutant: (pollutant: Pollutant) => void
  setSource: (source: SourceCategory) => void
  setView: (view: CommonView) => void
  setAnalysisMode: (mode: AnalysisMode) => void
  setMapExpanded: (expanded: boolean) => void
  setPlaying: (playing: boolean) => void
  setSelectedStation: (id: string | null) => void
  shiftMonth: (delta: number) => void
}

const CommonContext = createContext<CommonContextValue | null>(null)

const initialState: CommonState = {
  year: 2024,
  month: 0,
  day: 22,
  hour: 19,
  pollutant: "pm25",
  source: "todos",
  view: "exploracion",
  analysisMode: "dispersion",
  mapExpanded: false,
  playing: false,
  selectedStationId: null,
}

export function CommonStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CommonState>(initialState)

  useEffect(() => {
    if (!state.playing) return
    const timer = window.setInterval(() => {
      setState((current) => ({ ...current, hour: (current.hour + 1) % 24 }))
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
      setHour: (hour) => patch({ hour }),
      setPollutant: (pollutant) => patch({ pollutant }),
      setSource: (source) => patch({ source }),
      setView: (view) => patch({ view }),
      setAnalysisMode: (analysisMode) => patch({ analysisMode }),
      setMapExpanded: (mapExpanded) => patch({ mapExpanded }),
      setPlaying: (playing) => patch({ playing }),
      setSelectedStation: (id) => {
        setState((current) => ({
          ...current,
          selectedStationId: id !== null && current.selectedStationId === id ? null : id,
        }))
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

export function useCommonState(): CommonContextValue {
  const value = useContext(CommonContext)
  if (!value) {
    throw new Error("useCommonState debe usarse dentro de CommonStateProvider")
  }
  return value
}
