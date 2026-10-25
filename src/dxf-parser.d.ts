declare module 'dxf-parser' {
  export default class DxfParser {
    parseSync(dxf: string): {
      entities?: Array<Record<string, unknown>>
    } | null
  }
}
