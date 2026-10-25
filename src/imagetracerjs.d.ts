declare module 'imagetracerjs' {
  interface TraceOptions {
    ltres?: number
    qtres?: number
    pathomit?: number
    numberofcolors?: number
    colorsampling?: number
    blurradius?: number
    blurdelta?: number
    strokewidth?: number
    linefilter?: boolean
    scale?: number
    roundcoords?: number
    viewbox?: boolean
    desc?: boolean
    [key: string]: unknown
  }

  interface ImageTracerApi {
    imagedataToSVG(imgd: ImageData, options?: TraceOptions | string): string
    imagedataToTracedata(imgd: ImageData, options?: TraceOptions | string): unknown
    imageToSVG(
      url: string,
      callback: (svg: string) => void,
      options?: TraceOptions | string,
    ): void
    getImgdata(canvas: HTMLCanvasElement): ImageData
    optionpresets: Record<string, TraceOptions>
  }

  const ImageTracer: ImageTracerApi
  export default ImageTracer
}
