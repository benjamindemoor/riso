import { describe, expect, it } from 'vitest'
import { applyGrain, grainField, screenStochastic, type GrainSettings } from './risoGrain.ts'

const SETTINGS: GrainSettings = { amount: 0.5, size: 1, starvation: 0.3, seed: 7 }
const W = 64
const H = 64

describe('grainField', () => {
  it('is deterministic per seed and differs per ink', () => {
    const a = grainField(W, H, SETTINGS, 0)
    expect(Array.from(grainField(W, H, SETTINGS, 0))).toEqual(Array.from(a))
    expect(Array.from(grainField(W, H, SETTINGS, 1))).not.toEqual(Array.from(a))
  })
})

describe('applyGrain', () => {
  const flat = new Uint8Array(W * H).fill(128)
  const field = grainField(W, H, SETTINGS, 0)

  it('is the identity at amount 0', () => {
    expect(Array.from(applyGrain(flat, field, 0))).toEqual(Array.from(flat))
  })

  it('roughly preserves the mean coverage', () => {
    const out = applyGrain(flat, field, 0.8)
    const mean = out.reduce((s, v) => s + v, 0) / out.length
    expect(Math.abs(mean - 128)).toBeLessThan(3)
    expect(new Set(out).size).toBeGreaterThan(10)
  })

  it('leaves untouched paper untouched', () => {
    const empty = new Uint8Array(W * H)
    expect(applyGrain(empty, field, 1).every((v) => v === 0)).toBe(true)
  })
})

describe('screenStochastic', () => {
  it('outputs only 0/255 with a black fraction close to the coverage', () => {
    const half = new Uint8Array(W * H).fill(128)
    const out = screenStochastic(half, grainField(W, H, SETTINGS, 0))
    expect(out.every((v) => v === 0 || v === 255)).toBe(true)
    const fraction = out.filter((v) => v === 255).length / out.length
    expect(Math.abs(fraction - 128 / 255)).toBeLessThan(0.05)
  })

  it('keeps solid and empty areas solid and empty', () => {
    const field = grainField(W, H, SETTINGS, 0)
    expect(screenStochastic(new Uint8Array(W * H).fill(255), field).every((v) => v === 255)).toBe(true)
    expect(screenStochastic(new Uint8Array(W * H), field).every((v) => v === 0)).toBe(true)
  })
})
