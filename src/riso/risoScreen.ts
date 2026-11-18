/**
 * Per-ink screening for the Riso tab: turns an ink's continuous coverage into 1-bit dots, the way a
 * real riso drum does. "noise" = stochastic grain-touch screening (see screenStochastic in
 * risoGrain.ts); "dither" = Floyd–Steinberg error diffusion. Both work on a grid of `cell`-sized
 * blocks so the dot size stays the same relative to the picture in the preview and at full
 * resolution (and can be made deliberately chunky).
 */

export type RisoScreen = 'smooth' | 'noise' | 'dither'

/** Averages `cell`×`cell` blocks (edge blocks may be smaller). */
export function downsampleAverage(cov: Uint8Array, width: number, height: number, cell: number): { data: Uint8Array; width: number; height: number } {
  if (cell <= 1) return { data: cov, width, height }
  const sw = Math.ceil(width / cell)
  const sh = Math.ceil(height / cell)
  const data = new Uint8Array(sw * sh)
  for (let by = 0; by < sh; by++) {
    const y0 = by * cell
    const y1 = Math.min(height, y0 + cell)
    for (let bx = 0; bx < sw; bx++) {
      const x0 = bx * cell
      const x1 = Math.min(width, x0 + cell)
      let sum = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += cov[y * width + x]
      data[by * sw + bx] = Math.round(sum / ((y1 - y0) * (x1 - x0)))
    }
  }
  return { data, width: sw, height: sh }
}

/** Expands a block grid (`smallWidth` wide) back to width×height, each block `cell` px. */
export function upsampleNearest(small: Uint8Array, smallWidth: number, cell: number, width: number, height: number): Uint8Array {
  if (cell <= 1) return small
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * smallWidth
    for (let x = 0; x < width; x++) out[y * width + x] = small[row + Math.floor(x / cell)]
  }
  return out
}

/** Floyd–Steinberg error diffusion to 0/255. */
export function ditherFloydSteinberg(cov: Uint8Array, width: number, height: number): Uint8Array {
  const buffer = Float32Array.from(cov)
  const out = new Uint8Array(cov.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const value = buffer[i]
      const next = value >= 128 ? 255 : 0
      out[i] = next
      const error = value - next
      if (x + 1 < width) buffer[i + 1] += (error * 7) / 16
      if (y + 1 < height) {
        if (x > 0) buffer[i + width - 1] += (error * 3) / 16
        buffer[i + width] += (error * 5) / 16
        if (x + 1 < width) buffer[i + width + 1] += error / 16
      }
    }
  }
  return out
}
