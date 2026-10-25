export interface BundledFont {
  id: string
  name: string
  /** Served from /fonts/... (Vite public/) */
  url: string
  license: string
}

export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: 'inter',
    name: 'Inter',
    url: '/fonts/Inter-Regular.ttf',
    license: 'OFL 1.1',
  },
  {
    id: 'opensans',
    name: 'Open Sans',
    url: '/fonts/OpenSans-Regular.ttf',
    license: 'OFL 1.1',
  },
]

export function fontById(id: string): BundledFont {
  return BUNDLED_FONTS.find((f) => f.id === id) ?? BUNDLED_FONTS[0]
}
