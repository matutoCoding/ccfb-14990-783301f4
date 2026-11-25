<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import SliderRow from '@/components/SliderRow.vue'
import GlViewer from '@/components/GlViewer.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useStore } from '@/store/app'
import { LIGHT_PRESETS, type ViewMode } from '@/gl/renderer'
import { remainingThickness, heatLevels } from '@/sim/engine'

const store = useStore()
const order = computed(() => store.current.value)
const sim = computed(() => store.simState.value)

const grindMode = ref<'orbit' | 'grind' | 'platen'>('grind')
const viewMode = ref<ViewMode>('lit')
const lightIdx = ref(0)
const platenZ = ref(0)
const replayIndex = ref(-1)
const replayTimer = ref<ReturnType<typeof setInterval> | null>(null)

const lights = LIGHT_PRESETS

const monitor = computed(() => {
  const s = sim.value
  const o = order.value
  if (!s || !o) return null
  const remain = remainingThickness(s)
  const heat = heatLevels(s, o.thinThreshold)
  let active = 0, breach = 0, thin = 0, minRemain = Infinity
  for (let i = 0; i < heat.length; i++) {
    if (!s.field.mask[i]) continue
    active++
    if (heat[i] === 3) breach++
    if (heat[i] >= 1 && heat[i] < 3) thin++
    if (s.layerIndex[i] !== -1) minRemain = Math.min(minRemain, remain[i])
  }
  return {
    breachRatio: breach / active,
    thinRatio: thin / active,
    minRemain: minRemain === Infinity ? 0 : minRemain,
    strokes: o.strokes.length,
    events: o.grindEvents.length,
  }
})

function onStroke(points: Array<{ x: number; y: number }>, flat: boolean, _z: number): void {
  if (flat) {
    store.applyPlatenStroke(platenZ.value)
    return
  }
  store.applyStroke(points, false, 0)
}

function setPlatenLevel(): void {
  const s = sim.value
  if (!s) return
  // 默认磨面取当前最高漆面下方 0.2mm
  let top = -Infinity
  for (let i = 0; i < s.field.surface.length; i++) {
    if (s.field.mask[i]) top = Math.max(top, s.field.surface[i])
  }
  platenZ.value = Number((top - 0.2).toFixed(2))
}

function resetAll(): void {
  if (window.confirm('清空全部打磨记录？胎体与髹漆参数保留。')) {
    stopReplay()
    store.resetGrind()
  }
}

function jumpStroke(idx: number): void {
  stopReplay()
  replayIndex.value = idx
  store.rollbackToStroke(idx)
}

function startReplay(): void {
  const o = order.value
  if (!o || !o.strokes.length) return
  stopReplay()
  replayIndex.value = -1
  store.resetGrind()
  let i = 0
  replayTimer.value = setInterval(() => {
    if (i >= o.strokes.length) {
      stopReplay()
      return
    }
    store.rollbackToStroke(i)
    replayIndex.value = i
    i++
  }, 900)
}

function stopReplay(): void {
  if (replayTimer.value) {
    clearInterval(replayTimer.value)
    replayTimer.value = null
  }
}

function toolTouch(): void {
  // 工具参数只影响后续事件，无需重建历史
  store.persist()
}
</script>

