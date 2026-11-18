import { describe, expect, it } from 'vitest'
import { adjustCoverage } from './risoAdjust.ts'

describe('adjustCoverage', () => {
  const input = Uint8Array.from([0, 64, 128, 200, 255])

  it('is the identity at density 1 and contrast 0', () => {
    expect(Array.from(adjustCoverage(input, 1, 0))).toEqual(Array.from(input))
  })

  it('removes all ink at density 0', () => {
    expect(Array.from(adjustCoverage(input, 0, 0))).toEqual([0, 0, 0, 0, 0])
  })

  it('clamps at 255 when density is boosted', () => {
    const out = adjustCoverage(input, 1.5, 0)
    expect(out[4]).toBe(255)
    expect(out[3]).toBe(255)
  })

  it('keeps empty paper empty when contrast is lowered', () => {
    expect(adjustCoverage(input, 1, -1)[0]).toBe(0)
  })

  it('pushes tones away from 50% when contrast is raised', () => {
    const out = adjustCoverage(input, 1, 0.5)
    expect(out[1]).toBeLessThan(64)
    expect(out[3]).toBeGreaterThan(200)
  })
})
