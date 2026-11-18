import { computeRisoCoverage } from '../riso/risoSeparation.ts'
import { adjustCoverage } from '../riso/risoAdjust.ts'
import { applyGrain, grainField, screenStochastic } from '../riso/risoGrain.ts'
import { compositeRiso, coverageToGreyscale, type RisoLayer } from '../riso/risoComposite.ts'
import { photoDarkness, strokeCoverage } from '../riso/risoStrokes.ts'
import { surpriseRiso } from '../riso/risoSurprise.ts'
import { deleteRisoPreset, listRisoPresetNames, loadRisoPreset, saveRisoPreset } from '../riso/risoPresets.ts'
import { createDefaultRisoState, type RisoState } from '../riso/risoState.ts'
import { yieldToBrowser } from '../cmyk/asyncUtil.ts'
import { buildPngAtDpi, downloadBlob } from '../export.ts'
import { createZoomToolbar } from './zoomToolbar.ts'
import { withBusyOverlay } from './busyOverlay.ts'
import { pickColorFromImage } from './colorPicker.ts'
import { renderRisoSidebar, risoInkLabel } from './risoTab.ts'

/** Live preview is capped like Posterize/Airbrush; exports re-render at full resolution. */
const MAX_RISO_PREVIEW_DIMENSION = 1200
const RISO_EXPORT_DPI = 300
/** Grain fields for strokes use their own index range so they never share an ink's grain. */
const STROKE_GRAIN_INDEX_BASE = 100

export interface RisoControllerDeps {
  sidebarEl: HTMLElement
  mainEl: HTMLElement
  canvas: HTMLCanvasElement
  /** The shared working photo (main.ts's sourceCanvas). */
  source: HTMLCanvasElement
  displayMax: number
  downscale: (source: HTMLCanvasElement, maxDimension: number) => HTMLCanvasElement
  canSaveToLibrary: () => boolean
  /** Loads a picked file as the shared working photo (main.ts's loadImageFile + handleImageLoaded). */
  loadFile: (file: File) => Promise<boolean>
  saveToLibrary: (blob: Blob) => Promise<void>
  /** False for the standalone Riso app (no library folder at all). Defaults to true. */
  libraryAvailable?: boolean
  /** Called after every preview render (the standalone app uses it to hide its upload hint). */
  onRendered?: () => void
}

export interface RisoController {
  /** The shared photo changed — the separation has to be solved again next render. */
  markPhotoChanged: () => void
  /** Called whenever the Riso tab is shown or its photo was just (re)loaded while it's open. */
  show: () => void
  refreshSidebar: () => void
}

/** Everything one render (preview or full resolution) needs about the photo. */
interface Separation {
  width: number
  height: number
  /** Per ink, as solved (before density/contrast). */
  coverage: Uint8Array[]
  /** The photo's darkness — the source for "photo" strokes. */
  darkness: Uint8Array
}

/** One printed drum: an ink or a stroke. */
interface Drum {
  label: string
  layer: RisoLayer
  /** Coverage before grain — what continuous-tone print files contain. */
  clean: Uint8Array
  grainIndex: number
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function createRisoController(deps: RisoControllerDeps): RisoController {
  let state: RisoState = createDefaultRisoState()
  /** The preset last applied or saved, kept selected in the sidebar's dropdown. */
  let activePreset: string | null = null
  const zoom = createZoomToolbar(deps.mainEl)
  deps.canvas.before(zoom.toolbar)

  let photoVersion = 0
  let preview: Separation | null = null
  let previewKey = ''

  const hasImage = () => deps.source.width > 0 && deps.source.height > 0
  const separationKey = () => `${photoVersion}|${state.inks.map((ink) => ink.hex).join(',')}|${state.paperHex}`

  function separate(canvas: HTMLCanvasElement): Separation {
    const { width, height } = canvas
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height)
    return {
      width,
      height,
      coverage: computeRisoCoverage({ data: pixels.data, width, height }, state.inks.map((ink) => ink.hex), state.paperHex),
      darkness: photoDarkness(pixels.data, width * height),
    }
  }

  /** Every printed drum for `sep` — inks first, then strokes on top. `scale` = this render's width
   *  ÷ the preview's width, so grain, offsets and stroke widths stay the same relative size. */
  function buildDrums(sep: Separation, scale: number, withGrain: boolean): Drum[] {
    const { width, height } = sep
    const adjusted = state.inks.map((ink, index) => adjustCoverage(sep.coverage[index], ink.density, ink.contrast))
    const drums: Drum[] = []
    const grained = (clean: Uint8Array, grainIndex: number) =>
      withGrain && state.grain.amount > 0 ? applyGrain(clean, grainField(width, height, state.grain, grainIndex, scale), state.grain.amount) : clean

    state.inks.forEach((ink, index) => {
      if (!ink.visible) return
      const clean = adjusted[index]
      drums.push({
        label: `${index + 1}-${slug(risoInkLabel(ink.hex))}`,
        clean,
        grainIndex: index,
        layer: { coverage: grained(clean, index), hex: ink.hex, offsetX: ink.offsetX * scale, offsetY: ink.offsetY * scale },
      })
    })

    state.strokes.forEach((stroke, index) => {
      if (!stroke.enabled) return
      const tone = stroke.source === 'photo' ? sep.darkness : adjusted[stroke.source]
      if (!tone) return
      const clean = strokeCoverage(tone, width, height, {
        threshold: stroke.threshold,
        width: Math.max(1, Math.round(stroke.width * scale)),
        distorted: stroke.distorted,
        seed: state.grain.seed * 31 + index + 1,
      })
      const grainIndex = STROKE_GRAIN_INDEX_BASE + index
      drums.push({
        label: `stroke-${index + 1}-${slug(risoInkLabel(stroke.hex))}`,
        clean,
        grainIndex,
        layer: { coverage: grained(clean, grainIndex), hex: stroke.hex, offsetX: 0, offsetY: 0 },
      })
    })
    return drums
  }

