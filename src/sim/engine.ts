// 仿真编排：把胎体、起底、髹漆、打磨串成确定性管线，并提供快照与重建

import type { WorkOrder, GrindEvent, StrokeRecord, PatternStats } from './types'
import { HeightField, chooseResolution } from './height_field'
import { buildBody } from './body'
import { buildBumps } from './bump'
import { applyLayer, type LayerDeposit } from './lacquer'
import { applyEvent, replayEvents } from './grind'

export interface SimState {
  field: HeightField
  deposits: LayerDeposit[]
  // 每格当前露出的漆层序号，-1 表示磨穿
  layerIndex: Int16Array
  // 已应用的事件数
  appliedCount: number
}

export interface BuildOptions {
  // 应用事件流的前 N 条，默认全部
  upToEvents?: number
}

// 从订单档案完整构建一次仿真。同档案 => 逐位一致的结果
export function buildSimulation(order: WorkOrder, opts: BuildOptions = {}): SimState {
  const spanW = order.body.kind === 'box' ? order.body.diameter : order.body.diameter
  const spanH = order.body.kind === 'box' ? order.body.width : order.body.diameter
  const dims = chooseResolution(spanW, spanH)
  const field = new HeightField(dims.nx, dims.ny, dims.cell)

  buildBody(field, order.body)
  buildBumps(field, order.bump)

  const deposits: LayerDeposit[] = []
  for (const layer of order.layers) {
    deposits.push(applyLayer(field, layer))
  }

  const n = field.nx * field.ny
  const layerIndex = new Int16Array(n)
  layerIndex.fill(Math.max(0, order.layers.length - 1))

  const upTo = opts.upToEvents ?? order.grindEvents.length
  replayEvents(field, deposits, layerIndex, order.grindEvents, upTo)

  return { field, deposits, layerIndex, appliedCount: upTo }
}

// 在已有仿真上增量应用一个事件（交互打磨用）
export function pushEvent(state: SimState, ev: GrindEvent) {
  return applyEvent(state.field, state.deposits, state.layerIndex, ev)
}

// 从某个事件位置重建（回放定位用）：重新跑全链路到指定事件数
export function rebuildAt(state: SimState, order: WorkOrder, upToEvents: number): SimState {
  const fresh = buildSimulation(order, { upToEvents })
  state.field = fresh.field
  state.deposits = fresh.deposits
  state.layerIndex = fresh.layerIndex
  state.appliedCount = fresh.appliedCount
  return fresh
}

// 剩余漆厚：当前表面到起底顶面的距离
export function remainingThickness(state: SimState): Float32Array {
  const { field } = state
  const out = new Float32Array(field.nx * field.ny)
  for (let i = 0; i < out.length; i++) {
    if (!field.mask[i]) continue
    out[i] = field.surface[i] - (field.body[i] + field.bumps[i])
  }
  return out
}

// 薄漆/磨穿热力分级：0 正常 1 偏薄 2 危险 3 磨穿
export function heatLevels(state: SimState, thinThreshold: number): Uint8Array {
  const { field } = state
  const out = new Uint8Array(field.nx * field.ny)
  const remain = remainingThickness(state)
  for (let i = 0; i < out.length; i++) {
    if (!field.mask[i]) continue
    if (state.layerIndex[i] === -1) {
      out[i] = 3
    } else if (remain[i] <= thinThreshold * 0.5) {
      out[i] = 2
    } else if (remain[i] <= thinThreshold) {
      out[i] = 1
    }
  }
  return out
}

// 纹样统计：色块面积占比 + 纹路密度 + 磨穿/薄漆占比
export function analyzePattern(
  state: SimState,
  order: WorkOrder,
  thinThreshold: number,
): PatternStats {
  const { field, layerIndex } = state
  const buckets = new Map<number, { color: [number, number, number]; count: number }>()
  let active = 0
  let breach = 0
  for (let i = 0; i < layerIndex.length; i++) {
    if (!field.mask[i]) continue
    active++
    const li = layerIndex[i]
    if (li === -1) {
      breach++
      continue
    }
    const key = li
    const cur = buckets.get(key)
    if (cur) cur.count++
    else buckets.set(key, { color: order.layers[li].color, count: 1 })
  }

  const colorArea = [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, v]) => ({ color: v.color, ratio: v.count / Math.max(1, active) }))

  // 纹路密度：层索引变化的相邻边数 / 面积(cm²)
  let boundaries = 0
  for (let y = 0; y < field.ny; y++) {
    for (let x = 0; x < field.nx; x++) {
      const i = field.idx(x, y)
      if (!field.mask[i]) continue
      if (x < field.nx - 1 && field.mask[i + 1] && layerIndex[i] !== layerIndex[i + 1]) boundaries++
      if (y < field.ny - 1 && field.mask[i + field.nx] && layerIndex[i] !== layerIndex[i + field.nx]) boundaries++
    }
  }
  const areaCm2 = (active * field.cell * field.cell) / 100
  const boundaryDensity = boundaries / Math.max(1e-6, areaCm2)

  const remain = remainingThickness(state)
  let thin = 0
  for (let i = 0; i < remain.length; i++) {
    if (field.mask[i] && layerIndex[i] !== -1 && remain[i] <= thinThreshold) thin++
  }

  return {
    colorArea,
    boundaryDensity,
    breachRatio: breach / Math.max(1, active),
    thinRatio: thin / Math.max(1, active),
    sampledCells: active,
  }
}

// 把一笔拖拽路径重采样成确定性的事件序列
export function pathToEvents(
  order: WorkOrder,
  points: Array<{ x: number; y: number }>,
  flat: boolean,
  z: number,
): GrindEvent[] {
  const tool = order.tool
  const bite = tool.maxBite * tool.pressure
  const stepMm = Math.max(0.5, tool.radius * 0.35)
  const events: GrindEvent[] = []
  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p]
    const b = points[p + 1]
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(dist / stepMm))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      events.push({
        tool: tool.kind,
        flat,
        z,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        radius: tool.radius,
        bite,
      })
    }
  }
  if (points.length === 1) {
    events.push({
      tool: tool.kind,
      flat,
      z,
      x: points[0].x,
      y: points[0].y,
      radius: tool.radius,
      bite,
    })
  }
  return events
}

export function makeStroke(index: number, eventStart: number, eventEnd: number): StrokeRecord {
  return {
    id: `stroke-${index}-${eventStart}`,
    index,
    tool: 'disk',
    eventStart,
    eventEnd,
    atSeconds: 0,
    note: '',
  }
}
