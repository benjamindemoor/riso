/** One Risograph ink colour — approximations of the commonly published Riso ink swatches, used as
 *  the Riso tab's built-in ink list. Users can still edit any ink to a custom hex. */
export interface RisoInk {
  name: string
  hex: string
}

export const RISO_INKS: RisoInk[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'Burgundy', hex: '#914e72' },
  { name: 'Blue', hex: '#0078bf' },
  { name: 'Medium Blue', hex: '#3255a4' },
  { name: 'Bright Red', hex: '#f15060' },
  { name: 'Fluorescent Pink', hex: '#ff48b0' },
  { name: 'Fluorescent Orange', hex: '#ff7477' },
  { name: 'Yellow', hex: '#ffe800' },
  { name: 'Sunflower', hex: '#ffb511' },
  { name: 'Teal', hex: '#00838a' },
  { name: 'Green', hex: '#00a95c' },
  { name: 'Mint', hex: '#82d8d5' },
  { name: 'Aqua', hex: '#5ec8e5' },
  { name: 'Cornflower', hex: '#62a8e5' },
  { name: 'Violet', hex: '#9d7ad2' },
  { name: 'Flat Gold', hex: '#bb8b41' },
  { name: 'Light Grey', hex: '#88898a' },
]

/** The built-in ink whose hex matches `hex` exactly (case-insensitive), or null for a custom colour. */
export function findRisoInk(hex: string): RisoInk | null {
  const lower = hex.toLowerCase()
  return RISO_INKS.find((ink) => ink.hex === lower) ?? null
}
