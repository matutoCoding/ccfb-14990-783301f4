// 打磨：把确定性的磨削事件作用到高度场，维护露层索引与磨穿标记
// 平面磨（platen）：全域压到指定磨面高度 z
// 球面磨（disk/hand）：触点范围内按二次曲面吃刀，中心最深

import type { GrindEvent } from './types'
import type { HeightField } from './height_field'
import type { LayerDeposit } from './lacquer'

export interface GrindOutcome {
  // 本次事件触达的格数
  touchedCells: number
  // 本次事件新磨穿的格数
  newBreachCells: number
  // 受影响网格包围盒（供渲染局部上传）
  box: { x0: number; y0: number; x1: number; y1: number } | null
}

export function applyEvent(
  field: HeightField,
  deposits: LayerDeposit[],
  layerIndex: Int16Array,
  ev: GrindEvent,
): GrindOutcome {
  const box = eventBox(field, ev)
  if (!box) return { touchedCells: 0, newBreachCells: 0, box: null }

  let touched = 0
  let breached = 0
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = field.idx(x, y)
      if (!field.mask[i]) continue
      const before = field.surface[i]
      let target: number
      if (ev.flat) {
        target = ev.z
      } else {
        const [wx, wy] = field.gridToWorld(x, y)
        const d = Math.hypot(wx - ev.x, wy - ev.y)
        if (d > ev.radius) continue
        const q = d / ev.radius
        // 二次曲面吃刀，边缘自然归零
        target = before - ev.bite * (1 - q * q)
      }
      if (target >= before) continue

      const floor = field.body[i] + field.bumps[i]
      const next = target < floor ? floor : target
      const cut = before - next
      if (cut <= 0) continue

      field.surface[i] = next
      field.removed[i] += cut
      touched++

      // 磨穿判定：漆面落到起底顶面
      if (next <= floor + 1e-6) {
        if (layerIndex[i] !== -1) breached++
        layerIndex[i] = -1
        continue
      }
      // 露层下移：表面穿过某层顶面即换色
      let idx = layerIndex[i]
      if (idx < 0) idx = deposits.length - 1
      while (idx > 0 && next < deposits[idx - 1].top[i]) idx--
      layerIndex[i] = idx
    }
  }

  return { touchedCells: touched, newBreachCells: breached, box }
}

function eventBox(
  field: HeightField,
  ev: GrindEvent,
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (ev.flat) {
    return { x0: 0, y0: 0, x1: field.nx - 1, y1: field.ny - 1 }
  }
  const [cx, cy] = field.worldToGrid(ev.x, ev.y)
  const r = Math.ceil(ev.radius / field.cell)
  const x0 = Math.max(0, cx - r)
  const x1 = Math.min(field.nx - 1, cx + r)
  const y0 = Math.max(0, cy - r)
  const y1 = Math.min(field.ny - 1, cy + r)
  if (x0 > x1 || y0 > y1) return null
  return { x0, y0, x1, y1 }
}

// 连续重放事件流（回放/重建用），固定顺序 => 同参同果
export function replayEvents(
  field: HeightField,
  deposits: LayerDeposit[],
  layerIndex: Int16Array,
  events: GrindEvent[],
  upTo = events.length,
): void {
  for (let k = 0; k < upTo; k++) {
    applyEvent(field, deposits, layerIndex, events[k])
  }
}
