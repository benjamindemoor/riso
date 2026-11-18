import { RISO_INKS } from './risoInks.ts'
import type { GrainSettings } from './risoGrain.ts'

/** One ink drum in the Riso tab. `id` is stable across edits (used for export order/filenames). */
export interface RisoInkSettings {
  id: string
  hex: string
  /** 0-1.5 (1 = as separated) */
  density: number
  /** -1..1 (0 = unchanged) */
  contrast: number
  /** Misregistration in preview pixels (scaled up for full-resolution exports). */
  offsetX: number
  offsetY: number
  visible: boolean
}

/** An outline printed as its own extra riso drum. */
export interface RisoStroke {
  id: string
  enabled: boolean
  hex: string
  /** What gets outlined: the photo's dark areas, or the coverage of ink N (index into `inks`). */
  source: 'photo' | number
  /** 0-255 — how dark / how much ink a pixel needs to count as "inside" the shape. */
  threshold: number
  /** 1-12 preview pixels. */
  width: number
  distorted: boolean
}

export interface RisoState {
  inks: RisoInkSettings[]
  strokes: RisoStroke[]
  paperHex: string
  grain: GrainSettings
  /** Per-ink print files: smooth greyscale (the riso machine screens it itself) or already
   *  screened to 1-bit with this tab's grain. */
  separationMode: 'continuous' | 'stochastic'
}

export const MAX_RISO_INKS = 4
export const MAX_RISO_STROKES = 3

let nextId = 1
export function newRisoId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${nextId++}`
}

export function risoInkHex(name: string): string {
  return RISO_INKS.find((ink) => ink.name === name)!.hex
}

export function createRisoInk(hex: string, overrides: Partial<Omit<RisoInkSettings, 'id' | 'hex'>> = {}): RisoInkSettings {
  return { id: newRisoId('ink'), hex, density: 1, contrast: 0, offsetX: 0, offsetY: 0, visible: true, ...overrides }
}

export function createRisoStroke(overrides: Partial<Omit<RisoStroke, 'id'>> = {}): RisoStroke {
  return { id: newRisoId('stroke'), enabled: true, hex: risoInkHex('Black'), source: 'photo', threshold: 128, width: 2, distorted: false, ...overrides }
}

export function createDefaultRisoState(): RisoState {
  return {
    inks: [createRisoInk(risoInkHex('Fluorescent Pink')), createRisoInk(risoInkHex('Medium Blue'), { offsetX: 2, offsetY: -2 })],
    strokes: [],
    paperHex: '#f4f0e6',
    grain: { amount: 0.4, size: 1, starvation: 0.25, seed: 1 },
    separationMode: 'continuous',
  }
}
