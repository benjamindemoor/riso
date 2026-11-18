import { RISO_INKS } from './risoInks.ts'
import { createRisoInk, createRisoStroke, risoInkHex, type RisoState } from './risoState.ts'

/** Papers a riso print plausibly lands on: off-whites, a kraft and a pale pastel. */
const PAPERS = ['#ffffff', '#f4f0e6', '#f7f1e1', '#efe6d2', '#e9dcc3', '#fdf3f3', '#eef4f2']

/** Inks that read well as an outline over most combinations. */
const STROKE_INKS = ['Black', 'Burgundy', 'Medium Blue', 'Teal', 'Bright Red']

function between(rand: () => number, min: number, max: number): number {
  return min + rand() * (max - min)
}

/** Index into a list of `length` items — clamped, since some PRNGs can return exactly 1. */
function pickIndex(rand: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rand() * length))
}

function intBetween(rand: () => number, min: number, max: number): number {
  return Math.min(max, Math.floor(between(rand, min, max + 1)))
}

/**
 * "Surprise me": a fresh random riso setup — 2-3 distinct built-in inks with their own density,
 * contrast and misregistration, a random paper and grain, and sometimes one outline stroke.
 * `rand` returns 0-1 (Math.random in the app, a seeded PRNG in tests).
 */
export function surpriseRiso(rand: () => number = Math.random): RisoState {
  const pool = [...RISO_INKS]
  const count = intBetween(rand, 2, 3)
  const inks = Array.from({ length: count }, (_, index) => {
    const [ink] = pool.splice(pickIndex(rand, pool.length), 1)
    return createRisoInk(ink.hex, {
      density: Math.round(between(rand, 0.8, 1.3) * 100) / 100,
      contrast: Math.round(between(rand, -0.2, 0.5) * 100) / 100,
      // The first drum is the registration reference; the others drift off it.
      offsetX: index === 0 ? 0 : intBetween(rand, -4, 4),
      offsetY: index === 0 ? 0 : intBetween(rand, -4, 4),
    })
  })

  const strokes =
    rand() < 0.4
      ? [
          createRisoStroke({
            hex: risoInkHex(STROKE_INKS[pickIndex(rand, STROKE_INKS.length)]),
            threshold: intBetween(rand, 70, 180),
            width: intBetween(rand, 1, 4),
            distorted: rand() < 0.3,
          }),
        ]
      : []

  return {
    inks,
    strokes,
    paperHex: PAPERS[pickIndex(rand, PAPERS.length)],
    grain: {
      amount: Math.round(between(rand, 0.2, 0.7) * 100) / 100,
      size: intBetween(rand, 1, 3),
      starvation: Math.round(between(rand, 0, 0.5) * 100) / 100,
      seed: intBetween(rand, 1, 999),
    },
    separationMode: 'continuous',
  }
}
