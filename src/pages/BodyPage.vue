<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import SliderRow from '@/components/SliderRow.vue'
import GlViewer from '@/components/GlViewer.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useStore } from '@/store/app'
import { LIGHT_PRESETS, type LightPreset } from '@/gl/renderer'
import type { BodyKind, BumpMethod, BumpDistribution } from '@/sim/types'

const store = useStore()
const order = computed(() => store.current.value)
const sim = computed(() => store.simState.value)
const viewMode = ref<'lit' | 'flat' | 'heat' | 'relief'>('relief')
const lightPreset: LightPreset = LIGHT_PRESETS[0]
const objError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const bodyKinds: Array<{ value: BodyKind; label: string }> = [
  { value: 'plate', label: '茶盘' },
  { value: 'box', label: '盒' },
  { value: 'bowl', label: '碗' },
  { value: 'obj', label: 'OBJ 导入' },
]
const methods: Array<{ value: BumpMethod; label: string }> = [
  { value: 'seed-hemp', label: '稠漆加麻籽' },
  { value: 'finger', label: '手指捺点' },
]
const distributions: Array<{ value: BumpDistribution; label: string }> = [
  { value: 'poisson', label: '泊松均匀（麻籽铺撒）' },
  { value: 'jitter-grid', label: '抖动网格（规整带变化）' },
  { value: 'random', label: '纯随机（最野）' },
]

watch(
  order,
  () => {
    objError.value = ''
  },
)

function touch(): void {
  store.scheduleRebuild()
}

function onObjFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !order.value) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result ?? '')
    if (!text.includes('v ')) {
      objError.value = '文件里没有解析到顶点（v 行），请检查 OBJ 格式'
      return
    }
    order.value!.body.objText = text
    order.value!.body.kind = 'obj'
    objError.value = ''
    store.scheduleRebuild()
  }
  reader.onerror = () => {
    objError.value = '文件读取失败'
  }
  reader.readAsText(file)
}

function reseed(): void {
  if (!order.value) return
  order.value.bump.seed = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0
  touch()
}
</script>

