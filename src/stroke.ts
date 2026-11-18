import type { BlendMode } from './blend.ts'

export interface StrokeConfig {
  id: number
  /** When false, this stroke contributes nothing at all (kept in the list, just skipped). */
  enabled: boolean
  color: string
  /** How this stroke's color composites onto whatever is already painted beneath it (same
   *  blend modes as a layer's own `blendMode`). */
  blendMode: BlendMode
  width: number
  /** Block size (px) the underlying shape gets quantized to *before* its outline is traced —
   *  1 = normal crisp line. Pixelating the shape (not the already-thin outline) keeps the line's
   *  own width unchanged; only the outline's path turns into a blocky/staircase silhouette. */
  pixelation: number
  /** Glitch/tear look: shifts random horizontal bands of the outline sideways. */
  distorted: boolean
}

let nextStrokeId = 1

export function createStroke(overrides: Partial<Omit<StrokeConfig, 'id'>> = {}): StrokeConfig {
  return {
    id: nextStrokeId++,
    enabled: true,
    color: '#000000',
    blendMode: 'normal',
    width: 2,
    pixelation: 1,
    distorted: false,
    ...overrides,
  }
}

/** Backfills fields a stroke might not have yet — e.g. a layer loaded from a saved preset/
 *  IndexedDB entry created before strokes had ids, the "distorted" toggle, or per-stroke
 *  enabled/blendMode. */
export function normalizeStrokes(strokes: StrokeConfig[]): StrokeConfig[] {
  return strokes.map((stroke) => ({
    id: typeof stroke.id === 'number' ? stroke.id : nextStrokeId++,
    enabled: stroke.enabled ?? true,
    color: stroke.color,
    blendMode: stroke.blendMode ?? 'normal',
    width: stroke.width,
    pixelation: stroke.pixelation,
    distorted: stroke.distorted ?? false,
  }))
}

/** Moves the dragged item to just before the target item (drag-handle reordering in the UI) —
 *  generic over anything with a stable `id`, so both this tool's strokes and the Airbrush Foto
 *  tool's own (differently-shaped) strokes can share the same reorder logic. */
export function moveStroke<T extends { id: number }>(items: T[], draggedId: number, targetId: number): T[] {
  if (draggedId === targetId) return items
  const fromIndex = items.findIndex((s) => s.id === draggedId)
  if (fromIndex === -1) return items

  const next = [...items]
  const [dragged] = next.splice(fromIndex, 1)
  const targetIndex = next.findIndex((s) => s.id === targetId)
  if (targetIndex === -1) return items
  next.splice(targetIndex, 0, dragged)
  return next
}

/** Blocky/pixelated version of a binary silhouette: each `size`×`size` block turns fully on if at
 *  least half its pixels were on (same majority-vote convention as the "Pixelated" tone pattern).
 *  Meant to be applied to a *filled shape* (`active`), not a thin outline — run on a thin line,
 *  majority-vote would erase it outright (its occupancy in a large block is nearly always under
 *  50%), which is exactly why this used to be applied to the edge mask directly and had to fake
 *  an "any pixel on" rule to compensate: that made the line look thicker, not pixelated. Pixelating
 *  the shape *before* tracing its outline keeps the outline's own width unchanged — only its path
 *  becomes a blocky/staircase silhouette, which is what "pixelated" actually means here. */
export function pixelateMask(mask: Uint8Array, width: number, height: number, size: number): Uint8Array {
  if (size <= 1) return mask

  const result = new Uint8Array(width * height)
  for (let by = 0; by < height; by += size) {
    const blockHeight = Math.min(size, height - by)
    for (let bx = 0; bx < width; bx += size) {
      const blockWidth = Math.min(size, width - bx)

      let sum = 0
      let count = 0
      for (let y = by; y < by + blockHeight; y++) {
        for (let x = bx; x < bx + blockWidth; x++) {
          sum += mask[y * width + x]
          count++
        }
      }
      const on = count > 0 && sum / count >= 0.5 ? 1 : 0
      if (on) {
        for (let y = by; y < by + blockHeight; y++) {
          for (let x = bx; x < bx + blockWidth; x++) {
            result[y * width + x] = 1
          }
        }
      }
    }
  }

  return result
}

/** Deterministic PRNG (Park-Miller LCG) seeded per-stroke, so the glitch pattern below stays
 *  stable across re-renders/exports instead of flickering on every preview tick. */
export function seededRandom(seed: number): () => number {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

/** Glitch/VHS-tear look: splits the mask into random-height horizontal bands and shifts most of
 *  them sideways by a random amount (a minority stay put, so it reads as "torn" rather than just
 *  uniformly wobbly). Deterministic per `seed` (the stroke's own id) so it doesn't re-randomize on
 *  every render. */
export function distortMask(mask: Uint8Array, width: number, height: number, seed: number): Uint8Array {
  const rand = seededRandom(seed || 1)
  const result = new Uint8Array(width * height)
  const maxShift = Math.max(2, Math.round(width * 0.04))

  let y = 0
  while (y < height) {
    const bandHeight = Math.max(1, Math.round(height * (0.01 + rand() * 0.04)))
    const blockHeight = Math.min(bandHeight, height - y)
    const offset = rand() < 0.6 ? Math.round((rand() - 0.5) * 2 * maxShift) : 0

    for (let row = y; row < y + blockHeight; row++) {
      for (let x = 0; x < width; x++) {
        const sx = x - offset
        if (sx < 0 || sx >= width) continue
        result[row * width + x] = mask[row * width + sx]
      }
    }
    y += blockHeight
  }

  return result
}

/** Separable box dilation: grows `mask` by `radius` pixels (Chebyshev distance) in O(w*h*radius). */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask

  const horizontal = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let on = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < width && mask[row + nx]) {
          on = 1
          break
        }
      }
      horizontal[row + x] = on
    }
  }

  const result = new Uint8Array(width * height)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let on = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) {
          on = 1
          break
        }
      }
      result[y * width + x] = on
    }
  }

  return result
}

/**
 * Pixel-based edge detection (TouchDesigner "Edge TOP" style): marks a pixel as an
 * edge if it differs from any of its 4-neighbors, then dilates by `radius` for thickness.
 * Works on any mask topology (including holes) without path tracing.
 */
export function computeEdgeMask(active: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const boundary = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const here = active[i]
      const left = x > 0 ? active[i - 1] : 0
      const right = x < width - 1 ? active[i + 1] : 0
      const up = y > 0 ? active[i - width] : 0
      const down = y < height - 1 ? active[i + width] : 0

      if (here !== left || here !== right || here !== up || here !== down) {
        boundary[i] = 1
      }
    }
  }

  return dilate(boundary, width, height, radius)
}
