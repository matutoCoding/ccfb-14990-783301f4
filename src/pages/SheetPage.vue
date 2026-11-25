<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useStore } from '@/store/app'
import { summarizeDeposit } from '@/sim/lacquer'

const store = useStore()
const order = computed(() => store.current.value)
const sim = computed(() => store.simState.value)

const bodyLabel: Record<string, string> = {
  plate: '茶盘', box: '盒', bowl: '碗', obj: 'OBJ 导入胎体',
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const totalDryDays = computed(() =>
  order.value?.layers.reduce((s, l) => s + l.dryDays, 0) ?? 0,
)

function summary(i: number) {
  const s = sim.value
  if (!s || !s.deposits[i]) return null
  return summarizeDeposit(s.deposits[i], s.field.mask)
}

function printSheet(): void {
  window.print()
}

const today = new Date().toLocaleDateString('zh-CN')
</script>

<template>
  <div class="page">
    <EmptyState
      v-if="!order"
      icon="sheet"
      title="还没有打开的作品"
      subtitle="先在作品列表里新建或选择一件作品"
    />

    <template v-else>
      <header class="page-head no-print">
        <div>
          <h1>工艺单</h1>
          <p class="muted">逐层配色、厚度、阴干天数与打磨顺序，可直接打印交付车间</p>
        </div>
        <button class="btn btn-primary" @click="printSheet"><Icon name="print" /> 打印工艺单</button>
      </header>

      <article class="card sheet print-area">
        <div class="sheet-head">
          <div>
            <h2>{{ order.name }}</h2>
            <p class="muted">客户：{{ order.customer || '—' }} · 出单日期：{{ today }}</p>
          </div>
          <div class="sheet-seal">犀皮漆工艺单</div>
        </div>

        <section class="sheet-section">
          <h3>一、胎体与起底</h3>
          <table class="info-table">
            <tbody>
              <tr>
                <td class="info-key">器形</td><td>{{ bodyLabel[order.body.kind] }}</td>
                <td class="info-key">口径 / 长边</td><td>{{ order.body.diameter }} mm</td>
              </tr>
              <tr v-if="order.body.kind === 'box'">
                <td class="info-key">短边</td><td>{{ order.body.width }} mm</td>
                <td class="info-key">壁厚</td><td>{{ order.body.wallThickness }} mm</td>
              </tr>
              <tr v-else>
                <td class="info-key">壁厚</td><td>{{ order.body.wallThickness }} mm</td>
                <td class="info-key">沿口高度</td><td>{{ order.body.rimHeight }} mm</td>
              </tr>
              <tr>
                <td class="info-key">起底手法</td>
                <td>{{ order.bump.method === 'finger' ? '手指捺点' : '稠漆加麻籽' }}</td>
                <td class="info-key">凸点密度</td>
                <td>{{ order.bump.density }} 个/cm²</td>
              </tr>
              <tr>
                <td class="info-key">凸点高度</td><td>{{ order.bump.height }} mm</td>
                <td class="info-key">凸点底径</td><td>{{ order.bump.radius }} mm</td>
              </tr>
              <tr>
                <td class="info-key">分布方式</td><td>{{ order.bump.distribution }}</td>
                <td class="info-key">随机种子</td><td>{{ order.bump.seed }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="sheet-section">
          <h3>二、髹漆层次（共 {{ order.layers.length }} 层，累计阴干 {{ totalDryDays }} 天）</h3>
          <table class="layer-table">
            <thead>
              <tr>
                <th>序</th><th>漆层</th><th>配色</th><th>名义湿厚</th>
                <th>收缩率</th><th>流动系数</th><th>实际均厚</th><th>阴干天数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ly, i) in order.layers" :key="ly.id">
                <td>{{ i + 1 }}</td>
                <td>{{ ly.name }}</td>
                <td><span class="color-cell"><i class="swatch" :style="{ background: rgb(ly.color) }" />RGB {{ ly.color.join(',') }}</span></td>
                <td>{{ ly.thickness }} mm</td>
                <td>{{ (ly.shrink * 100).toFixed(0) }}%</td>
                <td>{{ ly.flow }}</td>
                <td>{{ summary(i) ? summary(i)!.mean.toFixed(3) + ' mm' : '—' }}</td>
                <td>{{ ly.dryDays }} 天</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="sheet-section">
          <h3>三、打磨顺序</h3>
          <table v-if="order.strokes.length" class="grind-table">
            <thead>
              <tr><th>笔次</th><th>磨具</th><th>内容</th><th>事件区间</th></tr>
            </thead>
            <tbody>
              <tr v-for="(st, i) in order.strokes" :key="st.id">
                <td>{{ i + 1 }}</td>
                <td>{{ st.tool }}</td>
                <td>{{ st.note }}</td>
                <td>第 {{ st.eventStart + 1 }} – {{ st.eventEnd }} 刀</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted">尚未记录打磨动作，可在打磨推演页下刀后自动生成顺序。</p>
          <p class="muted tool-line">
            磨具：{{ order.tool.name }}（接触半径 {{ order.tool.radius }}mm，
            下压力度 {{ order.tool.pressure }}，满力吃刀 {{ order.tool.maxBite }}mm）·
            薄漆预警阈值 {{ order.thinThreshold }}mm
          </p>
        </section>

        <section v-if="order.note" class="sheet-section">
          <h3>四、备注</h3>
          <p>{{ order.note }}</p>
        </section>
      </article>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1100px; margin: 0 auto; }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--sp-5); }
.sheet { padding: var(--sp-7); }
.sheet-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: var(--sp-5); border-bottom: 2px solid var(--slate-800); margin-bottom: var(--sp-5); }
.sheet-seal {
  border: 2px solid var(--brand);
  color: var(--brand);
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-4);
  font-weight: var(--fw-semibold);
  letter-spacing: 2px;
}
.sheet-section { margin-bottom: var(--sp-6); }
.sheet-section h3 { margin-bottom: var(--sp-4); font-size: var(--fs-base); }
table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.info-table td { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
.info-key { color: var(--slate-500); width: 14%; }
.layer-table th, .layer-table td, .grind-table th, .grind-table td {
  border: 1px solid var(--slate-300);
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
}
.layer-table th, .grind-table th { background: var(--slate-100); font-weight: var(--fw-semibold); }
.color-cell { display: inline-flex; align-items: center; gap: var(--sp-2); }
.swatch { width: 18px; height: 18px; border-radius: var(--radius-sm); border: 1px solid rgba(15,23,42,.15); display: inline-block; }
.tool-line { margin-top: var(--sp-3); }
</style>