<template>
  <div class="page">
    <EmptyState
      v-if="!order"
      icon="body"
      title="还没有打开的作品"
      subtitle="先在作品列表里新建或选择一件作品"
    />

    <template v-else>
      <header class="page-head">
        <div>
          <h1>胎体与起底</h1>
          <p class="muted">起伏稿直接显示在右侧模型上；同一种子下，凸点分布逐次一致</p>
        </div>
        <div class="head-actions">
          <button class="btn" :class="{ 'btn-primary': viewMode === 'relief' }" @click="viewMode = 'relief'">
            <Icon name="eye" /> 起伏稿
          </button>
          <button class="btn" :class="{ 'btn-primary': viewMode === 'lit' }" @click="viewMode = 'lit'">
            漆面稿
          </button>
        </div>
      </header>

      <div v-if="store.state.error" class="error-banner">
        <Icon name="warning" /> {{ store.state.error }}
      </div>

      <div class="layout">
        <section class="card panel">
          <h3 class="panel-title">胎体参数</h3>
          <label class="field-label">器形</label>
          <div class="seg">
            <button
              v-for="k in bodyKinds"
              :key="k.value"
              class="seg-item"
              :class="{ active: order.body.kind === k.value }"
              @click="order.body.kind = k.value; touch()"
            >{{ k.label }}</button>
          </div>

          <template v-if="order.body.kind !== 'obj'">
            <SliderRow label="口径 / 长边" v-model="order.body.diameter" :min="60" :max="600" :step="1" unit="mm" @update:model-value="touch" />
            <SliderRow v-if="order.body.kind === 'box'" label="盒面短边" v-model="order.body.width" :min="40" :max="400" :step="1" unit="mm" @update:model-value="touch" />
            <SliderRow label="壁厚" v-model="order.body.wallThickness" :min="2" :max="20" :step="0.5" unit="mm" @update:model-value="touch" />
            <SliderRow label="沿口高度" v-model="order.body.rimHeight" :min="0" :max="12" :step="0.5" unit="mm" @update:model-value="touch" />
            <SliderRow label="盘面 / 碗心凹陷" v-model="order.body.curveDepth" :min="0" :max="24" :step="0.5" unit="mm" @update:model-value="touch" />
          </template>

          <template v-else>
            <input ref="fileInput" type="file" accept=".obj" class="hidden-file" @change="onObjFile" />
            <button class="btn" @click="fileInput?.click()"><Icon name="upload" /> 导入 OBJ 胎体</button>
            <p v-if="objError" class="error-text"><Icon name="warning" /> {{ objError }}</p>
            <p v-else-if="order.body.objText" class="muted obj-ok">已载入 {{ order.body.objText.split('\n').filter(l => l.startsWith('v ')).length }} 个顶点</p>
            <SliderRow label="导入缩放" v-model="order.body.objScale" :min="0.2" :max="3" :step="0.05" unit="x" @update:model-value="touch" />
          </template>

          <h3 class="panel-title second">起底凸点</h3>
          <label class="field-label">起底手法</label>
          <div class="seg">
            <button
              v-for="m in methods"
              :key="m.value"
              class="seg-item"
              :class="{ active: order.bump.method === m.value }"
              @click="order.bump.method = m.value; touch()"
            >{{ m.label }}</button>
          </div>

          <label class="field-label">分布方式</label>
          <select v-model="order.bump.distribution" class="full-input" @change="touch">
            <option v-for="d in distributions" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>

          <SliderRow label="凸点密度" v-model="order.bump.density" :min="0.2" :max="2.5" :step="0.05" unit=" 个/cm²" @update:model-value="touch" />
          <SliderRow label="凸点高度" v-model="order.bump.height" :min="0.3" :max="3" :step="0.1" unit="mm" @update:model-value="touch" />
          <SliderRow label="高度浮动" v-model="order.bump.heightVariation" :min="0" :max="0.8" :step="0.05" @update:model-value="touch" />
          <SliderRow label="凸点底径" v-model="order.bump.radius" :min="1.5" :max="6" :step="0.1" unit="mm" @update:model-value="touch" />

          <div class="seed-row">
            <div>
              <label class="field-label">随机种子</label>
              <input v-model.number="order.bump.seed" type="number" class="seed-input" @change="touch" />
            </div>
            <button class="btn" @click="reseed"><Icon name="reset" /> 换一批</button>
          </div>
        </section>

        <section class="card viewer-panel">
          <GlViewer
            :sim="sim"
            :order="order"
            :mode="viewMode"
            :light="lightPreset"
            grind-mode="orbit"
            :platen-z="0"
          />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1400px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--sp-5); }
.head-actions { display: flex; gap: var(--sp-2); }
.layout { display: grid; grid-template-columns: 360px 1fr; gap: var(--sp-5); align-items: stretch; }
.panel { padding: var(--sp-5); align-self: start; max-height: calc(100vh - 180px); overflow: auto; }
.panel-title { margin-bottom: var(--sp-4); }
.panel-title.second { margin-top: var(--sp-6); }
.seg { display: flex; gap: var(--sp-1); background: var(--slate-100); padding: 3px; border-radius: var(--radius-sm); margin-bottom: var(--sp-4); }
.seg-item {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--slate-600);
}
.seg-item.active { background: var(--surface); color: var(--brand-hover); font-weight: var(--fw-medium); box-shadow: var(--shadow-sm); }
.full-input { width: 100%; margin-bottom: var(--sp-4); }
.seed-row { display: flex; align-items: flex-end; gap: var(--sp-3); }
.seed-input { width: 140px; }
.hidden-file { display: none; }
.error-text { color: var(--danger); font-size: var(--fs-xs); display: flex; gap: var(--sp-1); align-items: center; margin-top: var(--sp-2); }
.obj-ok { margin-top: var(--sp-2); }
.viewer-panel { padding: var(--sp-2); min-height: 560px; }
.error-banner {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--danger);
  background: var(--danger-soft);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
  margin-bottom: var(--sp-4);
}
</style>
