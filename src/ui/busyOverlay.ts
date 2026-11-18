/**
 * Shows a "⏳ working…" overlay over `container` while `work` runs, so a heavy synchronous render
 * (uncapped source photo, many palette colors, a full-resolution export) reads as "busy" instead of
 * "frozen/crashed" — the actual perceived-crash complaint this exists to address. `work` itself is
 * almost always a plain synchronous function that blocks the main thread; the two nested
 * requestAnimationFrame calls below are what make the overlay actually paint BEFORE that block
 * starts (a single rAF fires before the next paint, but browsers commonly batch multiple rAF
 * callbacks into one paint — two is the reliable way to guarantee an intervening paint has already
 * happened once the second one fires).
 *
 * A failure inside `work` is shown to the user (callers fire-and-forget this from button clicks, so
 * a thrown error would otherwise disappear into an unhandled rejection — e.g. an export that's too
 * large for the browser would look like the button simply did nothing). Resolves `undefined` then.
 */
export async function withBusyOverlay<T>(container: HTMLElement, label: string, work: () => T | Promise<T>): Promise<T | undefined> {
  const overlay = document.createElement('div')
  overlay.className = 'busy-overlay'
  overlay.textContent = `⏳ ${label}`
  container.append(overlay)

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  try {
    return await work()
  } catch (error) {
    console.error(error)
    alert(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  } finally {
    overlay.remove()
  }
}
