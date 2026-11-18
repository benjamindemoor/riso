import { describe, expect, it } from 'vitest'
import { ditherFloydSteinberg, downsampleAverage, upsampleNearest } from './risoScreen.ts'

describe('downsampleAverage / upsampleNearest', () => {
  it('averages blocks and expands them back to the original size', () => {
    // 4x2 image: left 2x2 block = 0/255 mix (avg 128), right block = 255.
    const cov = Uint8Array.from([0, 255, 255, 255, 255, 2, 255, 255])
    const small = downsampleAverage(cov, 4, 2, 2)
    expect(small.width).toBe(2)
    expect(small.height).toBe(1)
    expect(Array.from(small.data)).toEqual([128, 255])
    expect(Array.from(upsampleNearest(small.data, small.width, 2, 4, 2))).toEqual([128, 128, 255, 255, 128, 128, 255, 255])
  })

  it('handles sizes that are not a multiple of the cell size', () => {
    const cov = new Uint8Array(5 * 3).fill(100)
    const small = downsampleAverage(cov, 5, 3, 2)
    expect(small.width).toBe(3)
    expect(small.height).toBe(2)
    expect(small.data.every((v) => v === 100)).toBe(true)
    expect(upsampleNearest(small.data, small.width, 2, 5, 3)).toHaveLength(15)
  })

  it('is the identity at cell size 1', () => {
    const cov = Uint8Array.from([1, 2, 3, 4])
    expect(Array.from(downsampleAverage(cov, 2, 2, 1).data)).toEqual([1, 2, 3, 4])
    expect(Array.from(upsampleNearest(cov, 2, 1, 2, 2))).toEqual([1, 2, 3, 4])
  })
})

describe('ditherFloydSteinberg', () => {
  it('outputs only 0/255 and preserves the average tone', () => {
    const w = 40
    const h = 40
    const out = ditherFloydSteinberg(new Uint8Array(w * h).fill(64), w, h)
    expect(out.every((v) => v === 0 || v === 255)).toBe(true)
    const fraction = out.filter((v) => v === 255).length / out.length
    expect(Math.abs(fraction - 64 / 255)).toBeLessThan(0.03)
  })

  it('keeps solids solid and blank paper blank', () => {
    expect(ditherFloydSteinberg(new Uint8Array(16).fill(255), 4, 4).every((v) => v === 255)).toBe(true)
    expect(ditherFloydSteinberg(new Uint8Array(16), 4, 4).every((v) => v === 0)).toBe(true)
  })
})
