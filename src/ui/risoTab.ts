import { RISO_INKS, findRisoInk } from '../riso/risoInks.ts'
import {
  MAX_RISO_INKS,
  MAX_RISO_STROKES,
  createRisoInk,
  createRisoStroke,
  type RisoInkSettings,
  type RisoState,
  type RisoStroke,
} from '../riso/risoState.ts'

export type { RisoInkSettings, RisoState, RisoStroke } from '../riso/risoState.ts'
export { createDefaultRisoState } from '../riso/risoState.ts'

/** Human-readable name for an ink's colour — the built-in ink's name, or "Custom #rrggbb". */
export function risoInkLabel(hex: string): string {
  return findRisoInk(hex)?.name ?? `Custom ${hex}`
}

export interface RisoCallbacks {
  /** A cheap change (density, contrast, offset, visibility, grain) — re-composite only. */
  onSettle: () => void
  /** The ink set, an ink colour or the paper changed — the separation has to be solved again. */
  onInksChanged: () => void
  onFileChosen: (file: File) => void
  onDownload: () => void
  onDownloadSeparations: () => void
  onSaveToLibrary: () => void
  /** Lets the user click a colour in the original photo; resolves null if they cancel. */
  onPickColor: () => Promise<string | null>
  onSurprise: () => void
  onSavePreset: (name: string) => void
  onApplyPreset: (name: string) => void
  onDeletePreset: (name: string) => void
}

export interface RisoUiState {
  canSaveToLibrary: boolean
  /** False in the standalone Riso app, which has no library — hides the save button entirely. */
  showSaveToLibrary?: boolean
  presetNames: string[]
  /** The preset last applied or saved — stays selected in the dropdown. */
  activePreset: string | null
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function fieldRow(labelText: string, ...controls: HTMLElement[]): HTMLElement {
  const row = document.createElement('div')
  row.className = 'field-row'
  const label = document.createElement('span')
  label.className = 'field-label'
  label.textContent = labelText
  row.append(label, ...controls)
  return row
}

function sliderField(min: number, max: number, value: number, title: string, onSettle: (value: number) => void): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.className = 'slider-field'
  const range = document.createElement('input')
  range.type = 'range'
  range.min = String(min)
  range.max = String(max)
  range.value = String(value)
  range.title = title
  const number = document.createElement('input')
  number.type = 'number'
  number.min = String(min)
  number.max = String(max)
  number.value = String(value)
  number.title = title
  range.addEventListener('input', () => {
    number.value = range.value
  })
  range.addEventListener('change', () => onSettle(Number(range.value)))
  number.addEventListener('change', () => {
    const clamped = Math.max(min, Math.min(max, Number(number.value) || 0))
    number.value = String(clamped)
    range.value = String(clamped)
    onSettle(clamped)
  })
  wrapper.append(range, number)
  return wrapper
}

/** Colour input + hex text + eyedropper; calls onChange(hex) once the edit settles. */
function colorField(initial: string, title: string, onChange: (hex: string) => void, onPick?: () => Promise<string | null>): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.className = 'color-field'
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.title = title
  colorInput.value = initial
  const hexInput = document.createElement('input')
  hexInput.type = 'text'
  hexInput.className = 'hex-input'
  hexInput.title = title + ' (hex)'
  hexInput.value = initial
  hexInput.maxLength = 7
  hexInput.spellcheck = false
  colorInput.addEventListener('input', () => {
    hexInput.value = colorInput.value
  })
  colorInput.addEventListener('change', () => onChange(colorInput.value.toLowerCase()))
  hexInput.addEventListener('change', () => {
    const value = hexInput.value.trim().startsWith('#') ? hexInput.value.trim() : '#' + hexInput.value.trim()
    if (HEX_RE.test(value)) onChange(value.toLowerCase())
    else hexInput.value = colorInput.value
  })
  wrapper.append(colorInput, hexInput)
  if (onPick) {
    const pickButton = document.createElement('button')
    pickButton.type = 'button'
    pickButton.className = 'pick-color-button'
    pickButton.textContent = '🎯'
    pickButton.title = 'Pick this color from the original photo'
    pickButton.addEventListener('click', async () => {
      const picked = await onPick()
      if (picked) onChange(picked.toLowerCase())
    })
    wrapper.append(pickButton)
  }
  return wrapper
}

