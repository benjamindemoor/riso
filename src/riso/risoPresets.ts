import {
  MAX_RISO_INKS,
  MAX_RISO_STROKES,
  createDefaultRisoState,
  createRisoInk,
  createRisoStroke,
  risoInkHex,
  type RisoInkSettings,
  type RisoState,
  type RisoStroke,
} from './risoState.ts'

const STORAGE_KEY = 'bitmap-threshold-art-riso-presets'

type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>

const HEX_RE = /^#[0-9a-f]{6}$/i

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

function hex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_RE.test(value) ? value.toLowerCase() : fallback
}

/** Rebuilds a full, valid RisoState from anything (a stored preset, possibly from an older
 *  version) — missing/invalid fields get defaults, every ink/stroke gets a fresh id. */
export function normalizeRisoState(raw: unknown): RisoState {
  const defaults = createDefaultRisoState()
  if (!raw || typeof raw !== 'object') return defaults
  const r = raw as Partial<Record<keyof RisoState, unknown>>

  const inks: RisoInkSettings[] = (Array.isArray(r.inks) ? r.inks : [])
    .slice(0, MAX_RISO_INKS)
    .map((ink: Partial<RisoInkSettings>) =>
      createRisoInk(hex(ink?.hex, risoInkHex('Black')), {
        density: num(ink?.density, 1, 0, 1.5),
        contrast: num(ink?.contrast, 0, -1, 1),
        offsetX: num(ink?.offsetX, 0, -20, 20),
        offsetY: num(ink?.offsetY, 0, -20, 20),
        visible: ink?.visible ?? true,
      }),
    )
  if (inks.length === 0) return defaults

  const strokes: RisoStroke[] = (Array.isArray(r.strokes) ? r.strokes : [])
    .slice(0, MAX_RISO_STROKES)
    .map((stroke: Partial<RisoStroke>) =>
      createRisoStroke({
        enabled: stroke?.enabled ?? true,
        hex: hex(stroke?.hex, risoInkHex('Black')),
        source: typeof stroke?.source === 'number' && stroke.source >= 0 && stroke.source < inks.length ? stroke.source : 'photo',
        threshold: num(stroke?.threshold, 128, 0, 255),
        width: num(stroke?.width, 2, 1, 12),
        distorted: stroke?.distorted ?? false,
      }),
    )

  const grain = (r.grain ?? {}) as Partial<RisoState['grain']>
  return {
    inks,
    strokes,
    paperHex: hex(r.paperHex, defaults.paperHex),
    grain: {
      amount: num(grain.amount, defaults.grain.amount, 0, 1),
      size: num(grain.size, defaults.grain.size, 1, 4),
      starvation: num(grain.starvation, defaults.grain.starvation, 0, 1),
      seed: num(grain.seed, defaults.grain.seed, 1, 999),
    },
    separationMode: r.separationMode === 'stochastic' ? 'stochastic' : 'continuous',
  }
}

/** Starter looks that always exist (not deletable). Stored in the same loose shape a saved
 *  preset has, and loaded through normalizeRisoState() like one. */
export const BUILT_IN_RISO_PRESETS: { name: string; state: unknown }[] = [
  {
    name: '★ Pink + Blue',
    state: { inks: [{ hex: risoInkHex('Fluorescent Pink') }, { hex: risoInkHex('Medium Blue'), offsetX: 2, offsetY: -2 }] },
  },
  {
    name: '★ Sunflower + Teal',
    state: { inks: [{ hex: risoInkHex('Sunflower') }, { hex: risoInkHex('Teal'), offsetX: -2, offsetY: 1 }], paperHex: '#f7f1e1' },
  },
  {
    name: '★ Mint + Pink + Black outline',
    state: {
      inks: [{ hex: risoInkHex('Mint') }, { hex: risoInkHex('Fluorescent Pink'), offsetX: 3, offsetY: 2 }],
      strokes: [{ hex: risoInkHex('Black'), threshold: 110, width: 2 }],
    },
  },
  {
    name: '★ Mono black, heavy grain',
    state: { inks: [{ hex: risoInkHex('Black'), contrast: 0.3 }], paperHex: '#efe6d2', grain: { amount: 0.7, size: 2, starvation: 0.5, seed: 1 } },
  },
]

function readStore(storage: PresetStorage): Record<string, unknown> {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, unknown>, storage: PresetStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // storage full/blocked — presets are a convenience, never break the tab over it
  }
}

/** Built-ins first (in their own order), then the user's presets alphabetically. */
export function listRisoPresetNames(storage: PresetStorage = localStorage): string[] {
  return [...BUILT_IN_RISO_PRESETS.map((preset) => preset.name), ...Object.keys(readStore(storage)).sort()]
}

export function isBuiltInRisoPreset(name: string): boolean {
  return BUILT_IN_RISO_PRESETS.some((preset) => preset.name === name)
}

export function saveRisoPreset(name: string, state: RisoState, storage: PresetStorage = localStorage) {
  const store = readStore(storage)
  store[name] = JSON.parse(JSON.stringify(state))
  writeStore(store, storage)
}

export function loadRisoPreset(name: string, storage: PresetStorage = localStorage): RisoState | null {
  const builtIn = BUILT_IN_RISO_PRESETS.find((preset) => preset.name === name)
  if (builtIn) return normalizeRisoState(builtIn.state)
  const stored = readStore(storage)[name]
  return stored ? normalizeRisoState(stored) : null
}

export function deleteRisoPreset(name: string, storage: PresetStorage = localStorage) {
  const store = readStore(storage)
  delete store[name]
  writeStore(store, storage)
}
