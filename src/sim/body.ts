// 胎体参数化建模：盘/盒/碗的顶面高度场，外加 OBJ 导入采样
// 约定 z 向上，工作域取胎体包围盒，外形之外 mask=0

import type { BodyParams } from './types'
import type { HeightField } from './height_field'
import { hashString } from './prng'

export interface BodyBuildResult {
  field: HeightField
  // 工作面（mask=1）的物理包围，供 UI 取景
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

// 盘：圆域，盘面浅弧凹陷，沿口微抬
function buildPlate(field: HeightField, p: BodyParams): void {
  const r = p.diameter / 2
  const cx = field.nx / 2
  const cy = field.ny / 2
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      const i = field.idx(x, y)
      const dx = (x - cx) * field.cell
      const dy = (y - cy) * field.cell
      const d = Math.hypot(dx, dy)
      if (d > r) {
        field.mask[i] = 0
        continue
      }
      field.mask[i] = 1
      const t = d / r
      // 中心下凹 curveDepth，近沿处抬升 rimHeight，平滑过渡
      const dish = -p.curveDepth * (1 - t * t)
      const rim = p.rimHeight * smoothstep(0.82, 1, t)
      field.body[i] = dish + rim
    }
  }
}

// 盒：矩形域，盒面微鼓，四沿起线脚
function buildBox(field: HeightField, p: BodyParams): void {
  const hw = p.diameter / 2
  const hh = p.width / 2
  const cx = field.nx / 2
  const cy = field.ny / 2
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      const i = field.idx(x, y)
      const wx = (x - cx) * field.cell
      const wy = (y - cy) * field.cell
      if (Math.abs(wx) > hw || Math.abs(wy) > hh) {
        field.mask[i] = 0
        continue
      }
      field.mask[i] = 1
      const nx = Math.abs(wx) / hw
      const ny = Math.abs(wy) / hh
      const edge = Math.max(nx, ny)
      // 面心微鼓
      const crown = p.curveDepth * 0.4 * (1 - edge * edge)
      // 沿口线脚
      const rim = p.rimHeight * smoothstep(0.88, 1, edge)
      field.body[i] = crown + rim
    }
  }
}

// 碗：圆域，碗心弧度更深，近似球面截面
function buildBowl(field: HeightField, p: BodyParams): void {
  const r = p.diameter / 2
  const cx = field.nx / 2
  const cy = field.ny / 2
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      const i = field.idx(x, y)
      const dx = (x - cx) * field.cell
      const dy = (y - cy) * field.cell
      const d = Math.hypot(dx, dy)
      if (d > r) {
        field.mask[i] = 0
        continue
      }
      field.mask[i] = 1
      const t = d / r
      // 球面式下凹：sqrt(1-t²) 形态，碗心最深
      const bowl = -p.curveDepth * Math.sqrt(Math.max(0, 1 - t * t))
      const rim = p.rimHeight * smoothstep(0.9, 1, t)
      field.body[i] = bowl + rim
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// 极简 OBJ 解析：只取 v 行三角面，投影到 xy 平面后对网格最近点取 z
// 工作室导入的多为扫描胎体，顶点数有限，按格最近邻采样即可
function buildFromObj(field: HeightField, p: BodyParams): void {
  const verts = parseObj(p.objText)
  if (verts.length === 0) {
    throw new Error('OBJ 文件中未解析到顶点')
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const v of verts) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
  }
  const sx = p.objScale * (field.nx * field.cell) / Math.max(1e-6, maxX - minX)
  const sy = p.objScale * (field.ny * field.cell) / Math.max(1e-6, maxY - minY)
  const scale = Math.min(sx, sy)
  const offX = (minX + maxX) / 2
  const offY = (minY + maxY) / 2
  const hit = new Int32Array(field.nx * field.ny).fill(-1)
  for (let vi = 0; vi < verts.length; vi++) {
    const v = verts[vi]
    const wx = (v.x - offX) * scale
    const wy = (v.y - offY) * scale
    const [gx, gy] = field.worldToGrid(wx, wy)
    if (!field.inBounds(gx, gy)) continue
    const i = field.idx(gx, gy)
    // 同一格取最高顶点（胎体顶面）
    if (hit[i] < 0 || v.z > verts[hit[i]].z) hit[i] = vi
  }
  // 最近邻填充空洞：迭代扩散，次数固定保证确定性
  const zVals = new Float32Array(field.nx * field.ny)
  for (let i = 0; i < hit.length; i++) {
    if (hit[i] >= 0) {
      zVals[i] = verts[hit[i]].z * scale
      field.mask[i] = 1
    }
  }
  dilateFill(field, zVals)
  for (let i = 0; i < zVals.length; i++) {
    if (field.mask[i]) field.body[i] = zVals[i]
  }
}

function dilateFill(field: HeightField, zVals: Float32Array): void {
  const rounds = Math.max(field.nx, field.ny)
  const filled = new Uint8Array(field.mask)
  for (let round = 0; round < rounds; round++) {
    let changed = false
    for (let y = 0; y < field.ny; y++) {
      for (let x = 0; x < field.nx; x++) {
        const i = field.idx(x, y)
        if (filled[i] || !field.mask[i]) continue
        let sum = 0, cnt = 0
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue
            const nx = x + ox, ny = y + oy
            if (!field.inBounds(nx, ny)) continue
            const ni = field.idx(nx, ny)
            if (filled[ni]) { sum += zVals[ni]; cnt++ }
          }
        }
        if (cnt) {
          zVals[i] = sum / cnt
          filled[i] = 1
          changed = true
        }
      }
    }
    if (!changed) break
  }
}

interface ObjVertex { x: number; y: number; z: number }

function parseObj(text: string): ObjVertex[] {
  const verts: ObjVertex[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.startsWith('v ')) continue
    const parts = line.trim().split(/\s+/)
    const x = Number(parts[1])
    const y = Number(parts[2])
    const z = Number(parts[3])
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      verts.push({ x, y, z })
    }
  }
  return verts
}

export function buildBody(field: HeightField, params: BodyParams): BodyBuildResult {
  field.body.fill(0)
  field.mask.fill(0)
  switch (params.kind) {
    case 'plate': buildPlate(field, params); break
    case 'box': buildBox(field, params); break
    case 'bowl': buildBowl(field, params); break
    case 'obj': buildFromObj(field, params); break
  }
  // 初始表面=胎面，凸点与打磨量清零
  field.bumps.fill(0)
  field.removed.fill(0)
  for (let i = 0; i < field.body.length; i++) {
    field.surface[i] = field.body[i]
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      if (!field.mask[field.idx(x, y)]) continue
      const [wx, wy] = field.gridToWorld(x, y)
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx)
      minY = Math.min(minY, wy); maxY = Math.max(maxY, wy)
    }
  }
  return { field, bounds: { minX, maxX, minY, maxY } }
}

// 供种子页预览：OBJ 文本的稳定指纹
export function objFingerprint(text: string): number {
  return hashString(text)
}
