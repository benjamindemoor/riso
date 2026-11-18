import { hexToRgb01 } from './risoSeparation.ts'

/** One ink as it gets printed: its final (adjusted + grained) coverage, its colour, and its
 *  misregistration in whole pixels. */
export interface RisoLayer {
  coverage: Uint8Array
  hex: string
  offsetX: number
  offsetY: number
}

/**
 * Overprints `layers` onto the paper with the same multiply model the separation solves with
 * (mixRiso in risoSeparation.ts) — RGBA output. A layer's pixel (x, y) lands on (x + offsetX,
 * y + offsetY); whatever an offset uncovers gets no ink from that layer.
 */
export function compositeRiso(layers: RisoLayer[], paperHex: string, width: number, height: number): Uint8ClampedArray {
  const count = width * height
  const paper = hexToRgb01(paperHex)
  const r = new Float32Array(count).fill(paper[0])
  const g = new Float32Array(count).fill(paper[1])
  const b = new Float32Array(count).fill(paper[2])

  for (const layer of layers) {
    const [ir, ig, ib] = hexToRgb01(layer.hex)
    const dx = Math.round(layer.offsetX)
    const dy = Math.round(layer.offsetY)
    const yStart = Math.max(0, dy)
    const yEnd = Math.min(height, height + dy)
    const xStart = Math.max(0, dx)
    const xEnd = Math.min(width, width + dx)
    for (let y = yStart; y < yEnd; y++) {
      const srcRow = (y - dy) * width
      const dstRow = y * width
      for (let x = xStart; x < xEnd; x++) {
        const c = layer.coverage[srcRow + x - dx]
        if (c === 0) continue
        const t = c / 255
        const i = dstRow + x
        r[i] *= 1 - t * (1 - ir)
        g[i] *= 1 - t * (1 - ig)
        b[i] *= 1 - t * (1 - ib)
      }
    }
  }

  const out = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    out[i * 4] = Math.round(r[i] * 255)
    out[i * 4 + 1] = Math.round(g[i] * 255)
    out[i * 4 + 2] = Math.round(b[i] * 255)
    out[i * 4 + 3] = 255
  }
  return out
}

/** A print-ready separation for one riso drum: grey = 255 − coverage (black = full ink), opaque. */
export function coverageToGreyscale(coverage: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(coverage.length * 4)
  for (let i = 0; i < coverage.length; i++) {
    const grey = 255 - coverage[i]
    out[i * 4] = grey
    out[i * 4 + 1] = grey
    out[i * 4 + 2] = grey
    out[i * 4 + 3] = 255
  }
  return out
}
