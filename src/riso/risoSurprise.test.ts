import { describe, expect, it } from 'vitest'
import { seededRandom } from '../stroke.ts'
import { surpriseRiso } from './risoSurprise.ts'
import { RISO_INKS } from './risoInks.ts'

describe('surpriseRiso', () => {
  it('is deterministic for the same random source', () => {
    const withoutIds = (state: ReturnType<typeof surpriseRiso>) => ({
      ...state,
      inks: state.inks.map(({ id: _id, ...rest }) => rest),
      strokes: state.strokes.map(({ id: _id, ...rest }) => rest),
    })
    expect(withoutIds(surpriseRiso(seededRandom(42)))).toEqual(withoutIds(surpriseRiso(seededRandom(42))))
  })

  it('always produces 2-3 distinct built-in inks and settings in range', () => {
    const builtIn = new Set(RISO_INKS.map((ink) => ink.hex))
    for (let seed = 1; seed <= 50; seed++) {
      const s = surpriseRiso(seededRandom(seed))
      expect(s.inks.length).toBeGreaterThanOrEqual(2)
      expect(s.inks.length).toBeLessThanOrEqual(3)
      expect(new Set(s.inks.map((ink) => ink.hex)).size).toBe(s.inks.length)
      for (const ink of s.inks) {
        expect(builtIn.has(ink.hex)).toBe(true)
        expect(ink.density).toBeGreaterThanOrEqual(0.8)
        expect(ink.density).toBeLessThanOrEqual(1.3)
        expect(Math.abs(ink.offsetX)).toBeLessThanOrEqual(4)
        expect(Math.abs(ink.offsetY)).toBeLessThanOrEqual(4)
        expect(['smooth', 'noise', 'dither']).toContain(ink.screen)
        expect(ink.dotSize).toBeGreaterThanOrEqual(1)
        expect(ink.dotSize).toBeLessThanOrEqual(8)
      }
      expect(s.grain.amount).toBeGreaterThanOrEqual(0.2)
      expect(s.grain.amount).toBeLessThanOrEqual(0.7)
      expect(s.strokes.length).toBeLessThanOrEqual(1)
      for (const stroke of s.strokes) expect(builtIn.has(stroke.hex)).toBe(true)
    }
  })
})
