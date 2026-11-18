import { describe, expect, it } from 'vitest'
import { compositeRiso, coverageToGreyscale } from './risoComposite.ts'

const px = (data: Uint8ClampedArray, i: number) => Array.from(data.slice(i * 4, i * 4 + 4))

describe('compositeRiso', () => {
  it('shows only the paper without layers', () => {
    const out = compositeRiso([], '#f4f0e6', 2, 1)
    expect(px(out, 0)).toEqual([0xf4, 0xf0, 0xe6, 255])
    expect(px(out, 1)).toEqual([0xf4, 0xf0, 0xe6, 255])
  })

  it('prints a full-coverage ink in its own colour on white paper', () => {
    const out = compositeRiso([{ coverage: Uint8Array.from([255]), hex: '#ff48b0', offsetX: 0, offsetY: 0 }], '#ffffff', 1, 1)
    expect(px(out, 0)).toEqual([0xff, 0x48, 0xb0, 255])
  })

  it('multiplies overprinted inks', () => {
    const layers = [
      { coverage: Uint8Array.from([255]), hex: '#ffff00', offsetX: 0, offsetY: 0 },
      { coverage: Uint8Array.from([255]), hex: '#00ffff', offsetX: 0, offsetY: 0 },
    ]
    expect(px(compositeRiso(layers, '#ffffff', 1, 1), 0)).toEqual([0, 255, 0, 255])
  })

  it('shifts a layer by its offset and leaves the vacated area ink-free', () => {
    const out = compositeRiso([{ coverage: Uint8Array.from([255, 0, 0]), hex: '#000000', offsetX: 1, offsetY: 0 }], '#ffffff', 3, 1)
    expect(px(out, 0)).toEqual([255, 255, 255, 255])
    expect(px(out, 1)).toEqual([0, 0, 0, 255])
  })

  it('does not throw on offsets larger than the image', () => {
    const out = compositeRiso([{ coverage: Uint8Array.from([255, 255]), hex: '#000000', offsetX: 10000, offsetY: -10000 }], '#ffffff', 2, 1)
    expect(px(out, 0)).toEqual([255, 255, 255, 255])
  })
})

describe('coverageToGreyscale', () => {
  it('maps full ink to black and no ink to white, opaque', () => {
    const out = coverageToGreyscale(Uint8Array.from([255, 0]))
    expect(px(out, 0)).toEqual([0, 0, 0, 255])
    expect(px(out, 1)).toEqual([255, 255, 255, 255])
  })
})
