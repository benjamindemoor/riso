import '../src/style.css'
import './style.css'
import { createRisoController } from '../src/ui/risoController.ts'

/** Same preview size the full generator uses for its canvases. */
const DISPLAY_MAX = 600

const source = document.createElement('canvas')
// A fresh canvas is 300x150 by default — the controller treats any non-empty source as "a photo is
// loaded", so start at 0x0 until the user actually uploads something.
source.width = 0
source.height = 0
const mainEl = document.querySelector<HTMLElement>('#riso-main')!
const fileInput = document.querySelector<HTMLInputElement>('#riso-file-input')!

function downscale(canvas: HTMLCanvasElement, maxDimension: number): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height)
  if (longest <= maxDimension) return canvas
  const scale = maxDimension / longest
  const scaled = document.createElement('canvas')
  scaled.width = Math.max(1, Math.round(canvas.width * scale))
  scaled.height = Math.max(1, Math.round(canvas.height * scale))
  scaled.getContext('2d')!.drawImage(canvas, 0, 0, scaled.width, scaled.height)
  return scaled
}

async function loadFile(file: File): Promise<boolean> {
  if (!file.type.startsWith('image/')) return false
  try {
    const bitmap = await createImageBitmap(file)
    source.width = bitmap.width
    source.height = bitmap.height
    source.getContext('2d')!.drawImage(bitmap, 0, 0)
    bitmap.close()
  } catch {
    alert('That file could not be read as an image.')
    return false
  }
  riso.markPhotoChanged()
  return true
}

const riso = createRisoController({
  sidebarEl: document.querySelector<HTMLElement>('#riso-sidebar')!,
  mainEl,
  canvas: document.querySelector<HTMLCanvasElement>('#riso-canvas')!,
  source,
  displayMax: DISPLAY_MAX,
  downscale,
  canSaveToLibrary: () => false,
  libraryAvailable: false,
  loadFile,
  saveToLibrary: async () => {},
  onRendered: () => document.body.classList.add('has-image'),
})

async function openFile(file: File | undefined) {
  if (file && (await loadFile(file))) riso.show()
}

fileInput.addEventListener('change', () => openFile(fileInput.files?.[0]))

mainEl.addEventListener('dragover', (event) => {
  event.preventDefault()
  mainEl.classList.add('dragging')
})
mainEl.addEventListener('dragleave', () => mainEl.classList.remove('dragging'))
mainEl.addEventListener('drop', (event) => {
  event.preventDefault()
  mainEl.classList.remove('dragging')
  void openFile(event.dataTransfer?.files[0])
})
// Pasting an image (⌘V) works too.
window.addEventListener('paste', (event) => {
  const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
  void openFile(item?.getAsFile() ?? undefined)
})

riso.show()
