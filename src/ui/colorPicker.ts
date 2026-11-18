/** Display pixels averaged around the cursor (a SAMPLE_RADIUS*2+1 square) — the display copy is
 *  already area-averaged from the full-resolution photo, so this smooths sensor noise/grain into the
 *  color a printer would actually perceive, rather than one possibly off-color pixel. */
const SAMPLE_RADIUS = 2
const LOUPE_SIZE = 132
const LOUPE_PIXELS = 11 // display pixels shown across the loupe

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Opens a modal showing `source` (the original uploaded photo) and resolves with the hex color the
 * user clicks, averaged over a small area — or null if they cancel (Esc / Cancel / backdrop click).
 * Used by Screen Print Export's and Funky Stencils' palettes, for when the auto-extracted ink colors
 * come out too saturated or don't match the photo.
 */
export function pickColorFromImage(source: HTMLCanvasElement): Promise<string | null> {
  const dialog = document.createElement('dialog')
  dialog.id = 'color-picker-dialog'

  const header = document.createElement('div')
  header.className = 'color-picker-header'
  const hint = document.createElement('span')
  hint.textContent = 'Click a color in the photo · Esc to cancel'
  const swatch = document.createElement('span')
  swatch.className = 'color-picker-swatch'
  const hexLabel = document.createElement('code')
  hexLabel.textContent = '—'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = 'Cancel'
  header.append(hint, swatch, hexLabel, cancelButton)

  const stage = document.createElement('div')
  stage.className = 'color-picker-stage'

  // A downscaled copy sized to the dialog — sampling and hovering read from this, never from the
  // (possibly ~100-megapixel) source itself.
  const maxCssWidth = window.innerWidth * 0.9
  const maxCssHeight = window.innerHeight * 0.8 - 48
  const cssScale = Math.min(maxCssWidth / source.width, maxCssHeight / source.height, 1)
  const cssWidth = Math.max(1, Math.round(source.width * cssScale))
  const cssHeight = Math.max(1, Math.round(source.height * cssScale))
  const dpr = window.devicePixelRatio || 1
  const display = document.createElement('canvas')
  display.width = Math.max(1, Math.round(cssWidth * dpr))
  display.height = Math.max(1, Math.round(cssHeight * dpr))
  display.style.width = `${cssWidth}px`
  display.style.height = `${cssHeight}px`
  const displayCtx = display.getContext('2d', { willReadFrequently: true })!
  displayCtx.imageSmoothingQuality = 'high'
  displayCtx.drawImage(source, 0, 0, display.width, display.height)
  const pixels = displayCtx.getImageData(0, 0, display.width, display.height).data

  const loupe = document.createElement('canvas')
  loupe.className = 'color-picker-loupe'
  loupe.width = LOUPE_SIZE
  loupe.height = LOUPE_SIZE
  loupe.hidden = true
  const loupeCtx = loupe.getContext('2d')!
  loupeCtx.imageSmoothingEnabled = false

  stage.append(display, loupe)
  dialog.append(header, stage)
  document.body.append(dialog)

  function sampleAt(x: number, y: number): string {
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy++) {
      for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx++) {
        const px = Math.min(display.width - 1, Math.max(0, x + dx))
        const py = Math.min(display.height - 1, Math.max(0, y + dy))
        const i = (py * display.width + px) * 4
        r += pixels[i]
        g += pixels[i + 1]
        b += pixels[i + 2]
        count++
      }
    }
    return toHex(r / count, g / count, b / count)
  }

  /** Pointer position → display-canvas pixel coordinates. */
  function pointFromEvent(event: PointerEvent): [number, number] {
    const rect = display.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * display.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * display.height)
    return [Math.min(display.width - 1, Math.max(0, x)), Math.min(display.height - 1, Math.max(0, y))]
  }

  function updateHover(event: PointerEvent) {
    const [x, y] = pointFromEvent(event)
    const hex = sampleAt(x, y)
    swatch.style.background = hex
    hexLabel.textContent = hex

    // Magnified view around the cursor, with the sampled area outlined.
    const half = Math.floor(LOUPE_PIXELS / 2)
    const cell = LOUPE_SIZE / LOUPE_PIXELS
    loupeCtx.fillStyle = '#808080'
    loupeCtx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE)
    loupeCtx.drawImage(display, x - half, y - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE_SIZE, LOUPE_SIZE)
    loupeCtx.strokeStyle = '#fff'
    loupeCtx.lineWidth = 2
    loupeCtx.strokeRect((half - SAMPLE_RADIUS) * cell, (half - SAMPLE_RADIUS) * cell, (SAMPLE_RADIUS * 2 + 1) * cell, (SAMPLE_RADIUS * 2 + 1) * cell)
    loupeCtx.strokeStyle = '#000'
    loupeCtx.lineWidth = 1
    loupeCtx.strokeRect((half - SAMPLE_RADIUS) * cell - 1.5, (half - SAMPLE_RADIUS) * cell - 1.5, (SAMPLE_RADIUS * 2 + 1) * cell + 3, (SAMPLE_RADIUS * 2 + 1) * cell + 3)

    // Keep the loupe beside the cursor, flipping sides near the stage's right/bottom edges.
    const stageRect = stage.getBoundingClientRect()
    let left = event.clientX - stageRect.left + 20
    let top = event.clientY - stageRect.top + 20
    if (left + LOUPE_SIZE > stageRect.width) left -= LOUPE_SIZE + 40
    if (top + LOUPE_SIZE > stageRect.height) top -= LOUPE_SIZE + 40
    loupe.style.left = `${left}px`
    loupe.style.top = `${top}px`
    loupe.hidden = false
  }

  return new Promise((resolve) => {
    let picked: string | null = null
    display.addEventListener('pointermove', updateHover)
    display.addEventListener('pointerleave', () => {
      loupe.hidden = true
    })
    display.addEventListener('click', (event) => {
      const [x, y] = pointFromEvent(event as PointerEvent)
      picked = sampleAt(x, y)
      dialog.close()
    })
    cancelButton.addEventListener('click', () => dialog.close())
    // A click on the backdrop lands on the dialog element itself, outside its content.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(picked)
    })
    dialog.showModal()
  })
}
