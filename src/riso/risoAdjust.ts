/**
 * Per-ink tone curve for the Riso tab: contrast pivots around 50% coverage, then density scales the
 * whole ink up or down. Pixels with no ink at all stay at zero, so lowering contrast never floods
 * blank paper with a tint.
 *
 * @param density 0-1.5 (1 = as separated)
 * @param contrast -1..1 (0 = unchanged)
 */
export function adjustCoverage(coverage: Uint8Array, density: number, contrast: number): Uint8Array {
  const lut = new Uint8Array(256)
  for (let v = 1; v < 256; v++) {
    const t = ((v / 255 - 0.5) * (1 + contrast) + 0.5) * density
    lut[v] = Math.round(Math.max(0, Math.min(1, t)) * 255)
  }
  const out = new Uint8Array(coverage.length)
  for (let i = 0; i < coverage.length; i++) out[i] = lut[coverage[i]]
  return out
}
