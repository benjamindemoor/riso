# Riso

Turn any image into a Risograph print, right in the browser. Live: https://riso-mu.vercel.app

- Upload an image with the button, by dragging it onto the page or by pasting it (⌘V / Ctrl+V).
- The image is separated automatically into 1–4 Riso inks (Fluorescent Pink, Medium Blue, Yellow, Teal, Mint, …), overprinted like real translucent riso ink.
- Per ink: density, contrast and misregistration offset. Global: paper colour, grain, grain size and patchiness.
- Outline strokes, printed as extra ink drums.
- 🎲 Surprise riso, built-in presets and your own presets (stored in your browser).
- Download the flattened PNG, or one 300 DPI greyscale PNG per ink/stroke (black = full ink), ready for a real Risograph — smooth greyscale or pre-screened with grain.

Everything runs locally in your browser; images are never uploaded anywhere.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests (Vitest)
npm run build   # static site in riso-app/dist
```

The image processing lives in `src/riso/` (DOM-free, unit-tested); the UI in `src/ui/riso*.ts` and `riso-app/`.
