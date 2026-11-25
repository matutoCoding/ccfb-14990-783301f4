<script setup lang="ts">
import Icon from '@/components/Icon.vue'
defineProps<{ icon: string; title: string; subtitle: string }>()
</script>

<template>
  <div class="empty-card">
    <div class="empty-icon"><Icon :name="icon" :size="28" /></div>
    <h3>{{ title }}</h3>
    <p class="muted">{{ subtitle }}</p>
    <div class="empty-action"><slot /></div>
  </div>
</template>

<style scoped>
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-7) var(--sp-5);
  text-align: center;
}
.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--slate-100);
  color: var(--slate-400);
  display: grid;
  place-items: center;
  margin-bottom: var(--sp-2);
}
.empty-action { margin-top: var(--sp-4); }
</style>
