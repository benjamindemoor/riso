import { describe, expect, it } from 'vitest'
import { deleteRisoPreset, listRisoPresetNames, loadRisoPreset, normalizeRisoState, saveRisoPreset } from './risoPresets.ts'
import { createDefaultRisoState } from './risoState.ts'

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

describe('riso presets', () => {
  it('starts without any presets', () => {
    expect(listRisoPresetNames(fakeStorage())).toEqual([])
  })

  it('lists saved presets alphabetically', () => {
    const storage = fakeStorage()
    saveRisoPreset('zine', createDefaultRisoState(), storage)
    saveRisoPreset('Affiche', createDefaultRisoState(), storage)
    expect(listRisoPresetNames(storage)).toEqual(['Affiche', 'zine'])
  })

  it('saves, loads and deletes a user preset', () => {
    const storage = fakeStorage()
    const state = createDefaultRisoState()
    state.paperHex = '#123456'
    saveRisoPreset('Mine', state, storage)
    expect(listRisoPresetNames(storage)).toContain('Mine')
    const loaded = loadRisoPreset('Mine', storage)!
    expect(loaded.paperHex).toBe('#123456')
    expect(loaded.inks.map((ink) => ink.hex)).toEqual(state.inks.map((ink) => ink.hex))
    deleteRisoPreset('Mine', storage)
    expect(listRisoPresetNames(storage)).not.toContain('Mine')
    expect(loadRisoPreset('Mine', storage)).toBeNull()
  })

  it('loads a copy, so editing it does not change the stored preset', () => {
    const storage = fakeStorage()
    saveRisoPreset('Mine', createDefaultRisoState(), storage)
    const first = loadRisoPreset('Mine', storage)!
    first.inks[0].density = 0.1
    expect(loadRisoPreset('Mine', storage)!.inks[0].density).toBe(1)
  })

  it('returns null for a preset that does not exist', () => {
    expect(loadRisoPreset('nope', fakeStorage())).toBeNull()
  })
})

describe('normalizeRisoState', () => {
  it('backfills missing fields and caps inks/strokes', () => {
    const raw = { inks: [{ hex: '#ff48b0' }, { hex: '#000000' }, { hex: '#ffe800' }, { hex: '#00838a' }, { hex: '#3255a4' }] }
    const state = normalizeRisoState(raw)
    expect(state.inks).toHaveLength(4)
    expect(state.inks[0].density).toBe(1)
    expect(state.inks[0].visible).toBe(true)
    expect(state.strokes).toEqual([])
    expect(state.paperHex).toMatch(/^#[0-9a-f]{6}$/)
    expect(state.grain.amount).toBeGreaterThanOrEqual(0)
  })

  it('falls back to the default state for garbage', () => {
    expect(normalizeRisoState(null).inks.length).toBeGreaterThan(0)
    expect(normalizeRisoState({ inks: [] }).inks.length).toBeGreaterThan(0)
  })
})
