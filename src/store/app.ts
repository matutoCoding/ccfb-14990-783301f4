// 全局应用状态：订单档案 CRUD、仿真生命周期、当前页面

import { reactive, computed, shallowRef } from 'vue'
import type { WorkOrder, GrindEvent, StrokeRecord, ReferenceImage } from '@/sim/types'
import {
  listOrders, getOrder, saveOrder, deleteOrder, ensurePresets,
} from '@/data/db'
import { buildSimulation, pushEvent, pathToEvents, makeStroke, type SimState } from '@/sim/engine'
import { createOrder } from '@/data/presets'

export type PageKey = 'works' | 'body' | 'lacquer' | 'grind' | 'pattern' | 'sheet'

interface AppState {
  orders: WorkOrder[]
  currentId: string | null
  page: PageKey
  loading: boolean
  dirty: boolean
  error: string
}

const state = reactive<AppState>({
  orders: [],
  currentId: null,
  page: 'works',
  loading: true,
  dirty: false,
  error: '',
})

// 仿真结果含大数组，用 shallowRef 避免深响应开销
const simState = shallowRef<SimState | null>(null)
const simVersion = shallowRef(0)
let rebuildTimer: ReturnType<typeof setTimeout> | null = null

export function useStore() {
  const current = computed<WorkOrder | null>(
    () => state.orders.find((o) => o.id === state.currentId) ?? null,
  )

  async function init(): Promise<void> {
    state.orders = await ensurePresets()
    state.loading = false
    if (state.orders.length) openOrder(state.orders[0].id)
  }

  function openOrder(id: string): void {
    state.currentId = id
    rebuildSim(true)
  }

  function newOrder(): WorkOrder {
    const order = createOrder({ name: `新作品 ${state.orders.length + 1}` })
    state.orders.unshift(order)
    state.currentId = order.id
    persist(order)
    rebuildSim(true)
    return order
  }

  async function removeOrder(id: string): Promise<void> {
    await deleteOrder(id)
    state.orders = state.orders.filter((o) => o.id !== id)
    if (state.currentId === id) {
      state.currentId = state.orders[0]?.id ?? null
      simState.value = null
      if (state.currentId) rebuildSim(true)
    }
  }

  // 参数变更后去抖重建，避免滑杆拖动时反复全量计算
  function scheduleRebuild(): void {
    state.dirty = true
    if (rebuildTimer) clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => {
      rebuildSim(false)
      if (!state.error) {
        const order = current.value
        if (order) persist(order)
      }
    }, 180)
  }

  function rebuildSim(immediate: boolean): void {
    const order = current.value
    if (!order) {
      simState.value = null
      return
    }
    if (!immediate && rebuildTimer) clearTimeout(rebuildTimer)
    try {
      simState.value = buildSimulation(order)
      simVersion.value++
      state.dirty = false
      state.error = ''
    } catch (err) {
      // 如 OBJ 尚未导入：保留上一次有效仿真，把错误交给页面提示
      state.error = err instanceof Error ? err.message : '仿真构建失败'
    }
  }

  // 增量打磨后换壳触发响应式（内部大数组保持同一引用，开销极低）
  function bumpSim(): void {
    if (simState.value) simState.value = { ...simState.value }
    simVersion.value++
  }

  async function persist(order?: WorkOrder): Promise<void> {
    const target = order ?? current.value
    if (!target) return
    await saveOrder(target)
    state.dirty = false
  }

  // 交互打磨：追加事件并增量作用到当前仿真（不触发全量重建）
  function applyStroke(points: Array<{ x: number; y: number }>, flat: boolean, z: number): StrokeRecord | null {
    const order = current.value
    const sim = simState.value
    if (!order || !sim || points.length === 0) return null
    const events = pathToEvents(order, points, flat, z)
    const eventStart = order.grindEvents.length
    for (const ev of events) pushEvent(sim, ev)
    order.grindEvents.push(...events)
    const eventEnd = order.grindEvents.length
    const stroke = makeStroke(order.strokes.length, eventStart, eventEnd)
    stroke.tool = events[0].tool
    stroke.note = `${flat ? '平面磨' : '球面磨'} ${events.length} 刀`
    order.strokes.push(stroke)
    bumpSim()
    state.dirty = true
    persist(order)
    return stroke
  }

  // 平面磨整域一刀
  function applyPlatenStroke(z: number): void {
    const order = current.value
    const sim = simState.value
    if (!order || !sim) return
    const ev: GrindEvent = { tool: 'platen', flat: true, z, x: 0, y: 0, radius: 0, bite: 0 }
    pushEvent(sim, ev)
    const eventStart = order.grindEvents.length
    order.grindEvents.push(ev)
    const stroke = makeStroke(order.strokes.length, eventStart, order.grindEvents.length)
    stroke.tool = 'platen'
    stroke.note = `平面磨至 z=${z.toFixed(2)}mm`
    order.strokes.push(stroke)
    bumpSim()
    state.dirty = true
    persist(order)
  }

  // 回退到指定笔：截断事件流后全量确定性重建
  function rollbackToStroke(strokeIndex: number): void {
    const order = current.value
    if (!order) return
    const keep = strokeIndex < 0 ? 0 : order.strokes[strokeIndex].eventEnd
    order.grindEvents.length = keep
    order.strokes.length = Math.max(0, strokeIndex + 1)
    rebuildSim(true)
    persist(order)
  }

  function resetGrind(): void {
    const order = current.value
    if (!order) return
    order.grindEvents = []
    order.strokes = []
    rebuildSim(true)
    persist(order)
  }

  function setReference(ref: ReferenceImage | null): void {
    const order = current.value
    if (!order) return
    order.reference = ref
    persist(order)
  }

  function goto(page: PageKey): void {
    state.page = page
  }

  return {
    state,
    current,
    simState,
    simVersion,
    init,
    openOrder,
    newOrder,
    removeOrder,
    scheduleRebuild,
    rebuildSim,
    persist,
    applyStroke,
    applyPlatenStroke,
    rollbackToStroke,
    resetGrind,
    setReference,
    goto,
    listOrders,
    getOrder,
  }
}
