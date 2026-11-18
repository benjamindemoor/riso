import { describe, expect, it } from 'vitest'
import { photoDarkness, strokeCoverage } from './risoStrokes.ts'

describe('photoDarkness', () => {
  it('is 255 for black and 0 for white', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    expect(Array.from(photoDarkness(data, 2))).toEqual([255, 0])
  })
})

describe('strokeCoverage', () => {
  // 6x6 tone map with a solid 2x2 block in the middle.
  const W = 6
  const H = 6
  const tone = new Uint8Array(W * H)
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) tone[y * W + x] = 255

  it('outlines the shape and leaves far-away pixels empty', () => {
    const out = strokeCoverage(tone, W, H, { threshold: 128, width: 1, distorted: false, seed: 1 })
    expect(out[2 * W + 2]).toBe(255) // shape edge
    expect(out[0]).toBe(0) // corner, far from the shape
    expect(out.every((v) => v === 0 || v === 255)).toBe(true)
  })

  it('gets thicker with a larger width', () => {
    const thin = strokeCoverage(tone, W, H, { threshold: 128, width: 1, distorted: false, seed: 1 })
    const thick = strokeCoverage(tone, W, H, { threshold: 128, width: 5, distorted: false, seed: 1 })
    const count = (a: Uint8Array) => a.filter((v) => v === 255).length
    expect(count(thick)).toBeGreaterThan(count(thin))
  })

  it('draws nothing when no pixel passes the threshold', () => {
    const out = strokeCoverage(tone, W, H, { threshold: 255, width: 3, distorted: false, seed: 1 })
    expect(out.every((v) => v === 0)).toBe(true)
  })
})
