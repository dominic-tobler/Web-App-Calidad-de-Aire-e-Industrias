import { WIND_SECTOR_DEG, WIND_SECTORS } from "../domain/wind"

type CommonWindRoseProps = {
  counts: number[]
  dominant: number | null
  label: string
}

const SIZE = 148
const CENTER = SIZE / 2
const INNER = 16
const OUTER = 58

// Rosa de un solo color: el largo de cada punta es cuántas horas llegó el viento desde ese lado.
export function CommonWindRose({ counts, dominant, label }: CommonWindRoseProps) {
  const max = Math.max(0, ...counts)

  return (
    <svg className="wind-rose-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
      <circle cx={CENTER} cy={CENTER} r={OUTER} fill="none" stroke="#d3ddd7" strokeWidth="1" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={INNER + (OUTER - INNER) * 0.5}
        fill="none"
        stroke="#e3e8e5"
        strokeWidth="1"
      />
      {counts.map((count, sector) => {
        if (count === 0 || max === 0) return null
        const radius = INNER + (OUTER - INNER) * (count / max)
        const dominantPetal = sector === dominant
        return (
          <path
            key={WIND_SECTORS[sector].short}
            d={petal(sector, radius)}
            fill={dominantPetal ? "#1a4dd9" : "#8aa0dc"}
            stroke="#ffffff"
            strokeWidth="1"
          >
            <title>{`${WIND_SECTORS[sector].name} · ${count} h`}</title>
          </path>
        )
      })}
      <circle cx={CENTER} cy={CENTER} r={INNER} fill="#ffffff" stroke="#d3ddd7" strokeWidth="1" />
      {CARDINALS.map(({ text, bearing }) => {
        const [x, y] = point(OUTER + 12, bearing)
        return (
          <text
            key={text}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#1a2420"
            fontSize="11"
            fontWeight="600"
            fontFamily="IBM Plex Sans, sans-serif"
          >
            {text}
          </text>
        )
      })}
    </svg>
  )
}

const CARDINALS = [
  { text: "N", bearing: 0 },
  { text: "E", bearing: 90 },
  { text: "S", bearing: 180 },
  { text: "O", bearing: 270 },
] as const

function petal(sector: number, radius: number): string {
  const start = sector * WIND_SECTOR_DEG - WIND_SECTOR_DEG / 2 + 2.2
  const end = sector * WIND_SECTOR_DEG + WIND_SECTOR_DEG / 2 - 2.2
  const [x0, y0] = point(INNER, start)
  const [x1, y1] = point(radius, start)
  const [x2, y2] = point(radius, end)
  const [x3, y3] = point(INNER, end)
  return `M ${x0} ${y0} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER} ${INNER} 0 0 0 ${x0} ${y0} Z`
}

function point(radius: number, bearing: number): [number, number] {
  const radians = (bearing * Math.PI) / 180
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)]
}
