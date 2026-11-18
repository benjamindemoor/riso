import type { BlendMode } from './blend.ts'
import { normalizeStrokes, type StrokeConfig } from './stroke.ts'

export interface ThresholdLayer {
  id: number
  /** How this layer's fill composites onto whatever is already painted beneath it. */
  blendMode: BlendMode
  /** Range this layer applies to (inclusive), independent of any other layer.
   *  Set to [0, 255] for a layer that should apply everywhere regardless of tone/channel value. */
  rangeStart: number
  rangeEnd: number
  /** When false, this layer contributes nothing at all (no fill, no pattern, no stroke). */
  enabled: boolean
  color: string
  /** When true, paints this layer's active pixels with the source photo's own color at that
   *  pixel instead of `color` — a "keep as photo" cutout for this tonal range. Mutually
   *  exclusive with patternId (there's no fixed color to dither between two colors). */
  useOriginalColor: boolean
  /** When true, dithers between the colors in `paletteColors` (ordered/Bayer-style, generalized
   *  to N colors instead of 2) based on tone, instead of a fixed color/pattern. Mutually exclusive
   *  with patternId and useOriginalColor. */
  useColorPalette: boolean
  /** Which dithering technique drives the palette when `useColorPalette` is on. */
  paletteAlgorithm: 'bayer' | 'floyd-steinberg'
  paletteColors: string[]
  /** When true, paints `color` with soft, blurred Floyd-Steinberg dots (a per-pixel coverage
   *  value, not a hard mask) instead of a fixed pattern — an airbrush/spray-can look. Mutually
   *  exclusive with patternId/useColorPalette/useOriginalColor, same as those are with each other. */
  useAirbrush: boolean
  /** Blur radius (px) applied to the dot mask before painting — bigger = softer, more merged
   *  blobs; 0 = crisp dots (functionally identical to the regular Floyd-Steinberg pattern). */
  airbrushSoftness: number
  /** Registered pattern id, or undefined for a solid fill. */
  patternId?: string
  /** Size/scale knob for patterns that use one (Pixelated's block size, Noise's grain size). */
  patternSize: number
  /** Color used for the pattern's "off" pixels (only relevant when patternId is set). */
  secondaryColor: string
  /** When false, a pattern's "off" pixels are left untouched (transparent) instead of painted
   *  secondaryColor — useful so a layer's texture doesn't erase the layer(s) stacked beneath it. */
  secondaryColorEnabled: boolean
  /** Soft box-blur radius (px) applied to this layer's threshold detection — 0 = off. */
  blur: number
  /** Hard-edged mosaic block size (px), Photoshop "Mosaic"-style — 0 = off. Applied before blur. */
  mosaic: number
  /** When true, this layer's tonal test runs on an embossed version of the photo instead of its
   *  plain luminance: each pixel is compared to a copy shifted by (embossOffsetX, embossOffsetY),
   *  so flat areas go neutral gray and edges show up as a lit ridge on one side and a shadow on
   *  the other — the shift vector controls the shadow's direction/strength. Combines freely with
   *  everything else (patterns, palette, original-color, ...) since it only changes what "tone"
   *  means here. */
  useEdgeDetection: boolean
  embossOffsetX: number
  embossOffsetY: number
  /** Shifts this layer's rendered result by this many pixels — simulates a screen-print
   *  registration misalignment. Manually set, not randomized. */
  offsetX: number
  offsetY: number
  /** Stacked outline strokes — each its own color/width/pixelation, drawn in order. */
  strokes: StrokeConfig[]
}

export const MAX_LAYERS = 4

const DEFAULT_COLORS = ['#000000', '#ff0000', '#0066ff', '#00aa44', '#ff9900', '#aa00ff']

let nextId = 1

/** Old exports/presets stored a single `value` (a shared-boundary threshold) instead of a range. */
type LegacyOverrides = Partial<Omit<ThresholdLayer, 'id'>> & { value?: number }

export function createLayer(overrides: LegacyOverrides = {}): ThresholdLayer {
  const { value, ...rest } = overrides
  const migratedRange = value !== undefined ? { rangeStart: value, rangeEnd: 255 } : {}

  const layer: ThresholdLayer = {
    id: nextId++,
    blendMode: 'normal',
    rangeStart: 64,
    rangeEnd: 192,
    enabled: true,
    color: DEFAULT_COLORS[0],
    useOriginalColor: false,
    useColorPalette: false,
    paletteAlgorithm: 'bayer',
    paletteColors: ['#000000', '#ffffff'],
    useAirbrush: false,
    airbrushSoftness: 3,
    patternSize: 8,
    secondaryColor: '#ffffff',
    secondaryColorEnabled: true,
    blur: 0,
    mosaic: 0,
    useEdgeDetection: false,
    embossOffsetX: 2,
    embossOffsetY: 2,
    offsetX: 0,
    offsetY: 0,
    strokes: [],
    ...migratedRange,
    ...rest,
  }
  // Backfill fields for strokes loaded from a preset/IndexedDB entry saved before strokes had
  // ids (Fase 29) or the "distorted" toggle (Fase 30).
  layer.strokes = normalizeStrokes(layer.strokes)
  return layer
}

export function createInitialLayers(): ThresholdLayer[] {
  nextId = 1
  return [createLayer({ rangeStart: 128, rangeEnd: 255 })]
}

// Layers are independent: each owns its own [rangeStart, rangeEnd] and never affects any other
// layer. Array order is purely paint/stacking order (like Photoshop layers — later paints over
// earlier), freely reorderable via moveLayer() (drag handle in the UI), never auto-derived from
// range values.

export function addLayer(layers: ThresholdLayer[]): ThresholdLayer[] {
  if (layers.length >= MAX_LAYERS) return layers
  const color = DEFAULT_COLORS[layers.length % DEFAULT_COLORS.length]
  return [...layers, createLayer({ color })]
}

export function removeLayer(layers: ThresholdLayer[], id: number): ThresholdLayer[] {
  if (layers.length <= 1) return layers
  return layers.filter((layer) => layer.id !== id)
}

/** Moves the dragged layer to just before the target layer (drag-handle reordering in the UI). */
export function moveLayer(layers: ThresholdLayer[], draggedId: number, targetId: number): ThresholdLayer[] {
  if (draggedId === targetId) return layers
  const fromIndex = layers.findIndex((layer) => layer.id === draggedId)
  if (fromIndex === -1) return layers

  const next = [...layers]
  const [dragged] = next.splice(fromIndex, 1)
  const targetIndex = next.findIndex((layer) => layer.id === targetId)
  if (targetIndex === -1) return layers
  next.splice(targetIndex, 0, dragged)
  return next
}
