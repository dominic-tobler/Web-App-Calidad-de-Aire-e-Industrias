import {
  DomEvent,
  latLng,
  point,
  type LatLng,
  type LatLngBounds,
  type Map as LeafletMap,
  type MapOptions,
  type Point,
  type PointExpression,
} from "leaflet"

/**
 * Zoom fraccionario. La rueda no usa el zoom nativo de Leaflet: cada tick
 * llamaba a setZoom y eso disparaba viewprereset, que borra todas las teselas
 * y las vuelve a pedir. Ese recambio es el parpadeo al hacer scroll.
 */
export const smoothMapOptions = {
  zoomSnap: 0,
  zoomDelta: 0.5,
  scrollWheelZoom: false,
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true,
  inertia: true,
  inertiaDeceleration: 2400,
  inertiaMaxSpeed: 1800,
  easeLinearity: 0.25,
} satisfies Pick<
  MapOptions,
  | "zoomSnap"
  | "zoomDelta"
  | "scrollWheelZoom"
  | "zoomAnimation"
  | "fadeAnimation"
  | "markerZoomAnimation"
  | "inertia"
  | "inertiaDeceleration"
  | "inertiaMaxSpeed"
  | "easeLinearity"
>

/** Píxeles de rueda que equivalen a un nivel de zoom. Más alto = zoom más lento. */
const WHEEL_PX_PER_ZOOM = 120
/** Tope por frame para que un golpe de rueda no salte de nivel. */
const MAX_ZOOM_STEP = 0.28
/** A partir de aquí se reasienta la vista, para que los círculos no se inflen. */
const COMMIT_ZOOM = 0.6
const SETTLE_MS = 80

type PinchMap = LeafletMap & {
  _stop: () => PinchMap
  _moveStart: (zoomChanged: boolean, noMoveStart?: boolean) => PinchMap
  _move: (
    center: LatLng,
    zoom?: number,
    data?: { pinch?: boolean; round?: boolean; flyTo?: boolean },
    suppressEvent?: boolean,
  ) => PinchMap
  _moveEnd: (zoomChanged: boolean) => PinchMap
  _animatingZoom?: boolean
  _mapPane?: HTMLElement
}

/**
 * Zoom de rueda por el mismo camino que el pellizco: transforma las teselas
 * que ya están en pantalla y no las destruye en cada tick.
 */
export function attachSmoothWheel(map: LeafletMap) {
  const pinch = map as PinchMap
  const container = map.getContainer()
  let delta = 0
  let anchor: Point | null = null
  let frame = 0
  let settle = 0
  let gesturing = false
  let committedZoom = map.getZoom()
  let pruneTimer = 0

  const onWheel = (event: Event) => {
    DomEvent.preventDefault(event)
    DomEvent.stopPropagation(event)
    delta += DomEvent.getWheelDelta(event)
    anchor = map.mouseEventToContainerPoint(event as WheelEvent)
    window.clearTimeout(settle)
    if (!frame) frame = requestAnimationFrame(apply)
  }

  const apply = () => {
    frame = 0
    const point = anchor
    if (!point || delta === 0) return

    cancelGlide(map, true)
    if (pinch._animatingZoom) {
      pinch._animatingZoom = false
      pinch._mapPane?.classList.remove("leaflet-zoom-anim")
    }
    pinch._stop()

    const current = map.getZoom()
    const min = map.getMinZoom()
    const max = map.getMaxZoom()
    const desired = delta / WHEEL_PX_PER_ZOOM
    const step = Math.abs(desired) > MAX_ZOOM_STEP ? Math.sign(desired) * MAX_ZOOM_STEP : desired
    const next = Math.min(max, Math.max(min, current + step))
    delta -= (next - current) * WHEEL_PX_PER_ZOOM

    const blocked = next === current && ((step > 0 && current >= max) || (step < 0 && current <= min))
    if (blocked) delta = 0

    if (next !== current) {
      if (!gesturing) {
        pinch._moveStart(true, false)
        gesturing = true
        committedZoom = current
      }
      const scale = map.getZoomScale(next)
      const half = map.getSize().divideBy(2)
      const center =
        scale === 1
          ? map.getCenter()
          : map.containerPointToLatLng(half.add(point.subtract(half).multiplyBy(1 - 1 / scale)))
      pinch._move(center, next, { pinch: true, round: false })
      if (Math.abs(map.getZoom() - committedZoom) >= COMMIT_ZOOM) commit(false)
    }

    if (Math.abs(delta) > 0.4) {
      frame = requestAnimationFrame(apply)
      return
    }

    delta = 0
    settle = window.setTimeout(() => commit(true), SETTLE_MS)
  }

  const commit = (refreshTiles: boolean) => {
    if (gesturing) {
      gesturing = false
      committedZoom = map.getZoom()
      pinch._moveEnd(true)
    }
    if (!refreshTiles) return
    window.clearTimeout(pruneTimer)
    pruneTimer = sharpenTiles(map, () => gesturing)
  }

  DomEvent.on(container, "wheel", onWheel)

  // Se llama justo antes de map.remove(): también corta un acercamiento en curso, que si no
  // seguiría moviendo un mapa ya destruido (error "_leaflet_pos" de Leaflet).
  return () => {
    cancelGlide(map, false)
    DomEvent.off(container, "wheel", onWheel)
    cancelAnimationFrame(frame)
    window.clearTimeout(settle)
    window.clearTimeout(pruneTimer)
    frame = 0
    delta = 0
    if (gesturing) commit(false)
  }
}

