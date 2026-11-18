export interface ZoomController {
  /** Persistent element — create once, insert once, never recreated (so it isn't wiped by
   *  whatever tab-refresh pattern the caller uses elsewhere). */
  toolbar: HTMLElement
  /** Call after (re)rendering a canvas to (re)apply the current zoom level to its on-screen size —
   *  needed every time since the canvas's underlying pixel size can change between renders (a new
   *  source photo), and the CSS size is a multiple of that. `baseScale` (default 1) is the "100%
   *  zoom" reference — e.g. a fit-to-viewport scale computed the same way as before zoom controls
   *  existed, so zoom multiplies on top of a sensibly-sized starting point instead of always
   *  starting from the canvas's raw (possibly huge) native pixel size. */
  apply: (canvas: HTMLCanvasElement, baseScale?: number) => void
}

/**
 * A small +/−/100%/move zoom toolbar, shared by every tab's main preview area. Building this once
 * as a reusable module (first written for the CMYK Export tab, then requested for the other 3 tabs
 * too) instead of copy-pasting it 4 times. The zoom LEVEL is local to each controller instance (so
 * each tab remembers its own zoom independently), created once per tab and never recreated
 * afterward.
 *
 * `scrollContainer` is the scrollable element the zoomed canvas sits inside — that tab's own
 * `.app-main` for the simple single-canvas tabs, or a nested per-tab viewport (e.g. Funky Stencils'/
 * Screen Print Export's `.cmyk-canvas-viewport`) for tabs with a layers panel that must never move
 * when the canvas is panned/zoomed. The move/pan toggle drags across it directly (adjusting
 * scrollLeft/scrollTop) rather than requiring the browser's own scrollbars, which are fiddly to grab
 * precisely once zoomed in past the point the image no longer fits on screen — and every zoom change
 * recenters that scroll position, so the image stays visually centered instead of drifting into a
 * corner once it overflows the viewport (see refresh()'s doc comment below).
 */
export function createZoomToolbar(scrollContainer: HTMLElement, initialZoom = 1): ZoomController {
  let zoom = initialZoom
  let currentCanvas: HTMLCanvasElement | null = null
  let currentBaseScale = 1

  const toolbar = document.createElement('div')
  toolbar.className = 'zoom-toolbar'

  const zoomOutButton = document.createElement('button')
  zoomOutButton.type = 'button'
  zoomOutButton.textContent = '−'
  zoomOutButton.title = 'Uitzoomen'

  const zoomLabel = document.createElement('span')
  zoomLabel.className = 'zoom-toolbar-label'

  const zoomInButton = document.createElement('button')
  zoomInButton.type = 'button'
  zoomInButton.textContent = '+'
  zoomInButton.title = 'Inzoomen'

  const zoomResetButton = document.createElement('button')
  zoomResetButton.type = 'button'
  zoomResetButton.textContent = '100%'
  zoomResetButton.title = 'Zoom resetten'

  const moveButton = document.createElement('button')
  moveButton.type = 'button'
  moveButton.textContent = '✥ Verplaatsen'
  moveButton.title = 'Sleep om over een ingezoomde afbeelding te bewegen'

  function refresh() {
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`
    if (currentCanvas) {
      const scale = currentBaseScale * zoom
      currentCanvas.style.width = `${currentCanvas.width * scale}px`
      currentCanvas.style.height = `${currentCanvas.height * scale}px`
    }
    // scrollContainer centers its content via `align-items/justify-content: center` (see style.css),
    // which only holds up while the content actually fits — once zoomed past that point, a centered
    // flex item that overflows its scrollable container still starts scrolled to (0, 0), i.e. its
    // top-left corner, not its middle. Left alone, that reads as the image being pinned into a
    // corner with dead space around it rather than "zoomed in on the center". Recentering the scroll
    // position to the midpoint of however far the content now overflows keeps the same
    // viewport-centered look at every zoom level; a no-op whenever the content still fits (the
    // midpoint of zero overflow is just 0).
    scrollContainer.scrollLeft = (scrollContainer.scrollWidth - scrollContainer.clientWidth) / 2
    scrollContainer.scrollTop = (scrollContainer.scrollHeight - scrollContainer.clientHeight) / 2
  }

  function setZoom(next: number) {
    zoom = Math.max(0.1, Math.min(8, next))
    refresh()
  }

  zoomOutButton.addEventListener('click', () => setZoom(zoom / 1.25))
  zoomInButton.addEventListener('click', () => setZoom(zoom * 1.25))
  zoomResetButton.addEventListener('click', () => setZoom(1))

  // Move mode is a toggle (not "hold to pan") so it doesn't fight with other pointer interactions
  // in the same area (e.g. clicking a layer thumbnail) — dragging only pans while explicitly armed.
  let moveMode = false
  let dragging = false
  let lastX = 0
  let lastY = 0

  moveButton.addEventListener('click', () => {
    moveMode = !moveMode
    moveButton.classList.toggle('active', moveMode)
    scrollContainer.classList.toggle('pan-mode', moveMode)
  })

  scrollContainer.addEventListener('pointerdown', (event) => {
    if (!moveMode) return
    // scrollContainer is the WHOLE tab main area, toolbar included (this toolbar is a child of
    // it) — without this check, pointerdown on any toolbar button (the move button itself, zoom
    // +/−/100%) got treated as a pan-drag start once move mode was armed. Worse, the
    // preventDefault() below then suppressed the button's own emulated 'click' event entirely (per
    // spec, canceling pointerdown cancels the compatibility mouse/click events for that
    // interaction) — so clicking "Verplaatsen" again to turn move mode back off never fired its
    // click handler, leaving it stuck on. Only an actual drag starting on the image itself should
    // ever begin a pan.
    if (event.target instanceof Element && event.target.closest('.zoom-toolbar')) return
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    scrollContainer.setPointerCapture(event.pointerId)
    scrollContainer.classList.add('panning')
    event.preventDefault() // avoid the browser's own image/text drag-select while panning
  })
  scrollContainer.addEventListener('pointermove', (event) => {
    if (!dragging) return
    scrollContainer.scrollLeft -= event.clientX - lastX
    scrollContainer.scrollTop -= event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
  })
  const stopDragging = () => {
    dragging = false
    scrollContainer.classList.remove('panning')
  }
  scrollContainer.addEventListener('pointerup', stopDragging)
  scrollContainer.addEventListener('pointercancel', stopDragging)

  toolbar.append(zoomOutButton, zoomLabel, zoomInButton, zoomResetButton, moveButton)
  refresh()

  return {
    toolbar,
    apply: (canvas, baseScale = 1) => {
      currentCanvas = canvas
      currentBaseScale = baseScale
      refresh()
    },
  }
}
