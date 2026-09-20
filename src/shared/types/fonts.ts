export interface CustomFontEntry {
  name: string
  fileName: string
  path: string
  format: 'truetype' | 'opentype' | 'woff2'
  dataUrl: string
}
