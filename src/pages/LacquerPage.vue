<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useStore } from '@/store/app'
import { LACQUER_COLORS, makeLayer } from '@/data/presets'
import { summarizeDeposit } from '@/sim/lacquer'

const store = useStore()
const order = computed(() => store.current.value)
const sim = computed(() => store.simState.value)

const palette = Object.entries(LACQUER_COLORS)

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function addLayer(): void {
  if (!order.value) return
  if (order.value.layers.length >= 12) {
    window.alert('受渲染纹理编码限制，单件作品最多 12 层漆')
    return
  }
  const idx = order.value.layers.length
  const color = palette[idx % palette.length][1]
  order.value.layers.push(makeLayer(`第 ${idx + 1} 层`, color, 0.4, 4))
  store.scheduleRebuild()
}

function removeLayer(i: number): void {
  if (!order.value) return
  order.value.layers.splice(i, 1)
  store.scheduleRebuild()
}

function move(i: number, dir: -1 | 1): void {
  if (!order.value) return
  const j = i + dir
  const arr = order.value.layers
  if (j < 0 || j >= arr.length) return
  const tmp = arr[i]
  arr[i] = arr[j]
  arr[j] = tmp
  store.scheduleRebuild()
}

function touch(): void {
  store.scheduleRebuild()
}

function depositSummary(i: number): { min: number; max: number; mean: number } | null {
  const s = sim.value
  if (!s || !s.deposits[i]) return null
  return summarizeDeposit(s.deposits[i], s.field.mask)
}
</script>

<template>
  <div class="page">
    <EmptyState
      v-if="!order"
      icon="layers"
      title="还没有打开的作品"
      subtitle="先在作品列表里新建或选择一件作品"
    />

    <template v-else>
      <header class="page-head">
        <div>
          <h1>髹漆层</h1>
          <p class="muted">凸顶流薄、凹处积厚由流动系数与起伏曲率共同决定，实际厚度见每层统计</p>
        </div>
        <button class="btn btn-primary" :disabled="order.layers.length >= 12" @click="addLayer"><Icon name="plus" /> 加一层漆</button>
      </header>

      <div class="legend card">
        <span class="muted">漆色库：</span>
        <span v-for="[name, c] in palette" :key="name" class="legend-item">
          <i class="dot" :style="{ background: rgb(c) }" />
          <span class="muted">{{ name }}</span>
        </span>
      </div>

      <div v-if="!order.layers.length" class="card empty-layers">
        <p class="muted">还没有髹漆层。犀皮漆一般从底漆开始逐层叠加，磨显后下层颜色才会一圈圈露出来。</p>
        <button class="btn btn-primary" @click="addLayer"><Icon name="plus" /> 髹第一层</button>
      </div>

      <div v-else class="layer-stack">
        <article v-for="(ly, i) in order.layers" :key="ly.id" class="card layer-card">
          <div class="layer-index" :style="{ background: rgb(ly.color) }">{{ i + 1 }}</div>

          <div class="layer-main">
            <div class="layer-row">
              <input v-model="ly.name" class="name-input" @change="touch" />
              <div class="color-pick">
                <button
                  v-for="[name, c] in palette"
                  :key="name"
                  class="color-dot"
                  :class="{ selected: ly.color.join() === c.join() }"
                  :style="{ background: rgb(c) }"
                  :title="name"
                  @click="ly.color = [...c]; touch()"
                />
              </div>
            </div>

            <div class="param-grid">
              <label>
                <span class="field-label">名义湿厚 (mm)</span>
                <input v-model.number="ly.thickness" type="number" step="0.05" min="0.05" max="2" @change="touch" />
              </label>
              <label>
                <span class="field-label">干燥收缩率</span>
                <input v-model.number="ly.shrink" type="number" step="0.01" min="0" max="0.5" @change="touch" />
              </label>
              <label>
                <span class="field-label">流动系数</span>
                <input v-model.number="ly.flow" type="number" step="0.05" min="0" max="1" @change="touch" />
              </label>
              <label>
                <span class="field-label">阴干天数</span>
                <input v-model.number="ly.dryDays" type="number" step="1" min="1" max="30" @change="touch" />
              </label>
            </div>

            <div v-if="depositSummary(i)" class="thickness-stat muted">
              实际干厚：最薄 {{ depositSummary(i)!.min.toFixed(3) }}mm ·
              平均 {{ depositSummary(i)!.mean.toFixed(3) }}mm ·
              最厚 {{ depositSummary(i)!.max.toFixed(3) }}mm
            </div>
          </div>

          <div class="layer-actions">
            <button class="btn btn-ghost" :disabled="i === 0" title="上移" @click="move(i, -1)">↑</button>
            <button class="btn btn-ghost" :disabled="i === order.layers.length - 1" title="下移" @click="move(i, 1)">↓</button>
            <button class="btn btn-ghost btn-danger" title="删除" @click="removeLayer(i)"><Icon name="trash" /></button>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1100px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--sp-5); }
.legend { display: flex; gap: var(--sp-4); padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-4); flex-wrap: wrap; align-items: center; }
.legend-item { display: inline-flex; align-items: center; gap: var(--sp-1); }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid rgba(15,23,42,.15); }
.empty-layers { padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-4); align-items: flex-start; }
.layer-stack { display: flex; flex-direction: column; gap: var(--sp-3); }
.layer-card { display: flex; gap: var(--sp-4); padding: var(--sp-4); align-items: flex-start; }
.layer-index {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: var(--fw-semibold);
  font-size: var(--fs-base);
  text-shadow: 0 1px 2px rgba(0,0,0,.4);
}
.layer-main { flex: 1; min-width: 0; }
.layer-row { display: flex; justify-content: space-between; gap: var(--sp-4); margin-bottom: var(--sp-3); flex-wrap: wrap; }
.name-input { width: 200px; font-weight: var(--fw-medium); }
.color-pick { display: flex; gap: var(--sp-2); }
.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  padding: 0;
}
.color-dot.selected { border-color: var(--slate-800); box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--slate-400); }
.param-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-3); }
.param-grid input { width: 100%; }
.thickness-stat { margin-top: var(--sp-3); padding-top: var(--sp-2); border-top: 1px dashed var(--border); }
.layer-actions { display: flex; flex-direction: column; gap: var(--sp-1); }
</style>
