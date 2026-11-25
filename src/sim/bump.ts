// 起底：稠漆加麻籽 / 手指捺点，在胎面上生成确定性的凸点高度场

import type { BumpParams } from './types'
import type { HeightField } from './height_field'
import { Rng, valueNoise2D } from './prng'

interface BumpPoint {
  gx: number
  gy: number
  radiusPx: number
  height: number
}

export function buildBumps(field: HeightField, params: BumpParams): void {
  field.bumps.fill(0)
  const rng = new Rng(params.seed)
  const points = placePoints(field, params, rng)
  // 凸点按确定性顺序叠加：高斯丘，截断到 2 倍半径
  for (const pt of points) {
    const r2 = pt.radiusPx * 2
    const x0 = Math.max(0, Math.floor(pt.gx - r2))
    const x1 = Math.min(field.nx - 1, Math.ceil(pt.gx + r2))
    const y0 = Math.max(0, Math.floor(pt.gy - r2))
    const y1 = Math.min(field.ny - 1, Math.ceil(pt.gy + r2))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = field.idx(x, y)
        if (!field.mask[i]) continue
        const d2 = (x - pt.gx) ** 2 + (y - pt.gy) ** 2
        const rr = pt.radiusPx * pt.radiusPx
        const falloff = Math.exp(-(d2 / rr) * 1.6)
        if (falloff < 0.02) continue
        // 稠漆丘可叠加，取和后整体封顶
        field.bumps[i] += pt.height * falloff
      }
    }
  }
  // 封顶 + 手指法加一道低频起伏，让捺痕更像手作
  const cap = params.height * 1.8
  for (let i = 0; i < field.bumps.length; i++) {
    if (!field.mask[i]) continue
    let h = Math.min(field.bumps[i], cap)
    if (params.method === 'finger') {
      const gx = i % field.nx
      const gy = (i / field.nx) | 0
      const [wx, wy] = field.gridToWorld(gx, gy)
      const n = valueNoise2D(wx / (params.radius * 2.2), wy / (params.radius * 2.2), params.seed)
      h += params.height * 0.35 * (n - 0.5) * 2
    }
    field.bumps[i] = Math.max(0, h)
    field.surface[i] = field.body[i] + field.bumps[i]
  }
}

function placePoints(field: HeightField, params: BumpParams, rng: Rng): BumpPoint[] {
  // 工作面面积（平方厘米）
  let areaCells = 0
  for (let i = 0; i < field.mask.length; i++) if (field.mask[i]) areaCells++
  const areaCm2 = (areaCells * field.cell * field.cell) / 100
  const target = Math.max(1, Math.round(params.density * areaCm2))
  const radiusPx = Math.max(0.8, params.radius / field.cell)

  const raw: Array<[number, number]> = []
  if (params.distribution === 'poisson') {
    poissonSample(field, rng, target, raw)
  } else if (params.distribution === 'jitter-grid') {
    jitterGrid(field, rng, target, raw)
  } else {
    randomSample(field, rng, target, raw)
  }

  const points: BumpPoint[] = []
  for (const [gx, gy] of raw) {
    const variation = 1 + (rng.unit() * 2 - 1) * params.heightVariation
    points.push({
      gx,
      gy,
      radiusPx,
      height: params.height * variation,
    })
  }
  return points
}

// 纯随机撒点（允许少量重叠，最"野"的分布）
function randomSample(
  field: HeightField,
  rng: Rng,
  target: number,
  out: Array<[number, number]>,
): void {
  let guard = 0
  const maxGuard = target * 40
  while (out.length < target && guard++ < maxGuard) {
    const gx = rng.next() % field.nx
    const gy = rng.next() % field.ny
    if (field.mask[field.idx(gx, gy)]) out.push([gx, gy])
  }
}

