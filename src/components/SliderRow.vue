<script setup lang="ts">
defineProps<{
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [v: number] }>()
function onInput(e: Event): void {
  emit('update:modelValue', Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="slider-row">
    <div class="slider-head">
      <span class="slider-label">{{ label }}</span>
      <span class="slider-value">
        {{ modelValue }}<template v-if="unit">{{ unit }}</template>
      </span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step ?? 0.1"
      :value="modelValue"
      :disabled="disabled"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.slider-row { margin-bottom: var(--sp-4); }
.slider-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--sp-1);
}
.slider-label { font-size: var(--fs-xs); font-weight: var(--fw-medium); color: var(--slate-700); }
.slider-value { font-size: var(--fs-xs); color: var(--brand-hover); font-weight: var(--fw-medium); }
input[type='range'] {
  width: 100%;
  accent-color: var(--brand);
  padding: 0;
  border: none;
  background: transparent;
}
input[type='range']:focus { box-shadow: none; }
</style>
