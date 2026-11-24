import { Link } from "react-router-dom"
import "./viewNav.css"

export type DashboardView = "estandar" | "experta"

export const ROUTES = {
  inicio: "/",
  estandar: "/estandar",
  experta: "/experta",
} as const

const VIEW_LABELS: Record<DashboardView, string> = {
  estandar: "Estándar",
  experta: "Experta",
}

type ViewNavProps = {
  current: DashboardView
  /** Se llama justo antes de ir a la otra vista, p. ej. para pasarle la fecha y la hora. */
  onLeave?: (target: DashboardView) => void
  className?: string
}

export function ViewNav({ current, onLeave, className }: ViewNavProps) {
  return (
    <nav className={`view-nav${className ? ` ${className}` : ""}`} aria-label="Navegación">
      <Link to={ROUTES.inicio} className="view-nav-home">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M10 3 5 8l5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Inicio
      </Link>

      <div className="view-nav-switch" role="group" aria-label="Vista">
        {(Object.keys(VIEW_LABELS) as DashboardView[]).map((view) =>
          view === current ? (
            <span key={view} className="is-active" aria-current="page">
              {VIEW_LABELS[view]}
            </span>
          ) : (
            <Link key={view} to={ROUTES[view]} onClick={() => onLeave?.(view)}>
              {VIEW_LABELS[view]}
            </Link>
          ),
        )}
      </div>
    </nav>
  )
}
