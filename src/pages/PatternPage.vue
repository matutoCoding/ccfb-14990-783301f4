<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import EmptyState from '@/components/EmptyState.vue'
import GlViewer from '@/components/GlViewer.vue'
import { useStore } from '@/store/app'
import { analyzePattern } from '@/sim/engine'
import { LIGHT_PRESETS } from '@/gl/renderer'
import type { ReferenceImage } from '@/sim/types'
const store = useStore()
const order = computed(() => store.current.value)
const sim = computed(() => store.simState.value)
const fileInput = ref<HTMLInputElement | null>(null)
const refError = ref('')

const stats = computed(() => {
  if (!sim.value || !order.value) return null
  return analyzePattern(sim.value, order.value, order.value.thinThreshold)
})

const refPalette = ref<Array<{ color: [number, number, number]; ratio: number }>>([])
const refDensity = ref(0)

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

// 参考图缩到 256px 并量化到 8 色桶，得出面积占比与色界密度
function onPick(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !order.value) return
  if (!file.type.startsWith('image/')) {
    refError.value = '请选择图片文件'
    return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const size = 256
    const cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    const ctx = cv.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    const buckets = new Map<string, { color: [number, number, number]; count: number }>()
    let prevLum: number[] = []
    let boundaries = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = (y * size + x) * 4
        const q: [number, number, number] = [
          quant(data[p]), quant(data[p + 1]), quant(data[p + 2]),
        ]
        const key = q.join(',')
        const cur = buckets.get(key)
        if (cur) cur.count++
        else buckets.set(key, { color: q, count: 1 })
        const lum = data[p] + data[p + 1] + data[p + 2]
        if (x > 0 && Math.abs(lum - prevLum[x - 1]) > 60) boundaries++
        prevLum[x] = lum
      }
    }
    const total = size * size
    refPalette.value = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((b) => ({ color: b.color, ratio: b.count / total }))
    // 参考图按盘面物理尺寸换算密度
    const areaCm2 = Math.PI * (order.value!.body.diameter / 20) ** 2
    refDensity.value = boundaries / areaCm2
    const ref: ReferenceImage = { name: file.name, dataUrl: cv.toDataURL('image/png') }
    store.setReference(ref)
    URL.revokeObjectURL(url)
    refError.value = ''
  }
  img.onerror = () => {
    refError.value = '图片解码失败'
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function quant(v: number): number {
  return Math.min(255, Math.round(v / 32) * 32)
}

function clearRef(): void {
  store.setReference(null)
  refPalette.value = []
  refDensity.value = 0
}
</script>

<template>
  <div class="page">
    <EmptyState
      v-if="!order"
      icon="pattern"
      title="还没有打开的作品"
      subtitle="先在作品列表里新建或选择一件作品"
    />

    <template v-else>
      <header class="page-head">
        <div>
          <h1>纹样比对</h1>
          <p class="muted">客户参考照片与当前磨显结果并排，量化色块面积与纹路密度</p>
        </div>
        <div class="head-actions no-print">
          <input ref="fileInput" type="file" accept="image/*" class="hidden-file" @change="onPick" />
          <button class="btn btn-primary" @click="fileInput?.click()"><Icon name="upload" /> 上传参考照片</button>
          <button v-if="order.reference" class="btn btn-danger" @click="clearRef"><Icon name="trash" /> 移除</button>
        </div>
      </header>

      <p v-if="refError" class="error-banner"><Icon name="warning" /> {{ refError }}</p>

      <div class="compare-grid">
        <section class="card pane">
          <h3 class="pane-title">客户参考照片</h3>
          <div v-if="order.reference" class="img-box">
            <img :src="order.reference.dataUrl" :alt="order.reference.name" />
          </div>
          <div v-else class="img-placeholder">
            <Icon name="pattern" :size="32" />
            <p class="muted">未上传参考照片</p>
          </div>

          <div v-if="refPalette.length" class="palette-block">
            <h4 class="block-label">参考色块面积占比</h4>
            <div v-for="(b, i) in refPalette" :key="i" class="ratio-row">
              <i class="dot" :style="{ background: rgb(b.color) }" />
              <div class="bar-track"><div class="bar" :style="{ width: `${b.ratio * 100}%`, background: rgb(b.color) }" /></div>
              <span class="ratio-num">{{ (b.ratio * 100).toFixed(1) }}%</span>
            </div>
            <p class="muted density-line">纹路密度：{{ refDensity.toFixed(2) }} 条/cm²</p>
          </div>
        </section>

        <section class="card pane">
          <h3 class="pane-title">推演磨显结果</h3>
          <div class="sim-box">
            <GlViewer
              :sim="sim"
              :order="order"
              mode="flat"
              :light="LIGHT_PRESETS[0]"
              grind-mode="orbit"
              :platen-z="0"
            />
          </div>

          <div v-if="stats" class="palette-block">
            <h4 class="block-label">推演色块面积占比</h4>
            <div v-for="(b, i) in stats.colorArea" :key="i" class="ratio-row">
              <i class="dot" :style="{ background: rgb(b.color) }" />
              <div class="bar-track"><div class="bar" :style="{ width: `${b.ratio * 100}%`, background: rgb(b.color) }" /></div>
              <span class="ratio-num">{{ (b.ratio * 100).toFixed(1) }}%</span>
            </div>
            <p class="muted density-line">
              纹路密度：{{ stats.boundaryDensity.toFixed(2) }} 条/cm² ·
              磨穿 {{ (stats.breachRatio * 100).toFixed(2) }}% ·
              薄漆 {{ (stats.thinRatio * 100).toFixed(2) }}%
            </p>
          </div>
        </section>
      </div>

      <section v-if="stats && refPalette.length" class="card verdict">
        <h3 class="block-label">相似度参考</h3>
        <div class="verdict-grid">
          <div class="verdict-item">
            <span class="muted">纹路密度差异</span>
            <strong>{{ Math.abs(stats.boundaryDensity - refDensity).toFixed(2) }} 条/cm²</strong>
          </div>
          <div class="verdict-item">
            <span class="muted">主色数量（参考 / 推演）</span>
            <strong>{{ refPalette.length }} / {{ stats.colorArea.length }}</strong>
          </div>
        </div>
        <p class="muted verdict-note">
          量化值供工艺判断参考：密度差越小、各色块占比越接近，磨显纹样与客户预期越吻合。
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1400px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--sp-5); }
.head-actions { display: flex; gap: var(--sp-2); }
.hidden-file { display: none; }
.error-banner { color: var(--danger); background: var(--danger-soft); padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-sm); font-size: var(--fs-xs); display: flex; gap: var(--sp-2); align-items: center; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); }
.pane { padding: var(--sp-5); }
.pane-title { margin-bottom: var(--sp-4); }
.img-box, .sim-box, .img-placeholder {
  width: 100%;
  aspect-ratio: 1;
  max-height: 380px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--slate-950);
}
.img-box img { width: 100%; height: 100%; object-fit: contain; }
.sim-box { max-height: none; }
.img-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-3); color: var(--slate-500); background: var(--slate-100); }
.palette-block { margin-top: var(--sp-5); }
.block-label { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--slate-700); margin-bottom: var(--sp-3); }
.ratio-row { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-2); }
.dot { width: 16px; height: 16px; border-radius: var(--radius-sm); flex: none; border: 1px solid rgba(15,23,42,.15); }
.bar-track { flex: 1; height: 10px; background: var(--slate-100); border-radius: 999px; overflow: hidden; }
.bar { height: 100%; border-radius: 999px; }
.ratio-num { width: 56px; text-align: right; font-size: var(--fs-xs); font-weight: var(--fw-medium); }
.density-line { margin-top: var(--sp-3); }
.verdict { margin-top: var(--sp-5); padding: var(--sp-5); }
.verdict-grid { display: flex; gap: var(--sp-7); margin-bottom: var(--sp-3); }
.verdict-item { display: flex; flex-direction: column; gap: var(--sp-1); }
.verdict-note { margin: 0; }
</style>