type TileGrid = {
  _pruneTiles?: () => void
}

function sharpenTiles(map: LeafletMap, isGesturing: () => boolean) {
  const grids: { grid: TileGrid; prune: () => void }[] = []
  map.eachLayer((layer) => {
    const grid = layer as unknown as TileGrid
    if (typeof grid._pruneTiles !== "function") return
    const prune = grid._pruneTiles
    grid._pruneTiles = () => {}
    grids.push({ grid, prune })
  })
  if (grids.length === 0) return 0

  map.fire("zoom")
  for (const { grid, prune } of grids) grid._pruneTiles = prune

  return window.setTimeout(() => {
    if (isGesturing()) return
    for (const { grid, prune } of grids) prune.call(grid)
  }, 420)
}

export function flyZoom(map: LeafletMap, delta: number) {
  cancelGlide(map, true)
  const next = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta))
  map.flyTo(map.getCenter(), next, { duration: 0.35, easeLinearity: 0.25 })
}

type GlideJob = {
  frame: number
  onDrag: () => void
}

const glides = new WeakMap<LeafletMap, GlideJob>()

function cancelGlide(map: LeafletMap, settle: boolean) {
  const job = glides.get(map)
  if (!job) return
  cancelAnimationFrame(job.frame)
  map.off("dragstart", job.onDrag)
  glides.delete(map)
  if (settle) (map as PinchMap)._moveEnd(true)
}

// El zoom del acercamiento escala el dibujo vectorial entero. Sin esto, los
// círculos y los municipios se inflan y se pixelan hasta que la vista se detiene.
function redrawVectors(map: LeafletMap) {
  map.eachLayer((layer) => {
    const renderer = layer as { _reset?: () => void; _updateTransform?: unknown }
    if (typeof renderer._updateTransform === "function" && typeof renderer._reset === "function") {
      renderer._reset()
    }
  })
}

/**
 * Acerca el mapa al encuadre: el zoom y el centro avanzan juntos y frenan al llegar.
 */
export function glideToBounds(
  map: LeafletMap,
  bounds: LatLngBounds,
  options: {
    paddingTopLeft?: PointExpression
    paddingBottomRight?: PointExpression
    maxZoom?: number
    duration?: number
  } = {},
) {
  const pinch = map as PinchMap
  const wasGliding = glides.has(map)
  cancelGlide(map, false)

  const paddingTL = point(options.paddingTopLeft ?? [0, 0])
  const paddingBR = point(options.paddingBottomRight ?? [0, 0])
  let targetZoom = map.getBoundsZoom(bounds, false, paddingTL.add(paddingBR))
  if (options.maxZoom != null) targetZoom = Math.min(options.maxZoom, targetZoom)
  targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom))
  if (!Number.isFinite(targetZoom)) return

  const paddingOffset = paddingBR.subtract(paddingTL).divideBy(2)
  const targetCenter = map.unproject(
    map
      .project(bounds.getSouthWest(), targetZoom)
      .add(map.project(bounds.getNorthEast(), targetZoom))
      .divideBy(2)
      .add(paddingOffset),
    targetZoom,
  )

  const startCenter = map.getCenter()
  const startZoom = map.getZoom()
  const shift = map.latLngToContainerPoint(targetCenter).distanceTo(map.latLngToContainerPoint(startCenter))
  if (Math.abs(targetZoom - startZoom) < 0.04 && shift < 12) {
    if (wasGliding) {
      pinch._move(targetCenter, targetZoom)
      pinch._moveEnd(true)
      sharpenTiles(map, () => glides.has(map))
    }
    return
  }

  if (pinch._animatingZoom) {
    pinch._animatingZoom = false
    pinch._mapPane?.classList.remove("leaflet-zoom-anim")
  }
  if (!wasGliding) {
    pinch._stop()
    pinch._moveStart(true, false)
  }

  const duration = (options.duration ?? 1.2) * 1000
  const started = performance.now()
  const job: GlideJob = { frame: 0, onDrag: () => cancelGlide(map, false) }
  map.on("dragstart", job.onDrag)
  glides.set(map, job)

  const frame = (now: number) => {
    if (glides.get(map) !== job) return
    const t = Math.min(1, (now - started) / duration)
    const eased = 1 - (1 - t) ** 3
    const zoom = startZoom + (targetZoom - startZoom) * eased
    // `pinch` obliga a Leaflet a emitir "zoom" en cada cuadro aunque el zoom no cambie.
    // Las teselas solo se reacomodan con ese evento: sin él, un vuelo que solo desplaza
    // (p. ej. entre dos municipios con el mismo zoom tope) deja el mapa base quieto
    // mientras los polígonos sí se mueven.
    pinch._move(
      latLng(
        startCenter.lat + (targetCenter.lat - startCenter.lat) * eased,
        startCenter.lng + (targetCenter.lng - startCenter.lng) * eased,
      ),
      zoom,
      { flyTo: true, pinch: true },
    )
    redrawVectors(map)
    if (t < 1) {
      job.frame = requestAnimationFrame(frame)
      return
    }
    pinch._move(targetCenter, targetZoom)
    redrawVectors(map)
    pinch._moveEnd(true)
    map.off("dragstart", job.onDrag)
    glides.delete(map)
    // Durante el vuelo las teselas no cambian de nivel; al llegar se piden las del zoom final.
    sharpenTiles(map, () => glides.has(map))
  }

  job.frame = requestAnimationFrame(frame)
}