function sectionTitle(text: string): HTMLElement {
  const title = document.createElement('p')
  title.className = 'section-title'
  title.textContent = text
  return title
}

/** Dropdown of the built-in riso inks (plus a "Custom" entry for any other colour). */
function inkSelect(currentHex: string, onChange: (hex: string) => void): HTMLSelectElement {
  const select = document.createElement('select')
  for (const option of RISO_INKS) {
    const el = document.createElement('option')
    el.value = option.hex
    el.textContent = option.name
    select.append(el)
  }
  const builtIn = findRisoInk(currentHex)
  if (!builtIn) {
    const custom = document.createElement('option')
    custom.value = currentHex
    custom.textContent = `Custom ${currentHex}`
    select.append(custom)
  }
  select.value = builtIn ? builtIn.hex : currentHex
  select.addEventListener('change', () => onChange(select.value))
  return select
}

function checkbox(text: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  input.addEventListener('change', () => onChange(input.checked))
  label.append(input, document.createTextNode(' ' + text))
  return label
}

function createInkEditor(state: RisoState, ink: RisoInkSettings, index: number, callbacks: RisoCallbacks): HTMLElement {
  const section = document.createElement('div')
  section.className = 'riso-ink'
  section.append(sectionTitle(`Ink ${index + 1}`))

  const setHex = (hex: string) => {
    if (hex === ink.hex) return
    ink.hex = hex
    callbacks.onInksChanged()
  }
  section.append(fieldRow('Ink', inkSelect(ink.hex, setHex)))
  section.append(fieldRow('Color', colorField(ink.hex, 'Ink color', setHex, callbacks.onPickColor)))

  section.append(
    fieldRow(
      'Density %',
      sliderField(0, 150, Math.round(ink.density * 100), 'How much of this ink goes down (100 = as separated)', (v) => {
        ink.density = v / 100
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Contrast',
      sliderField(-100, 100, Math.round(ink.contrast * 100), 'Pushes this ink toward solid/blank (positive) or flattens it (negative)', (v) => {
        ink.contrast = v / 100
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Offset X',
      sliderField(-20, 20, ink.offsetX, 'Misregistration of this drum, horizontally (preview pixels)', (v) => {
        ink.offsetX = v
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Offset Y',
      sliderField(-20, 20, ink.offsetY, 'Misregistration of this drum, vertically (preview pixels)', (v) => {
        ink.offsetY = v
        callbacks.onSettle()
      }),
    ),
  )

  const visibleLabel = checkbox('Print this ink', ink.visible, (checked) => {
    ink.visible = checked
    callbacks.onSettle()
  })

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.textContent = '✕ Remove'
  remove.disabled = state.inks.length <= 1
  remove.title = remove.disabled ? 'At least one ink is needed' : 'Remove this ink'
  remove.addEventListener('click', () => {
    state.inks.splice(index, 1)
    // Strokes outlining an ink point at it by index — keep them pointing at the same ink.
    for (const stroke of state.strokes) {
      if (stroke.source === index) stroke.source = 'photo'
      else if (typeof stroke.source === 'number' && stroke.source > index) stroke.source--
    }
    callbacks.onInksChanged()
  })
  section.append(fieldRow('', visibleLabel, remove))
  return section
}

function createStrokeEditor(state: RisoState, stroke: RisoStroke, index: number, callbacks: RisoCallbacks): HTMLElement {
  const section = document.createElement('div')
  section.className = 'riso-ink'
  section.append(sectionTitle(`Stroke ${index + 1}`))

  const setHex = (hex: string) => {
    stroke.hex = hex
    callbacks.onSettle()
  }
  section.append(fieldRow('Ink', inkSelect(stroke.hex, setHex)), fieldRow('Color', colorField(stroke.hex, 'Stroke color', setHex, callbacks.onPickColor)))

  const sourceSelect = document.createElement('select')
  const photoOption = document.createElement('option')
  photoOption.value = 'photo'
  photoOption.textContent = 'Dark areas of the photo'
  sourceSelect.append(photoOption)
  state.inks.forEach((ink, inkIndex) => {
    const option = document.createElement('option')
    option.value = String(inkIndex)
    option.textContent = `Ink ${inkIndex + 1} (${risoInkLabel(ink.hex)})`
    sourceSelect.append(option)
  })
  sourceSelect.value = String(stroke.source)
  sourceSelect.addEventListener('change', () => {
    stroke.source = sourceSelect.value === 'photo' ? 'photo' : Number(sourceSelect.value)
    callbacks.onSettle()
  })

  section.append(
    fieldRow('Outline', sourceSelect),
    fieldRow(
      'Threshold',
      sliderField(0, 255, stroke.threshold, 'How dark (or how much ink) a pixel needs to count as inside the outlined shape', (v) => {
        stroke.threshold = v
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Width',
      sliderField(1, 12, stroke.width, 'Line thickness (preview pixels)', (v) => {
        stroke.width = v
        callbacks.onSettle()
      }),
    ),
  )

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.textContent = '✕ Remove'
  remove.addEventListener('click', () => {
    state.strokes.splice(index, 1)
    callbacks.onSettle()
  })
  section.append(
    fieldRow(
      '',
      checkbox('Print', stroke.enabled, (checked) => {
        stroke.enabled = checked
        callbacks.onSettle()
      }),
      checkbox('Glitch', stroke.distorted, (checked) => {
        stroke.distorted = checked
        callbacks.onSettle()
      }),
      remove,
    ),
  )
  return section
}

function createPresetSection(ui: RisoUiState, callbacks: RisoCallbacks): HTMLElement[] {
  const select = document.createElement('select')
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = ui.presetNames.length === 0 ? 'No presets saved yet' : 'Choose a preset…'
  select.append(placeholder)
  for (const name of ui.presetNames) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    select.append(option)
  }
  select.value = ui.activePreset && ui.presetNames.includes(ui.activePreset) ? ui.activePreset : ''
  select.disabled = ui.presetNames.length === 0
  select.title = 'Picking a preset applies it right away'
  // Choosing applies immediately — no separate Apply step to forget.
  select.addEventListener('change', () => {
    if (select.value) callbacks.onApplyPreset(select.value)
  })

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.textContent = '🗑'
  remove.disabled = !select.value
  remove.title = remove.disabled ? 'Pick a preset to delete it' : 'Delete this preset'
  remove.addEventListener('click', () => {
    if (select.value && confirm(`Delete preset "${select.value}"?`)) callbacks.onDeletePreset(select.value)
  })

  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.placeholder = 'Preset name'
  nameInput.value = ui.activePreset ?? ''
  const save = document.createElement('button')
  save.type = 'button'
  save.textContent = '💾 Save'
  save.title = 'Saves the current inks, strokes, paper and grain as a preset in this browser'
  const doSave = () => {
    const name = nameInput.value.trim()
    if (!name) {
      nameInput.focus()
      return
    }
    if (ui.presetNames.includes(name) && !confirm(`Overwrite preset "${name}"?`)) return
    callbacks.onSavePreset(name)
  }
  save.addEventListener('click', doSave)
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSave()
  })

  return [sectionTitle('Presets'), fieldRow('Preset', select, remove), fieldRow('Save as', nameInput, save)]
}

export function renderRisoSidebar(container: HTMLElement, state: RisoState, ui: RisoUiState, callbacks: RisoCallbacks) {
  const previousScrollTop = container.querySelector('.sidebar-scroll')?.scrollTop ?? 0
  container.innerHTML = ''

  const uploadRow = document.createElement('div')
  uploadRow.className = 'field-row'
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/png,image/jpeg'
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) callbacks.onFileChosen(file)
  })
  uploadRow.append(fileInput)

  const intro = document.createElement('p')
  intro.className = 'section-caption'
  intro.textContent =
    'Separates the photo into 1-4 Risograph inks, overprinted with grain and misregistration. Each ink also exports as its own greyscale print file.'

  const surpriseButton = document.createElement('button')
  surpriseButton.type = 'button'
  surpriseButton.className = 'riso-surprise'
  surpriseButton.textContent = '🎲 Surprise riso'
  surpriseButton.title = 'Random inks, paper, grain and misregistration (and sometimes an outline)'
  surpriseButton.addEventListener('click', callbacks.onSurprise)

  const scroll = document.createElement('div')
  scroll.className = 'sidebar-scroll'
  scroll.append(uploadRow, intro, surpriseButton, ...createPresetSection(ui, callbacks))

  state.inks.forEach((ink, index) => scroll.append(createInkEditor(state, ink, index, callbacks)))

  const addButton = document.createElement('button')
  addButton.type = 'button'
  addButton.textContent = '+ Add ink'
  addButton.disabled = state.inks.length >= MAX_RISO_INKS
  addButton.title = addButton.disabled ? `At most ${MAX_RISO_INKS} inks` : 'Add another ink drum'
  addButton.addEventListener('click', () => {
    const used = new Set(state.inks.map((ink) => ink.hex))
    const hex = (RISO_INKS.find((ink) => !used.has(ink.hex)) ?? RISO_INKS[0]).hex
    state.inks.push(createRisoInk(hex))
    callbacks.onInksChanged()
  })
  scroll.append(addButton)

  scroll.append(sectionTitle('Strokes'))
  const strokeCaption = document.createElement('p')
  strokeCaption.className = 'section-caption'
  strokeCaption.textContent = 'Outlines printed as their own extra ink drum — around the dark parts of the photo, or around one of the inks.'
  scroll.append(strokeCaption)
  state.strokes.forEach((stroke, index) => scroll.append(createStrokeEditor(state, stroke, index, callbacks)))
  const addStrokeButton = document.createElement('button')
  addStrokeButton.type = 'button'
  addStrokeButton.textContent = '+ Add stroke'
  addStrokeButton.disabled = state.strokes.length >= MAX_RISO_STROKES
  addStrokeButton.title = addStrokeButton.disabled ? `At most ${MAX_RISO_STROKES} strokes` : 'Add an outline'
  addStrokeButton.addEventListener('click', () => {
    state.strokes.push(createRisoStroke())
    callbacks.onSettle()
  })
  scroll.append(addStrokeButton)

  scroll.append(
    sectionTitle('Paper & grain'),
    fieldRow(
      'Paper',
      colorField(state.paperHex, 'Paper color', (hex) => {
        if (hex === state.paperHex) return
        state.paperHex = hex
        callbacks.onInksChanged()
      }),
    ),
    fieldRow(
      'Grain %',
      sliderField(0, 100, Math.round(state.grain.amount * 100), 'How grainy the ink laydown is (0 = perfectly smooth)', (v) => {
        state.grain.amount = v / 100
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Grain size',
      sliderField(1, 4, state.grain.size, 'Size of the grain specks (preview pixels)', (v) => {
        state.grain.size = v
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Patchiness %',
      sliderField(0, 100, Math.round(state.grain.starvation * 100), 'Uneven, patchy ink coverage like a real drum running dry', (v) => {
        state.grain.starvation = v / 100
        callbacks.onSettle()
      }),
    ),
    fieldRow(
      'Seed',
      sliderField(1, 999, state.grain.seed, 'Changes the random grain pattern', (v) => {
        state.grain.seed = v
        callbacks.onSettle()
      }),
    ),
  )

  const modeSelect = document.createElement('select')
  for (const [value, label] of [
    ['continuous', 'Greyscale (the riso screens it)'],
    ['stochastic', 'Pre-screened with grain (1-bit)'],
  ] as const) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    modeSelect.append(option)
  }
  modeSelect.value = state.separationMode
  modeSelect.addEventListener('change', () => {
    state.separationMode = modeSelect.value as RisoState['separationMode']
  })
  scroll.append(sectionTitle('Print files'), fieldRow('Per-ink files', modeSelect))

  const actions = document.createElement('div')
  actions.className = 'sidebar-actions'

  const downloadButton = document.createElement('button')
  downloadButton.type = 'button'
  downloadButton.textContent = '⬇️ Download PNG'
  downloadButton.addEventListener('click', callbacks.onDownload)

  const separationsButton = document.createElement('button')
  separationsButton.type = 'button'
  separationsButton.textContent = '⬇️ Download PNG per ink'
  separationsButton.title = 'One greyscale 300 DPI PNG per printed ink (black = full ink), ready for a Risograph'
  separationsButton.addEventListener('click', callbacks.onDownloadSeparations)

  const saveButton = document.createElement('button')
  saveButton.type = 'button'
  saveButton.textContent = '💾 Save to library'
  saveButton.disabled = !ui.canSaveToLibrary
  saveButton.title = ui.canSaveToLibrary
    ? 'Saves this result to the library folder you connected in the Threshold tab'
    : 'Connect a library folder in the Threshold tab first'
  saveButton.addEventListener('click', callbacks.onSaveToLibrary)

  actions.append(downloadButton, separationsButton)
  if (ui.showSaveToLibrary !== false) actions.append(saveButton)

  container.append(scroll, actions)
  scroll.scrollTop = previousScrollTop
}
