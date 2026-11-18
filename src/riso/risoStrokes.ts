import { computeEdgeMask, distortMask } from '../stroke.ts'

/** How the Riso tab traces a stroke: an outline around every area of `tone` above `threshold`,
 *  `width` px thick, optionally with the same glitch/tear look the Threshold tab's strokes have. */
export interface StrokeShape {
  /** 0-255 */
  threshold: number
  /** Line thickness in pixels (of the image being rendered). */
  width: number
  distorted: boolean
  seed: number
}

/** 0 (white) – 255 (black) per pixel — the "photo" stroke source: outlines the dark parts. */
export function photoDarkness(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const luminance = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    out[i] = 255 - Math.round(luminance)
  }
  return out
}

/** The stroke as ink coverage (0 or 255 per pixel), ready to be printed as its own riso drum. */
export function strokeCoverage(tone: Uint8Array, width: number, height: number, shape: StrokeShape): Uint8Array {
  const active = new Uint8Array(width * height)
  let any = false
  for (let i = 0; i < tone.length; i++) {
    if (tone[i] > shape.threshold) {
      active[i] = 1
      any = true
    }
  }
  const out = new Uint8Array(width * height)
  if (!any) return out
  let edges = computeEdgeMask(active, width, height, Math.max(0, Math.round((shape.width - 1) / 2)))
  if (shape.distorted) edges = distortMask(edges, width, height, shape.seed)
  for (let i = 0; i < edges.length; i++) if (edges[i]) out[i] = 255
  return out
}
