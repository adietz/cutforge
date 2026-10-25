declare module 'clipper-lib' {
  export interface IntPoint {
    X: number
    Y: number
  }
  export type Path = IntPoint[]
  export type Paths = Path[]

  export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2,
  }
  export enum EndType {
    etOpenSquare = 0,
    etOpenRound = 1,
    etOpenButt = 2,
    etClosedPolygon = 3,
    etClosedLine = 4,
  }
  export enum PolyFillType {
    pftEvenOdd = 0,
    pftNonZero = 1,
    pftPositive = 2,
    pftNegative = 3,
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    Clear(): void
    AddPath(path: Path, joinType: JoinType, endType: EndType): void
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void
    Execute(solution: Paths, delta: number): void
  }

  export class Clipper {
    constructor(initOptions?: number)
    AddPath(path: Path, polyType: number, closed: boolean): boolean
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean
    Execute(
      clipType: number,
      solution: Paths,
      subjFill?: PolyFillType,
      clipFill?: PolyFillType,
    ): boolean
  }

  const ClipperLib: {
    ClipperOffset: typeof ClipperOffset
    Clipper: typeof Clipper
    JoinType: typeof JoinType
    EndType: typeof EndType
    PolyFillType: typeof PolyFillType
    PolyType: { ptSubject: number; ptClip: number }
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number }
    Paths: new () => Paths
    Path: new () => Path
  }
  export default ClipperLib
}
