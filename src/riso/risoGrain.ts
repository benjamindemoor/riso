/**
 * Procedural Riso grain for the Riso tab (no scanned textures). A grain field is zero-mean noise,
 * roughly in [-1, 1], made of:
 *  - fine grain: per-pixel hashed noise, box-blurred to the chosen grain size;
 *  - starvation: low-frequency value noise — the patchy, uneven ink laydown of a real riso drum.
 * Everything is deterministic for a given (seed, inkIndex), so re-rendering never "boils", and
 * each ink gets its own field so overprinted inks don't grain in lockstep.
 */

export interface GrainSettings {
  /** 0-1 */
  amount: number
  /** 1-4, in preview pixels */
  size: number
  /** 0-1 */
  starvation: number
  seed: number
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295 // 0-1
}

function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const span = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += src[row + Math.min(width - 1, Math.max(0, x + k))]
      tmp[row + x] = sum / span
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x]
      out[y * width + x] = sum / span
    }
  }
  return out
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * @param scale full-resolution width ÷ preview width — keeps grain size and starvation patches the
 *  same size relative to the picture at export time as in the preview.
 */
export function grainField(width: number, height: number, settings: GrainSettings, inkIndex: number, scale = 1): Float32Array {
  const seed = (settings.seed * 7919 + inkIndex * 104729) | 0
  const count = width * height

  let fine: Float32Array = new Float32Array(count)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) fine[y * width + x] = hash(x, y, seed) * 2 - 1
  }
  const radius = Math.max(0, Math.round(settings.size * scale) - 1)
  if (radius > 0) {
    fine = boxBlur(fine, width, height, radius)
    // Blurring shrinks the noise's spread — renormalize to unit standard deviation so the grain
    // amount slider means the same thing at every grain size.
    let sumSq = 0
    for (let i = 0; i < count; i++) sumSq += fine[i] * fine[i]
    const std = Math.sqrt(sumSq / count) || 1
    const gain = 0.577 / std // 0.577 = std of uniform [-1, 1]
    for (let i = 0; i < count; i++) fine[i] *= gain
  }

  if (settings.starvation <= 0) return fine
  const cell = 40 * scale
  const lowSeed = seed ^ 0x5bd1e995
  for (let y = 0; y < height; y++) {
    const gy = y / cell
    const y0 = Math.floor(gy)
    const ty = smooth(gy - y0)
    for (let x = 0; x < width; x++) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const tx = smooth(gx - x0)
      const top = hash(x0, y0, lowSeed) * (1 - tx) + hash(x0 + 1, y0, lowSeed) * tx
      const bottom = hash(x0, y0 + 1, lowSeed) * (1 - tx) + hash(x0 + 1, y0 + 1, lowSeed) * tx
      const low = (top * (1 - ty) + bottom * ty) * 2 - 1
      fine[y * width + x] += low * settings.starvation * 1.5
    }
  }
  // A few large starvation patches don't average out on a small image — re-center so the grain
  // never shifts an ink's overall density, only its texture.
  let sum = 0
  for (let i = 0; i < count; i++) sum += fine[i]
  const mean = sum / count
  for (let i = 0; i < count; i++) fine[i] -= mean
  return fine
}

/**
 * Modulates coverage with a grain field. Strongest in mid-tones, zero on blank paper, and a little
 * in solids too (real riso solids still show white specks).
 */
export function applyGrain(coverage: Uint8Array, field: Float32Array, amount: number): Uint8Array {
  const out = new Uint8Array(coverage.length)
  if (amount <= 0) {
    out.set(coverage)
    return out
  }
  for (let i = 0; i < coverage.length; i++) {
    const v = coverage[i] / 255
    if (v === 0) continue
    const strength = Math.sqrt(v * (1 - v)) + 0.15 * v
    const next = v + field[i] * amount * strength
    out[i] = Math.round(Math.max(0, Math.min(1, next)) * 255)
  }
  return out
}

const CDF_BINS = 4096

/**
 * 1-bit "grain touch" screen: each pixel is inked when its coverage exceeds the grain field's own
 * rank at that spot (a histogram CDF, so it works on full-resolution images without sorting).
 * The black fraction tracks the coverage; solids stay solid and blank paper stays blank.
 */
export function screenStochastic(coverage: Uint8Array, field: Float32Array): Uint8Array {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i]
    if (field[i] > max) max = field[i]
  }
  const range = max - min || 1
  const histogram = new Uint32Array(CDF_BINS)
  const binOf = (v: number) => Math.min(CDF_BINS - 1, Math.floor(((v - min) / range) * CDF_BINS))
  for (let i = 0; i < field.length; i++) histogram[binOf(field[i])]++
  const cdf = new Float32Array(CDF_BINS)
  let running = 0
  for (let b = 0; b < CDF_BINS; b++) {
    cdf[b] = (running + histogram[b] / 2) / field.length // mid-rank: strictly inside (0, 1)
    running += histogram[b]
  }

  const out = new Uint8Array(coverage.length)
  for (let i = 0; i < coverage.length; i++) {
    out[i] = coverage[i] / 255 > cdf[binOf(field[i])] ? 255 : 0
  }
  return out
}