// 抖动网格：均匀骨架上随机偏移，密度稳定、间距可控
function jitterGrid(
  field: HeightField,
  rng: Rng,
  target: number,
  out: Array<[number, number]>,
): void {
  let areaCells = 0
  for (let i = 0; i < field.mask.length; i++) if (field.mask[i]) areaCells++
  const spacing = Math.sqrt(areaCells / target)
  const jitter = spacing * 0.45
  for (let gy = spacing / 2; gy < field.ny; gy += spacing) {
    for (let gx = spacing / 2; gx < field.nx; gx += spacing) {
      const px = Math.round(gx + rng.range(-jitter, jitter))
      const py = Math.round(gy + rng.range(-jitter, jitter))
      if (field.inBounds(px, py) && field.mask[field.idx(px, py)]) {
        out.push([px, py])
      }
    }
  }
}

// 桥池法泊松圆盘：最小间距约束，最接近麻籽均匀铺撒
function poissonSample(
  field: HeightField,
  rng: Rng,
  target: number,
  out: Array<[number, number]>,
): void {
  let areaCells = 0
  for (let i = 0; i < field.mask.length; i++) if (field.mask[i]) areaCells++
  const minDist = Math.sqrt(areaCells / target) * 0.85
  const cellSize = minDist / Math.SQRT2
  const gw = Math.ceil(field.nx / cellSize)
  const gh = Math.ceil(field.ny / cellSize)
  const grid = new Int32Array(gw * gh).fill(-1)
  const active: Array<[number, number]> = []
  const placed: Array<[number, number]> = []

  const cellOf = (gx: number, gy: number): number =>
    Math.min(gw - 1, Math.max(0, Math.floor(gx / cellSize))) * gw +
    Math.min(gh - 1, Math.max(0, Math.floor(gy / cellSize)))

  const farEnough = (gx: number, gy: number): boolean => {
    const cx = Math.floor(gx / cellSize)
    const cy = Math.floor(gy / cellSize)
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = cx + ox, ny = cy + oy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const idx = grid[ny * gw + nx]
        if (idx < 0) continue
        const [px, py] = placed[idx]
        if (Math.hypot(px - gx, py - gy) < minDist) return false
      }
    }
    return true
  }

  // 从工作面中心起种
  const seedIdx = Math.floor(areaCells / 2)
  let walk = 0
  for (let i = 0; i < field.mask.length && walk < seedIdx; i++) {
    if (field.mask[i]) walk++
    if (walk === seedIdx) {
      const gx = i % field.nx
      const gy = (i / field.nx) | 0
      active.push([gx, gy])
      placed.push([gx, gy])
      grid[cellOf(gx, gy)] = placed.length - 1
    }
  }
  if (placed.length === 0) {
    for (let y = 0; y < field.ny; y++) {
      for (let x = 0; x < field.nx; x++) {
        if (field.mask[field.idx(x, y)]) {
          active.push([x, y]); placed.push([x, y])
          grid[cellOf(x, y)] = 0
          break
        }
      }
      if (placed.length) break
    }
  }

  const attempts = 24
  let guard = 0
  const maxGuard = target * 60
  while (active.length && placed.length < target && guard++ < maxGuard) {
    const ai = rng.next() % active.length
    const [bx, by] = active[ai]
    let found = false
    for (let k = 0; k < attempts; k++) {
      const ang = rng.unit() * Math.PI * 2
      const dist = minDist * (1 + rng.unit())
      const gx = Math.round(bx + Math.cos(ang) * dist)
      const gy = Math.round(by + Math.sin(ang) * dist)
      if (!field.inBounds(gx, gy) || !field.mask[field.idx(gx, gy)]) continue
      if (!farEnough(gx, gy)) continue
      placed.push([gx, gy])
      grid[cellOf(gx, gy)] = placed.length - 1
      active.push([gx, gy])
      found = true
      break
    }
    if (!found) {
      active[ai] = active[active.length - 1]
      active.pop()
    }
  }
  out.push(...placed)
}
