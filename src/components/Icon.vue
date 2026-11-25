<script setup lang="ts">
// 统一线性图标：stroke 1.7、圆角端点，中性色，尺寸随 currentColor
const props = defineProps<{ name: string; size?: number }>()
const size = props.size ?? 18

const paths: Record<string, string> = {
  works: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0 9 4.5 9-4.5M12 12v9',
  body: 'M4 18c2-6 6-9 8-9s6 3 8 9M7 18h10M12 3v3',
  layers: 'M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  grind: 'M5 19 19 5m-2 0h2v2M7 15l-2 4 4-2',
  pattern: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 4h7m-7 3h7',
  sheet: 'M7 3h7l4 4v14H7V3Zm7 0v4h4M9 12h6M9 16h6M9 8h2',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  print: 'M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2m-10 0h10v4H7v-4Z',
  reset: 'M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 5.6 5.6L4 7M4 15a8 8 0 0 0 14.4 3.4L20 17',
  play: 'M6 4l14 8-14 8V4Z',
  back: 'M19 12H5m6-7-7 7 7 7',
  warning: 'M12 3 2 20h20L12 3Zm0 7v4m0 3h.01',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 17v3h16v-3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  save: 'M5 3h11l3 3v15H5V3Zm4 0v5h6V3m-7 9h8v9H8v-9Z',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? ''" />
  </svg>
</template>