  function ensurePreview(): Separation {
    if (!preview || previewKey !== separationKey()) {
      preview = separate(deps.downscale(deps.source, MAX_RISO_PREVIEW_DIMENSION))
      previewKey = separationKey()
    }
    return preview
  }

  function render() {
    if (!hasImage()) return
    const sep = ensurePreview()
    const { width, height } = sep
    const rgba = compositeRiso(
      buildDrums(sep, 1, true).map((drum) => drum.layer),
      state.paperHex,
      width,
      height,
    )
    deps.canvas.width = width
    deps.canvas.height = height
    deps.canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    zoom.apply(deps.canvas, Math.min(1, deps.displayMax / Math.max(width, height)))
    deps.onRendered?.()
  }

  /** The full-resolution separation plus the scale factor relative to the preview. */
  function fullRes(): { sep: Separation; scale: number } {
    const sep = separate(deps.source)
    const previewWidth = ensurePreview().width
    return { sep, scale: sep.width / previewWidth }
  }

  function renderFullResCanvas(): HTMLCanvasElement {
    const { sep, scale } = fullRes()
    const canvas = document.createElement('canvas')
    canvas.width = sep.width
    canvas.height = sep.height
    const rgba = compositeRiso(
      buildDrums(sep, scale, true).map((drum) => drum.layer),
      state.paperHex,
      sep.width,
      sep.height,
    )
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), sep.width, sep.height), 0, 0)
    return canvas
  }

  /** Re-renders, with a busy overlay only when the expensive separation has to be redone. */
  function rerender() {
    if (!hasImage()) return
    if (previewKey !== separationKey()) void withBusyOverlay(deps.mainEl, 'Separating inks…', render)
    else render()
  }

  function applyState(next: RisoState) {
    state = next
    refreshSidebar()
    rerender()
  }

  function refreshSidebar() {
    renderRisoSidebar(
      deps.sidebarEl,
      state,
      { canSaveToLibrary: deps.canSaveToLibrary() && hasImage(), showSaveToLibrary: deps.libraryAvailable !== false, presetNames: listRisoPresetNames(), activePreset },
      {
        onSettle: () => {
          refreshSidebar()
          rerender()
        },
        onInksChanged: () => {
          refreshSidebar()
          rerender()
        },
        onFileChosen: async (file) => {
          if (await deps.loadFile(file)) show()
        },
        onPickColor: () => pickColorFromImage(deps.source),
        onSurprise: () => {
          activePreset = null
          applyState(surpriseRiso())
        },
        onSavePreset: (name) => {
          saveRisoPreset(name, state)
          activePreset = name
          refreshSidebar()
        },
        onApplyPreset: (name) => {
          const preset = loadRisoPreset(name)
          if (!preset) return
          activePreset = name
          applyState(preset)
        },
        onDeletePreset: (name) => {
          deleteRisoPreset(name)
          if (activePreset === name) activePreset = null
          refreshSidebar()
        },
        onDownload: () => {
          if (!hasImage()) return
          void withBusyOverlay(deps.mainEl, 'Rendering full resolution…', () => {
            downloadBlob(buildPngAtDpi(renderFullResCanvas(), RISO_EXPORT_DPI), 'riso.png')
          })
        },
        onDownloadSeparations: () => {
          if (!hasImage()) return
          void withBusyOverlay(deps.mainEl, 'Rendering print files…', async () => {
            const { sep, scale } = fullRes()
            // Print files carry no misregistration (the machine adds its own) and, in continuous
            // mode, no grain either — the drum's own screening provides it.
            for (const drum of buildDrums(sep, scale, false)) {
              await yieldToBrowser()
              let cov = drum.clean
              if (state.separationMode === 'stochastic') {
                const field = grainField(sep.width, sep.height, state.grain, drum.grainIndex, scale)
                if (state.grain.amount > 0) cov = applyGrain(cov, field, state.grain.amount)
                cov = screenStochastic(cov, field)
              }
              const canvas = document.createElement('canvas')
              canvas.width = sep.width
              canvas.height = sep.height
              canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(coverageToGreyscale(cov)), sep.width, sep.height), 0, 0)
              downloadBlob(buildPngAtDpi(canvas, RISO_EXPORT_DPI), `riso-${drum.label}.png`)
            }
          })
        },
        onSaveToLibrary: () => {
          if (!hasImage() || !deps.canSaveToLibrary()) return
          void withBusyOverlay(deps.mainEl, 'Saving…', () => deps.saveToLibrary(buildPngAtDpi(renderFullResCanvas(), RISO_EXPORT_DPI)))
        },
      },
    )
  }

  function show() {
    refreshSidebar()
    rerender()
  }

  return {
    markPhotoChanged: () => {
      photoVersion++
      preview = null
    },
    show,
    refreshSidebar,
  }
}
