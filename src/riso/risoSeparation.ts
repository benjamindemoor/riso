/**
 * Riso tab — automatic separation of a photo into 1-4 Risograph inks.
 *
 * Forward model: Riso ink is translucent and overprints, so (like Photoshop's Multiply blend that
 * riso mockups use) each ink multiplies whatever is beneath it. Per sRGB channel, 0-1:
 *   result = paper × Π(1 − coverageᵢ · (1 − inkᵢ))
 * Deliberately NOT the CMYK-additive model Screen Print Export uses (autoInkSeparation.ts) — the
 * preview composites with this exact formula (risoComposite.ts), so solving with it too keeps the
 * per-ink separation files and the on-screen look in agreement.
 */

export type Rgb01 = [number, number, number]

export interface Lab {
  L: number
  a: number
  b: number
}

export function hexToRgb01(hex: string): Rgb01 {
  const value = parseInt(hex.replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

export function mixRiso(coverage: number[], inks: Rgb01[], paper: Rgb01): Rgb01 {
  let r = paper[0]
  let g = paper[1]
  let b = paper[2]
  for (let i = 0; i < inks.length; i++) {
    const c = coverage[i]
    if (c <= 0) continue
    r *= 1 - c * (1 - inks[i][0])
    g *= 1 - c * (1 - inks[i][1])
    b *= 1 - c * (1 - inks[i][2])
  }
  return [r, g, b]
}

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function fLab(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
}

/** sRGB (0-1) → CIELAB, D65 white. */
export function rgb01ToLab([r8, g8, b8]: Rgb01): Lab {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const fx = fLab(x)
  const fy = fLab(y)
  const fz = fLab(z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labDistanceSq(p: Lab, q: Lab): number {
  const dL = p.L - q.L
  const da = p.a - q.a
  const db = p.b - q.b
  return dL * dL + da * da + db * db
}

const STEPS = [0.5, 0.25, 0.1, 0.05, 0.02]

/**
 * Per-ink coverage (each 0-1) minimizing the Lab error between `target` and mixRiso(coverage).
 * Seeded from the better of "no ink at all" and "the single best ink at full coverage", then
 * refined by coordinate descent over a fixed shrinking step schedule (same technique as
 * solveCoverage() in autoInkSeparation.ts).
 */
export function solveRisoCoverage(target: Rgb01, inks: Rgb01[], paper: Rgb01): number[] {
  const targetLab = rgb01ToLab(target)
  const n = inks.length
  const errorOf = (coverage: number[]) => labDistanceSq(rgb01ToLab(mixRiso(coverage, inks, paper)), targetLab)

  let coverage: number[] = new Array(n).fill(0)
  let bestError = errorOf(coverage)
  for (let i = 0; i < n; i++) {
    const seed: number[] = new Array(n).fill(0)
    seed[i] = 1
    const error = errorOf(seed)
    if (error < bestError) {
      bestError = error
      coverage = seed
    }
  }

  for (const step of STEPS) {
    let improved = true
    while (improved) {
      improved = false
      for (let i = 0; i < n; i++) {
        for (const delta of [step, -step]) {
          const value = Math.max(0, Math.min(1, coverage[i] + delta))
          if (value === coverage[i]) continue
          const candidate = coverage.slice()
          candidate[i] = value
          const error = errorOf(candidate)
          if (error < bestError) {
            bestError = error
            coverage = candidate
            improved = true
          }
        }
      }
    }
  }
  return coverage
}

/** Source colours are rounded to this many levels per channel before solving — photos have far
 *  fewer visually distinct colours than pixels, so this bounds how often the solve runs. */
const BUCKET_SIZE = 4

export interface RisoPixelSource {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** One 0-255 coverage array per ink (index-aligned with `inkHexes`), memoized per colour bucket. */
export function computeRisoCoverage(source: RisoPixelSource, inkHexes: string[], paperHex: string): Uint8Array[] {
  const { data, width, height } = source
  const inks = inkHexes.map(hexToRgb01)
  const paper = hexToRgb01(paperHex)
  const pixelCount = width * height
  const result = inks.map(() => new Uint8Array(pixelCount))
  const cache = new Map<number, Uint8Array>()

  for (let p = 0; p < pixelCount; p++) {
    const idx = p * 4
    const br = Math.round(data[idx] / BUCKET_SIZE)
    const bg = Math.round(data[idx + 1] / BUCKET_SIZE)
    const bb = Math.round(data[idx + 2] / BUCKET_SIZE)
    const key = (br << 16) | (bg << 8) | bb
    let solved = cache.get(key)
    if (!solved) {
      const target: Rgb01 = [Math.min(255, br * BUCKET_SIZE) / 255, Math.min(255, bg * BUCKET_SIZE) / 255, Math.min(255, bb * BUCKET_SIZE) / 255]
      solved = Uint8Array.from(solveRisoCoverage(target, inks, paper), (c) => Math.round(c * 255))
      cache.set(key, solved)
    }
    for (let i = 0; i < inks.length; i++) result[i][p] = solved[i]
  }
  return result
}
