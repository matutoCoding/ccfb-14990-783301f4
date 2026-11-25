// 高度场：仿真的核心数据结构。xy 平面等距网格，z 为高度(mm)
// 所有数组按 row-major、索引顺序固定遍历，保证跨运行逐位一致

export interface GridDims {
  // 横向格数
  nx: number
  // 纵向格数
  ny: number
  // 每格物理尺寸 mm
  cell: number
  // 网格覆盖的物理宽/高 mm
  width: number
  height: number
}

export class HeightField {
  readonly nx: number
  readonly ny: number
  readonly cell: number
  // 胎体顶面高度（漆的着床面）
  readonly body: Float32Array
  // 起底凸点附加高度（干态，髹漆前的起伏底）
  readonly bumps: Float32Array
  // 当前漆面总高度（含全部已髹涂层减去打磨量）
  surface: Float32Array
  // 打磨累计去除高度
  removed: Float32Array
  // 格掩码：1=有效工作面，0=外形之外
  mask: Uint8Array

  constructor(nx: number, ny: number, cell: number) {
    this.nx = nx
    this.ny = ny
    this.cell = cell
    const n = nx * ny
    this.body = new Float32Array(n)
    this.bumps = new Float32Array(n)
    this.surface = new Float32Array(n)
    this.removed = new Float32Array(n)
    this.mask = new Uint8Array(n)
  }

  idx(x: number, y: number): number {
    return y * this.nx + x
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.nx && y < this.ny
  }

  // 物理坐标(mm, 域中心为原点) -> 网格坐标
  worldToGrid(wx: number, wy: number): [number, number] {
    const gx = Math.round((wx + (this.nx * this.cell) / 2) / this.cell)
    const gy = Math.round((wy + (this.ny * this.cell) / 2) / this.cell)
    return [gx, gy]
  }

  gridToWorld(gx: number, gy: number): [number, number] {
    return [gx * this.cell - (this.nx * this.cell) / 2, gy * this.cell - (this.ny * this.cell) / 2]
  }

  clone(): HeightField {
    const h = new HeightField(this.nx, this.ny, this.cell)
    h.body.set(this.body)
    h.bumps.set(this.bumps)
    h.surface.set(this.surface)
    h.removed.set(this.removed)
    h.mask.set(this.mask)
    return h
  }
}

// 按物理尺寸选分辨率：目标格宽 ~0.8mm，钳制在 256-640（偶数）
export function chooseResolution(widthMm: number, heightMm: number, targetCell = 0.8): GridDims {
  const pick = (mm: number): number => {
    let n = Math.round(mm / targetCell)
    n = Math.max(256, Math.min(640, n))
    return n + (n % 2)
  }
  const nx = pick(widthMm)
  const ny = pick(heightMm)
  return {
    nx,
    ny,
    cell: Math.max(widthMm / nx, heightMm / ny),
    width: widthMm,
    height: heightMm,
  }
}
