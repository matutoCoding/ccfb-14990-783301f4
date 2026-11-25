<script setup lang="ts">
import { onMounted } from 'vue'
import Icon from '@/components/Icon.vue'
import WorksPage from '@/pages/WorksPage.vue'
import BodyPage from '@/pages/BodyPage.vue'
import LacquerPage from '@/pages/LacquerPage.vue'
import GrindPage from '@/pages/GrindPage.vue'
import PatternPage from '@/pages/PatternPage.vue'
import SheetPage from '@/pages/SheetPage.vue'
import { useStore, type PageKey } from '@/store/app'

const store = useStore()
onMounted(() => store.init())

const nav: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: 'works', label: '作品列表', icon: 'works' },
  { key: 'body', label: '胎体与起底', icon: 'body' },
  { key: 'lacquer', label: '髹漆层', icon: 'layers' },
  { key: 'grind', label: '打磨推演', icon: 'grind' },
  { key: 'pattern', label: '纹样比对', icon: 'pattern' },
  { key: 'sheet', label: '工艺单', icon: 'sheet' },
]
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar no-print">
      <div class="brand">
        <div class="brand-mark">犀</div>
        <div>
          <div class="brand-name">犀皮漆推演台</div>
          <div class="brand-sub">髹饰工艺仿真</div>
        </div>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in nav"
          :key="item.key"
          class="nav-item"
          :class="{ active: store.state.page === item.key }"
          @click="store.goto(item.key)"
        >
          <Icon :name="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="sidebar-foot muted" v-if="store.current.value">
        当前作品
        <div class="foot-name">{{ store.current.value.name }}</div>
      </div>
    </aside>

    <main class="main-area">
      <WorksPage v-if="store.state.page === 'works'" />
      <BodyPage v-else-if="store.state.page === 'body'" />
      <LacquerPage v-else-if="store.state.page === 'lacquer'" />
      <GrindPage v-else-if="store.state.page === 'grind'" />
      <PatternPage v-else-if="store.state.page === 'pattern'" />
      <SheetPage v-else-if="store.state.page === 'sheet'" />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 232px 1fr;
  height: 100%;
}
.sidebar {
  background: var(--slate-900);
  color: var(--slate-300);
  display: flex;
  flex-direction: column;
  padding: var(--sp-5) var(--sp-4);
  gap: var(--sp-5);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-2);
}
.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, #b45309, #7c2d12);
  color: #fef3c7;
  display: grid;
  place-items: center;
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}
.brand-name { color: #f8fafc; font-weight: var(--fw-semibold); font-size: var(--fs-base); }
.brand-sub { font-size: var(--fs-xs); color: var(--slate-500); }
.nav-list { display: flex; flex-direction: column; gap: var(--sp-1); }
.nav-item { color: var(--slate-300); }
.nav-item:hover { background: rgba(255, 255, 255, 0.06); color: #f8fafc; }
.nav-item.active { background: rgba(180, 83, 9, 0.22); color: #fbbf24; }
.sidebar-foot { margin-top: auto; padding: var(--sp-3); border-top: 1px solid rgba(255,255,255,0.08); }
.foot-name { color: var(--slate-200); font-weight: var(--fw-medium); margin-top: var(--sp-1); }
.main-area { overflow: auto; min-width: 0; }
</style>
