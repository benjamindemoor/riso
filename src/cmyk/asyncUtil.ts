/** Yields control back to the browser's event loop — dropped between the expensive per-channel
 *  steps of a multi-channel render/export loop so a busy photo or a large/fine-screened print
 *  doesn't block the main thread continuously long enough to trigger the browser's own "Page
 *  Unresponsive" warning, and so a busy overlay or progress message actually gets a chance to paint
 *  between channels instead of the tab just appearing frozen for the whole loop. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
