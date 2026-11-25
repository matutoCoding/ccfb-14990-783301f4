<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useStore } from '@/store/app'
import type { WorkOrder } from '@/sim/types'

const store = useStore()
const orders = computed(() => store.state.orders)

const bodyLabel: Record<string, string> = {
  plate: '茶盘', box: '盒', bowl: '碗', obj: 'OBJ 导入',
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function open(o: WorkOrder): void {
  store.openOrder(o.id)
  store.goto('body')
}

async function remove(e: Event, o: WorkOrder): Promise<void> {
  e.stopPropagation()
  if (window.confirm(`确定删除作品「${o.name}」？打磨记录将一并清除。`)) {
    await store.removeOrder(o.id)
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>作品列表</h1>
        <p class="muted">按订单管理胎体、髹漆与打磨推演档案，数据保存在本机 IndexedDB</p>
      </div>
      <button class="btn btn-primary" @click="store.newOrder()">
        <Icon name="plus" /> 新建作品
      </button>
    </header>

    <EmptyState
      v-if="!orders.length"
      icon="works"
      title="还没有任何作品"
      subtitle="新建一件作品，从胎体参数与起底开始你的犀皮漆推演"
    >
      <button class="btn btn-primary" @click="store.newOrder()"><Icon name="plus" /> 新建作品</button>
    </EmptyState>

    <div v-else class="grid">
      <article v-for="o in orders" :key="o.id" class="card order-card" @click="open(o)">
        <div class="card-top">
          <div>
            <h3>{{ o.name }}</h3>
            <div class="muted">{{ o.customer || '未填客户' }} · {{ bodyLabel[o.body.kind] }} ·
              {{ o.body.diameter }}mm</div>
          </div>
          <button class="btn btn-ghost btn-danger icon-btn" title="删除" @click="remove($event, o)">
            <Icon name="trash" />
          </button>
        </div>

        <div class="swatches">
          <span
            v-for="(ly, i) in o.layers"
            :key="ly.id"
            class="swatch"
            :style="{ background: rgb(ly.color) }"
            :title="`${i + 1}. ${ly.name}`"
          />
          <span v-if="!o.layers.length" class="muted">尚未髹漆</span>
        </div>

        <div class="card-meta">
          <div class="meta-item">
            <span class="meta-num">{{ o.layers.length }}</span>
            <span class="muted">漆层</span>
          </div>
          <div class="meta-item">
            <span class="meta-num">{{ o.strokes.length }}</span>
            <span class="muted">打磨笔数</span>
          </div>
          <div class="meta-item">
            <span class="meta-num">{{ o.grindEvents.length }}</span>
            <span class="muted">磨削刀数</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { padding: var(--sp-6); max-width: 1280px; margin: 0 auto; }
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--sp-6);
  gap: var(--sp-4);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
}
.order-card { padding: var(--sp-5); cursor: pointer; transition: box-shadow var(--t), transform var(--t); }
.order-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); }
.icon-btn { padding: var(--sp-2); }
.swatches { display: flex; gap: var(--sp-1); margin: var(--sp-4) 0; flex-wrap: wrap; }
.swatch {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.card-meta { display: flex; gap: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--border); }
.meta-item { display: flex; flex-direction: column; }
.meta-num { font-size: var(--fs-lg); font-weight: var(--fw-semibold); }
</style>
