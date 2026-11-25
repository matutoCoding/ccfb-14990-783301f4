// 髹漆沉积：逐层计算实际干态厚度
// 物理模型（工作室经验的工程化近似）：
// 1. 拉普拉斯曲率判定凸顶/凹处：凸顶漆流薄，凹处漆积厚
// 2. 流动系数控制再分配强度，再分配前后体积守恒（用漆量不变）
// 3. 固定两遍拉普拉斯匀化模拟湿漆自流平，迭代次数固定 => 确定性
// 4. 干燥收缩按层统一折减：干厚 = 湿厚 * (1 - shrink)

import type { LacquerLayer } from './types'
import type { HeightField } from './height_field'

export interface LayerDeposit {
  // 该层干态顶面绝对高度（含胎体+起底+之前各层）
  top: Float32Array
  // 该层干态实际厚度
  thickness: Float32Array
  color: [number, number, number]
}

// 在当前 surface 之上髹一层，返回沉积记录并推进 field.surface
export function applyLayer(field: HeightField, layer: LacquerLayer): LayerDeposit {
  const n = field.nx * field.ny
  const wet = new Float32Array(n)
  const base = field.surface

  // 第一步：曲率驱动的厚薄再分配
  let factorSum = 0
  let activeCount = 0
  const factor = new Float32Array(n)
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      const i = field.idx(x, y)
      if (!field.mask[i]) continue
      const lap = laplacian(field, base, x, y)
      // 归一化到格距，夹断防止极值
      const k = clamp(lap / field.cell, -1, 1)
      // k<0 凸顶 => 系数<1 流薄；k>0 凹处 => 系数>1 积厚
      factor[i] = 1 + layer.flow * k
      factorSum += factor[i]
      activeCount++
    }
  }
  // 体积守恒：均值系数归一，保证平均湿厚等于名义厚度
  const meanFactor = factorSum / Math.max(1, activeCount)
  for (let i = 0; i < n; i++) {
    if (field.mask[i]) wet[i] = layer.thickness * (factor[i] / meanFactor)
  }

  // 第二步：湿漆自流平（固定两遍质量守恒匀化）
  if (layer.flow > 0) {
    relax(field, wet, 2, layer.flow * 0.35)
  }

  // 第三步：干燥收缩
  const dry = new Float32Array(n)
  const top = new Float32Array(n)
  const shrinkK = 1 - layer.shrink
  for (let i = 0; i < n; i++) {
    if (!field.mask[i]) continue
    dry[i] = wet[i] * shrinkK
    top[i] = base[i] + dry[i]
    field.surface[i] = top[i]
  }

  return { top, thickness: dry, color: layer.color }
}

// 四边邻域拉普拉斯：邻域均值 - 中心。正值=凹处，负值=凸顶
function laplacian(field: HeightField, h: Float32Array, x: number, y: number): number {
  const i = field.idx(x, y)
  let sum = 0
  let cnt = 0
  if (x > 0 && field.mask[i - 1]) { sum += h[i - 1]; cnt++ }
  if (x < field.nx - 1 && field.mask[i + 1]) { sum += h[i + 1]; cnt++ }
  if (y > 0 && field.mask[i - field.nx]) { sum += h[i - field.nx]; cnt++ }
  if (y < field.ny - 1 && field.mask[i + field.nx]) { sum += h[i + field.nx]; cnt++ }
  if (cnt === 0) return 0
  return sum / cnt - h[i]
}

// 质量守恒匀化：每遍把每格厚度按权重摊给邻居，再补回等量，总量不变
function relax(
  field: HeightField,
  wet: Float32Array,
  passes: number,
  strength: number,
): void {
  const n = field.nx * field.ny
  const delta = new Float32Array(n)
  for (let pass = 0; pass < passes; pass++) {
    delta.fill(0)
    for (let y = 0; y < field.ny; y++) {
      for (let x = 0; x < field.nx; x++) {
        const i = field.idx(x, y)
        if (!field.mask[i]) continue
        const d = laplacian(field, wet, x, y)
        delta[i] = strength * d
      }
    }
    for (let i = 0; i < n; i++) {
      if (field.mask[i]) wet[i] += delta[i]
    }
    // 厚度物理下限：湿漆不可能为负
    for (let i = 0; i < n; i++) {
      if (field.mask[i] && wet[i] < 0) wet[i] = 0
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

// 统计一层的实际厚度区间，供工艺单展示
export function summarizeDeposit(dep: LayerDeposit, mask: Uint8Array): {
  min: number
  max: number
  mean: number
} {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let cnt = 0
  for (let i = 0; i < dep.thickness.length; i++) {
    if (!mask[i]) continue
    const t = dep.thickness[i]
    min = Math.min(min, t)
    max = Math.max(max, t)
    sum += t
    cnt++
  }
  return { min, max, mean: sum / Math.max(1, cnt) }
}
