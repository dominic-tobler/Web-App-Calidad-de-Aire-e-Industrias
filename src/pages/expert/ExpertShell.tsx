import { useState } from "react"
import { ExpertDashboard } from "./ExpertDashboard"
import { WindRoseDashboard } from "./windrose/WindRoseDashboard"
import "./windrose/windrose.css"

type ExpertView = "series" | "rosas"

const VIEWS: ReadonlyArray<{ id: ExpertView; label: string }> = [
  { id: "series", label: "Serie y correlación" },
  { id: "rosas", label: "Rosas de viento" },
]

// Envuelve la vista experta sin modificarla: un botón cambia entre ella y las rosas de viento.
// Ambas quedan montadas para que cada una conserve sus filtros al volver.
export function ExpertShell() {
  const [view, setView] = useState<ExpertView>("series")
  const [rosesOpened, setRosesOpened] = useState(false)

  function choose(next: ExpertView) {
    if (next === "rosas") setRosesOpened(true)
    setView(next)
  }

  return (
    <div className="expert-shell">
      <div className="view-switch segmented" role="tablist" aria-label="Vista del usuario experto">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={option.id === view}
            className={option.id === view ? "is-selected" : undefined}
            onClick={() => choose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div hidden={view !== "series"}>
        <ExpertDashboard />
      </div>
      {rosesOpened && (
        <div hidden={view !== "rosas"}>
          <WindRoseDashboard />
        </div>
      )}
    </div>
  )
}