<template>
  <div class="page">
    <EmptyState
      v-if="!order"
      icon="grind"
      title="还没有打开的作品"
      subtitle="先在作品列表里新建或选择一件作品"
    />

    <template v-else>
      <header class="page-head">
        <div>
          <h1>打磨推演</h1>
          <p class="muted">每一刀都按确定性事件流记录，同参数重放结果逐位一致</p>
        </div>
        <div class="head-actions no-print">
          <button class="btn" @click="startReplay" :disabled="!order.strokes.length"><Icon name="play" /> 回放全程</button>
          <button class="btn btn-danger" @click="resetAll"><Icon name="reset" /> 清空打磨</button>
        </div>
      </header>

      <div class="layout">
        <section class="card panel no-print">
          <h3 class="panel-title">打磨方式</h3>
          <div class="seg">
            <button class="seg-item" :class="{ active: grindMode === 'orbit' }" @click="grindMode = 'orbit'">轨道观察</button>
            <button class="seg-item" :class="{ active: grindMode === 'grind' }" @click="grindMode = 'grind'">球面下刀</button>
            <button class="seg-item" :class="{ active: grindMode === 'platen' }" @click="grindMode = 'platen'; setPlatenLevel()">平面磨</button>
          </div>

          <h3 class="panel-title second">磨具与力度</h3>
          <label class="field-label">磨具类型</label>
          <select v-model="order.tool.kind" class="full-input" @change="toolTouch">
            <option value="disk">圆盘砂</option>
            <option value="hand">手工捺磨</option>
            <option value="platen">平面压磨</option>
          </select>
          <input v-model="order.tool.name" class="full-input" placeholder="磨具名称" @change="toolTouch" />
          <SliderRow label="接触半径" v-model="order.tool.radius" :min="5" :max="60" :step="1" unit="mm" @update:model-value="toolTouch" />
          <SliderRow label="下压力度" v-model="order.tool.pressure" :min="0.1" :max="1" :step="0.05" @update:model-value="toolTouch" />
          <SliderRow label="满力吃刀量" v-model="order.tool.maxBite" :min="0.01" :max="0.15" :step="0.005" unit="mm" @update:model-value="toolTouch" />

          <template v-if="grindMode === 'platen'">
            <h3 class="panel-title second">磨面高度</h3>
            <SliderRow label="绝对磨面 z" v-model="platenZ" :min="-30" :max="20" :step="0.05" unit="mm" />
            <button class="btn full-btn" @click="setPlatenLevel">取当前漆面下方 0.2mm</button>
          </template>

          <h3 class="panel-title second">显示与灯光</h3>
          <div class="view-grid">
            <button class="btn" :class="{ 'btn-primary': viewMode === 'lit' }" @click="viewMode = 'lit'">推光漆面</button>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'flat' }" @click="viewMode = 'flat'">纯色稿</button>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'heat' }" @click="viewMode = 'heat'">薄漆热力</button>
            <button class="btn" :class="{ 'btn-primary': viewMode === 'relief' }" @click="viewMode = 'relief'">起伏稿</button>
          </div>
          <label class="field-label" style="margin-top: var(--sp-3)">灯光</label>
          <select v-model.number="lightIdx" class="full-input">
            <option v-for="(l, i) in lights" :key="l.name" :value="i">{{ l.name }}</option>
          </select>

          <h3 class="panel-title second">打磨监测</h3>
          <div v-if="monitor" class="monitor">
            <div class="monitor-row" :class="{ danger: monitor.breachRatio > 0 }">
              <span>磨穿面积</span>
              <strong>{{ (monitor.breachRatio * 100).toFixed(2) }}%</strong>
            </div>
            <div class="monitor-row" :class="{ warn: monitor.thinRatio > 0.05 }">
              <span>薄漆预警</span>
              <strong>{{ (monitor.thinRatio * 100).toFixed(2) }}%</strong>
            </div>
            <div class="monitor-row">
              <span>剩余最薄处</span>
              <strong>{{ monitor.minRemain.toFixed(3) }}mm</strong>
            </div>
            <div class="monitor-row">
              <span>已下刀数</span>
              <strong>{{ monitor.events }}</strong>
            </div>
          </div>
        </section>

        <section class="stage-col">
          <div class="card viewer-panel">
            <GlViewer
              :sim="sim"
              :order="order"
              :mode="viewMode"
              :light="lights[lightIdx]"
              :grind-mode="grindMode"
              :platen-z="platenZ"
              @stroke="onStroke"
            />
          </div>

          <div class="card replay-panel no-print">
            <div class="replay-head">
              <h3>逐笔回放</h3>
              <span class="muted">共 {{ order.strokes.length }} 笔，点击定位到该笔结束时刻</span>
            </div>
            <div v-if="!order.strokes.length" class="muted replay-empty">
              还没有打磨记录。选择「球面下刀」在模型上拖动，或用「平面磨」整域下压。
            </div>
            <div v-else class="stroke-list">
              <button
                v-for="(st, i) in order.strokes"
                :key="st.id"
                class="stroke-chip"
                :class="{ active: replayIndex === i }"
                @click="jumpStroke(i)"
              >
                <span class="chip-no">{{ i + 1 }}</span>
                <span class="chip-note">{{ st.note }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1440px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--sp-5); }
.head-actions { display: flex; gap: var(--sp-2); }
.layout { display: grid; grid-template-columns: 320px 1fr; gap: var(--sp-5); }
.panel { padding: var(--sp-5); align-self: start; max-height: calc(100vh - 170px); overflow: auto; }
.panel-title { margin-bottom: var(--sp-4); }
.panel-title.second { margin-top: var(--sp-6); }
.seg { display: flex; gap: var(--sp-1); background: var(--slate-100); padding: 3px; border-radius: var(--radius-sm); }
.seg-item { flex: 1; border: none; background: transparent; border-radius: var(--radius-sm); padding: var(--sp-2); font-size: var(--fs-xs); color: var(--slate-600); }
.seg-item.active { background: var(--surface); color: var(--brand-hover); font-weight: var(--fw-medium); box-shadow: var(--shadow-sm); }
.full-input { width: 100%; margin-bottom: var(--sp-3); }
.full-btn { width: 100%; justify-content: center; }
.view-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }
.monitor { display: flex; flex-direction: column; gap: var(--sp-2); }
.monitor-row { display: flex; justify-content: space-between; padding: var(--sp-2) var(--sp-3); background: var(--slate-50); border-radius: var(--radius-sm); font-size: var(--fs-xs); }
.monitor-row.danger strong { color: var(--danger); }
.monitor-row.warn strong { color: #b45309; }
.stage-col { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.viewer-panel { padding: var(--sp-2); min-height: 480px; height: 56vh; }
.replay-panel { padding: var(--sp-4); }
.replay-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--sp-3); }
.replay-empty { padding: var(--sp-3) 0; }
.stroke-list { display: flex; gap: var(--sp-2); flex-wrap: wrap; max-height: 132px; overflow: auto; }
.stroke-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 999px;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
}
.stroke-chip.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-hover); }
.chip-no { font-weight: var(--fw-semibold); }
</style>
