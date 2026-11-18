export type BlendMode = 'cmyk' | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference'

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'cmyk', label: 'CMYK Ink' },
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'difference', label: 'Difference' },
]

/** Blends one 0-255 channel value of a new pixel (`top`) onto what's already there (`base`). */
export function blendChannel(base: number, top: number, mode: BlendMode): number {
  if (mode === 'normal') return top

  const b = base / 255
  const t = top / 255
  let result: number

  switch (mode) {
    case 'cmyk':
      // Per-channel ink density sum, clamped: treats each RGB channel as the inverse of an
      // ink's coverage (R↔cyan, G↔magenta, B↔yellow) and adds density rather than multiplying
      // transmittance — closer to real overlapping screen-print ink than Multiply's soft blend.
      result = b + t - 1
      break
    case 'multiply':
      result = b * t
      break
    case 'screen':
      result = 1 - (1 - b) * (1 - t)
      break
    case 'overlay':
      result = b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t)
      break
    case 'darken':
      result = Math.min(b, t)
      break
    case 'lighten':
      result = Math.max(b, t)
      break
    case 'difference':
      result = Math.abs(b - t)
      break
  }

  return Math.round(Math.min(1, Math.max(0, result)) * 255)
}
