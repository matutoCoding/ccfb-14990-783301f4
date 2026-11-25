// 确定性与物理正确性自测。pnpm selftest 运行
import { Rng } from '@/sim/prng'
import { presetOrders } from '@/data/presets'
import { buildSimulation, pushEvent, analyzePattern } from '@/sim/engine'
import type { WorkOrder, GrindEvent } from '@/sim/types'

let passed = 0
let failed = 0

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.error(`  FAIL  ${name} ${detail}`)
  }
}

function snapshot(order: WorkOrder) {
  const s = buildSimulation(order)
  let h1 = 0, h2 = 0, h3 = 0
  for (let i = 0; i < s.field.surface.length; i++) {
    h1 = (h1 + Math.imul(s.field.surface[i] | 0, i + 1)) | 0
    h2 = (h2 + s.layerIndex[i] * 31) | 0
    h3 = (h3 + Math.imul(s.field.removed[i] | 0, i + 7)) | 0
  }
  return { h1, h2, h3, state: s }
}

function randomEvents(order: WorkOrder, count: number, seed: number): GrindEvent[] {
  const rng = new Rng(seed)
  const span = order.body.diameter / 2 - 20
  const events: GrindEvent[] = []
  for (let k = 0; k < count; k++) {
    const ang = rng.unit() * Math.PI * 2
    const d = rng.unit() * span
    events.push({
      tool: 'disk',
      flat: false,
      z: 0,
      x: Math.cos(ang) * d,
      y: Math.sin(ang) * d,
      radius: order.tool.radius,
      bite: order.tool.maxBite * order.tool.pressure,
    })
  }
  return events
}

console.log('\n== 1. 两次构建逐位一致（同档案同结果） ==')
{
  const a = presetOrders()[0]
  a.grindEvents = randomEvents(a, 200, 99)
  const s1 = snapshot(a)
  const s2 = snapshot(a)
  check('surface/layerIndex/removed 哈希一致', s1.h1 === s2.h1 && s1.h2 === s2.h2 && s1.h3 === s2.h3,
    `got ${s1.h1},${s1.h2},${s1.h3} vs ${s2.h1},${s2.h2},${s2.h3}`)
}

console.log('\n== 2. 种子敏感性 ==')
{
  const a = presetOrders()[0]
  const b = structuredClone(a)
  b.bump = { ...a.bump, seed: a.bump.seed + 1 }
  const sa = buildSimulation(a)
  const sb = buildSimulation(b)
  let diff = 0
  for (let i = 0; i < sa.field.bumps.length; i++) if (sa.field.bumps[i] !== sb.field.bumps[i]) diff++
  check('换种子凸点场发生变化', diff > 100, `diff cells=${diff}`)
}

console.log('\n== 3. 凸顶流薄、凹处积厚与体积守恒 ==')
{
  const order = presetOrders()[0]
  const s = buildSimulation(order)
  const dep = s.deposits[0]
  let topSum = 0, valSum = 0, topN = 0, valN = 0
  for (let i = 0; i < s.field.mask.length; i++) {
    if (!s.field.mask[i]) continue
    // 凸点高度高于均值处视为凸顶
    if (s.field.bumps[i] > 0.9) { topSum += dep.thickness[i]; topN++ }
    if (s.field.bumps[i] < 0.15) { valSum += dep.thickness[i]; valN++ }
  }
  const topMean = topSum / topN
  const valMean = valSum / valN
  check('凹处均厚 > 凸顶均厚', valMean > topMean, `valley=${valMean.toFixed(4)} top=${topMean.toFixed(4)}`)

  let total = 0, cnt = 0
  for (let i = 0; i < dep.thickness.length; i++) {
    if (s.field.mask[i]) { total += dep.thickness[i]; cnt++ }
  }
  const expected = order.layers[0].thickness * (1 - order.layers[0].shrink)
  const mean = total / cnt
  check('体积守恒：均厚≈名义厚×(1-收缩)', Math.abs(mean - expected) < expected * 0.02,
    `mean=${mean.toFixed(4)} expected≈${expected.toFixed(4)}`)
}

console.log('\n== 4. 打磨磨穿标红 ==')
{
  const order = presetOrders()[0]
  const s = buildSimulation(order)
  // 平面磨直接压到起底顶面以下
  pushEvent(s, { tool: 'platen', flat: true, z: -100, x: 0, y: 0, radius: 0, bite: 0 })
  const breach = count(s.layerIndex, -1)
  let active = 0
  for (let i = 0; i < s.field.mask.length; i++) if (s.field.mask[i]) active++
  check('全域磨穿后有效格 layerIndex=-1', breach > active * 0.99, `breach=${breach} active=${active}`)
}

console.log('\n== 5. 事件流重放一致 ==')
{
  const order = presetOrders()[1]
  order.grindEvents = randomEvents(order, 300, 7)
  const a = buildSimulation(order)
  const b = buildSimulation(order, { upToEvents: 300 })
  let same = true
  for (let i = 0; i < a.field.surface.length; i++) {
    if (a.field.surface[i] !== b.field.surface[i] || a.layerIndex[i] !== b.layerIndex[i]) { same = false; break }
  }
  check('全量构建与重放 300 事件结果一致', same)
  const stats = analyzePattern(a, order, order.thinThreshold)
  check('纹样统计输出有效', stats.colorArea.length > 0 && stats.sampledCells > 0,
    `colors=${stats.colorArea.length} density=${stats.boundaryDensity.toFixed(2)}`)
}

console.log('\n== 6. 性能：400mm 盘全链路 + 300 事件 ==')
{
  const order = presetOrders()[0]
  order.grindEvents = randomEvents(order, 300, 7)
  const t0 = performance.now()
  buildSimulation(order)
  const ms = performance.now() - t0
  check(`全链路耗时 < 2000ms（实测 ${ms.toFixed(0)}ms）`, ms < 2000)
}

console.log('\n== 7. 四个预置件均可构建 ==')
{
  for (const o of presetOrders()) {
    const s = buildSimulation(o)
    check(`${o.name} 构建成功`, s.deposits.length === o.layers.length && s.field.mask.some(Boolean))
  }
}

function count(arr: Int16Array, v: number): number {
  let n = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] === v) n++
  return n
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`)
if (failed) process.exit(1)
