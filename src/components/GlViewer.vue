<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LacquerRenderer, LIGHT_PRESETS, type ViewMode, type LightPreset } from '@/gl/renderer'
import { heatLevels } from '@/sim/engine'
import type { SimState } from '@/sim/engine'
import type { WorkOrder } from '@/sim/types'

const props = defineProps<{
  sim: SimState | null
  order: WorkOrder | null
  mode: ViewMode
  light: LightPreset
  grindMode: 'orbit' | 'grind' | 'platen'
  platenZ: number
}>()

const emit = defineEmits<{
  stroke: [points: Array<{ x: number; y: number }>, flat: boolean, z: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let renderer: LacquerRenderer | null = null
let raf = 0
let dragging = false
let orbiting = false
let lastX = 0
let lastY = 0
let strokePts: Array<{ x: number; y: number }> = []
let allocatedKey = ''

function currentKey(): string {
  if (!props.sim || !props.order) return ''
  const f = props.sim.field
  const b = props.order.body
  const bp = props.order.bump
  // 含胎形/起底指纹：同分辨率换器形也要重建并重新上传 mask
  return [
    f.nx, f.ny, props.order.layers.length,
    b.kind, b.diameter, b.width, b.rimHeight, b.curveDepth, b.objScale, b.objText.length,
    bp.seed, bp.density, bp.height, bp.radius, bp.distribution, bp.method,
  ].join('|')
}

function ensureAllocated(): void {
  if (!renderer || !props.sim || !props.order) return
  const key = currentKey()
  if (key !== allocatedKey) {
    renderer.allocate(props.sim.field, props.order.layers)
    renderer.uploadLayers(props.sim.layerIndex)
    allocatedKey = key
  }
  renderer.uploadHeight(props.sim.field)
  renderer.uploadLayers(props.sim.layerIndex)
  pushHeat()
}

function pushHeat(): void {
  if (!renderer || !props.sim || !props.order) return
  const levels = heatLevels(props.sim, props.order.thinThreshold)
  renderer.uploadHeat(levels)
}

function loop(): void {
  if (renderer) renderer.render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!canvasRef.value) return
  renderer = new LacquerRenderer(canvasRef.value)
  renderer.viewMode = props.mode
  renderer.light = props.light
  ensureAllocated()
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  renderer?.dispose()
  renderer = null
})

watch(
  () => props.mode,
  (m) => {
    if (renderer) renderer.viewMode = m
    if (m === 'heat') pushHeat()
  },
)

watch(
  () => props.light,
  (l) => {
    if (renderer) renderer.light = l
  },
)

// sim 变化：尺寸/胎形变更走全量重建，增量打磨只刷新数据纹理
watch(
  () => props.sim,
  () => {
    if (!renderer || !props.sim) return
    if (currentKey() !== allocatedKey) {
      ensureAllocated()
      return
    }
    renderer.uploadHeight(props.sim.field)
    renderer.uploadLayers(props.sim.layerIndex)
    if (props.mode === 'heat') pushHeat()
  },
)

function onPointerDown(e: PointerEvent): void {
  if (!renderer || !canvasRef.value) return
  dragging = true
  lastX = e.clientX
  lastY = e.clientY
  if (props.grindMode === 'orbit' || e.button === 2 || e.shiftKey) {
    orbiting = true
    return
  }
  if (props.grindMode === 'platen') {
    emit('stroke', [], true, props.platenZ)
    dragging = false
    return
  }
  orbiting = false
  strokePts = [toWorld(e)]
  canvasRef.value.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging || !renderer) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  if (orbiting) {
    renderer.orbit(dx, dy)
    return
  }
  if (strokePts.length) strokePts.push(toWorld(e))
}

function onPointerUp(): void {
  if (!dragging) return
  dragging = false
  if (!orbiting && strokePts.length) {
    emit('stroke', strokePts, false, 0)
    strokePts = []
  }
  orbiting = false
}

function onWheel(e: WheelEvent): void {
  if (!renderer) return
  e.preventDefault()
  renderer.zoom(e.deltaY > 0 ? 1.12 : 0.89)
}

function toWorld(e: PointerEvent): { x: number; y: number } {
  const rect = canvasRef.value!.getBoundingClientRect()
  const p = renderer!.screenToWorld(e.clientX, e.clientY, rect)
  return { x: p[0], y: p[1] }
}

defineExpose({
  resetView: () => {
    if (!renderer) return
    renderer.yaw = 0.6
    renderer.pitch = 0.95
  },
  presets: LIGHT_PRESETS,
})
</script>

<template>
  <div class="viewer-wrap">
    <canvas
      ref="canvasRef"
      class="viewer-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @contextmenu.prevent
    />
    <div class="viewer-hint no-print">
      <template v-if="grindMode === 'orbit'">轨道模式：左键旋转 · 滚轮缩放 · Shift+拖拽始终旋转</template>
      <template v-else-if="grindMode === 'grind'">下刀模式：按住左键在漆面拖动即打磨 · Shift+拖拽旋转视角</template>
      <template v-else>平面磨模式：点击画布即整域下压一刀</template>
    </div>
  </div>
</template>

<style scoped>
.viewer-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: var(--slate-950);
  border-radius: var(--radius);
  overflow: hidden;
}
.viewer-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
}
.viewer-hint {
  position: absolute;
  left: var(--sp-4);
  bottom: var(--sp-4);
  background: rgba(2, 6, 23, 0.72);
  color: var(--slate-300);
  font-size: var(--fs-xs);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
  pointer-events: none;
}
</style>
