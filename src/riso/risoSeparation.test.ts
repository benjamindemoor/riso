import { describe, expect, it } from 'vitest'
import { computeRisoCoverage, hexToRgb01, labDistanceSq, mixRiso, rgb01ToLab, solveRisoCoverage } from './risoSeparation.ts'
import { RISO_INKS } from './risoInks.ts'

const WHITE = hexToRgb01('#ffffff')
const PINK = hexToRgb01('#ff48b0')
const BLUE = hexToRgb01('#3255a4')

describe('RISO_INKS', () => {
  it('has unique names and valid hex colours', () => {
    expect(new Set(RISO_INKS.map((ink) => ink.name)).size).toBe(RISO_INKS.length)
    for (const ink of RISO_INKS) expect(ink.hex).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('mixRiso', () => {
  it('returns the paper with no coverage and the ink at full coverage on white', () => {
    expect(mixRiso([0, 0], [PINK, BLUE], WHITE)).toEqual(WHITE)
    const full = mixRiso([1, 0], [PINK, BLUE], WHITE)
    full.forEach((v, i) => expect(v).toBeCloseTo(PINK[i], 6))
  })
})

describe('solveRisoCoverage', () => {
  it('leaves a paper-coloured pixel without ink', () => {
    const coverage = solveRisoCoverage(WHITE, [PINK, BLUE], WHITE)
    for (const c of coverage) expect(c).toBeLessThanOrEqual(0.02)
  })

  it('maps a pure ink pixel onto that ink alone', () => {
    const coverage = solveRisoCoverage(BLUE, [PINK, BLUE], WHITE)
    expect(coverage[1]).toBeGreaterThanOrEqual(0.95)
    expect(coverage[0]).toBeLessThanOrEqual(0.05)
  })

  it('reproduces an overprint mix closely', () => {
    const target = mixRiso([0.6, 0.4], [PINK, BLUE], WHITE)
    const solved = mixRiso(solveRisoCoverage(target, [PINK, BLUE], WHITE), [PINK, BLUE], WHITE)
    expect(labDistanceSq(rgb01ToLab(solved), rgb01ToLab(target))).toBeLessThan(25)
  })

  it('stays finite and clamped when the paper is darker than an ink', () => {
    const coverage = solveRisoCoverage(hexToRgb01('#ffffff'), [hexToRgb01('#ffe800')], hexToRgb01('#202020'))
    for (const c of coverage) {
      expect(Number.isFinite(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('computeRisoCoverage', () => {
  it('returns one 0-255 array per ink, matching per-pixel solves', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0x32, 0x55, 0xa4, 255])
    const result = computeRisoCoverage({ data, width: 2, height: 1 }, ['#ff48b0', '#3255a4'], '#ffffff')
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveLength(2)
    expect(result[0][0]).toBeLessThanOrEqual(5)
    expect(result[1][1]).toBeGreaterThanOrEqual(240)
  })
})
