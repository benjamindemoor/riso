import type { ThresholdLayer } from './thresholds.ts'

export const SETTINGS_KEYWORD = 'bitmap-threshold-art-settings'

export interface ExportSettings {
  layers: ThresholdLayer[]
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function buildTextChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword)
  const textBytes = new TextEncoder().encode(text)

  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length)
  data.set(keywordBytes, 0)
  data[keywordBytes.length] = 0
  data.set(textBytes, keywordBytes.length + 1)

  const type = new TextEncoder().encode('tEXt')
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(chunk.buffer)

  view.setUint32(0, data.length)
  chunk.set(type, 4)
  chunk.set(data, 8)

  const crcInput = new Uint8Array(4 + data.length)
  crcInput.set(type, 0)
  crcInput.set(data, 4)
  view.setUint32(8 + data.length, crc32(crcInput))

  return chunk
}

/** Wraps `data` in a complete PNG chunk: [length][type][data][crc]. */
export function buildChunk(typeName: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(typeName)
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(type, 4)
  chunk.set(data, 8)

  const crcInput = new Uint8Array(4 + data.length)
  crcInput.set(type, 0)
  crcInput.set(data, 4)
  view.setUint32(8 + data.length, crc32(crcInput))

  return chunk
}

function buildPhysChunk(pixelsPerMeter: number): Uint8Array {
  const type = new TextEncoder().encode('pHYs')
  const data = new Uint8Array(9)
  const dataView = new DataView(data.buffer)
  dataView.setUint32(0, pixelsPerMeter) // pixels per unit, X axis
  dataView.setUint32(4, pixelsPerMeter) // pixels per unit, Y axis
  data[8] = 1 // unit specifier: 1 = meters (0 would mean "unspecified, aspect ratio only")

  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(type, 4)
  chunk.set(data, 8)

  const crcInput = new Uint8Array(4 + data.length)
  crcInput.set(type, 0)
  crcInput.set(data, 4)
  view.setUint32(8 + data.length, crc32(crcInput))

  return chunk
}

/** Inserts `chunk` right after IHDR (always the very first chunk, right after the 8-byte
 *  signature) — pHYs must precede the first IDAT per the PNG spec, unlike the settings tEXt chunk
 *  below which is fine anywhere (and reads more naturally appended at the end, right before IEND). */
export function insertChunkAfterIHDR(pngBytes: Uint8Array, chunk: Uint8Array): Uint8Array {
  const ihdrLength = new DataView(pngBytes.buffer, pngBytes.byteOffset + 8).getUint32(0)
  const ihdrEnd = 8 + 4 + 4 + ihdrLength + 4 // signature + [length + type + data + crc]
  const result = new Uint8Array(pngBytes.length + chunk.length)
  result.set(pngBytes.subarray(0, ihdrEnd), 0)
  result.set(chunk, ihdrEnd)
  result.set(pngBytes.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return result
}

/** Inserts `chunk` right before the PNG's IEND chunk. */
function insertChunkBeforeIEND(pngBytes: Uint8Array, chunk: Uint8Array): Uint8Array {
  const IEND = [0x49, 0x45, 0x4e, 0x44] // "IEND"
  let offset = 8 // skip the 8-byte PNG signature

  while (offset < pngBytes.length) {
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset + offset)
    const length = view.getUint32(0)
    const type = pngBytes.subarray(offset + 4, offset + 8)

    if (type[0] === IEND[0] && type[1] === IEND[1] && type[2] === IEND[2] && type[3] === IEND[3]) {
      const result = new Uint8Array(pngBytes.length + chunk.length)
      result.set(pngBytes.subarray(0, offset), 0)
      result.set(chunk, offset)
      result.set(pngBytes.subarray(offset), offset + chunk.length)
      return result
    }

    offset += 4 + 4 + length + 4 // length field + type + data + crc
  }

  throw new Error('IEND chunk not found — invalid PNG')
}

// Synchronous on purpose (toDataURL, not the async toBlob) — keeps the whole export inside the
// same synchronous click handler that triggered it, which download-triggering code relies on.
function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png')
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Builds a PNG with the settings JSON embedded as a tEXt chunk. Does not trigger a download. */
export function buildExportPng(canvas: HTMLCanvasElement, settings: ExportSettings): Blob {
  const pngBytes = canvasToPngBytes(canvas)
  const chunk = buildTextChunk(SETTINGS_KEYWORD, JSON.stringify(settings))
  const withMetadata = insertChunkBeforeIEND(pngBytes, chunk)
  return new Blob([withMetadata.buffer as ArrayBuffer], { type: 'image/png' })
}

/** Builds a PNG stamped with a `pHYs` chunk for the given DPI — the pixel data is untouched, only
 *  the resolution metadata changes, so print/design software (Photoshop, Illustrator, ...) reports
 *  and prints it at that DPI instead of the browser canvas's implicit, unspecified resolution
 *  (most readers assume 72/96 DPI when no pHYs chunk is present at all). */
export function buildPngAtDpi(canvas: HTMLCanvasElement, dpi: number): Blob {
  const pngBytes = canvasToPngBytes(canvas)
  const pixelsPerMeter = Math.round(dpi / 0.0254)
  const withDpi = insertChunkAfterIHDR(pngBytes, buildPhysChunk(pixelsPerMeter))
  return new Blob([withDpi.buffer as ArrayBuffer], { type: 'image/png' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportPng(canvas: HTMLCanvasElement, settings: ExportSettings, filename = 'bitmap-threshold-art.png') {
  const blob = buildExportPng(canvas, settings)
  downloadBlob(blob, filename)
}
