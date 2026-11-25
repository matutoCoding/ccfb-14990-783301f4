// 默认参数与预置作品。预置件固定 id 与种子，保证每次初始化数据一致

import type { WorkOrder, BodyParams, BumpParams, LacquerLayer, GrindTool } from '@/sim/types'

export function uid(prefix = 'wo'): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export const LACQUER_COLORS: Record<string, [number, number, number]> = {
  vermilion: [168, 36, 32],
  black: [26, 24, 24],
  gold: [212, 168, 60],
  brown: [110, 62, 38],
  green: [58, 88, 70],
  chestnut: [138, 72, 48],
}

export function defaultBody(): BodyParams {
  return {
    kind: 'plate',
    diameter: 400,
    width: 260,
    height: 30,
    wallThickness: 8,
    rimHeight: 4,
    curveDepth: 3,
    objText: '',
    objScale: 1,
  }
}

export function defaultBump(seed = 20260101): BumpParams {
  return {
    method: 'seed-hemp',
    distribution: 'poisson',
    density: 0.9,
    height: 1.2,
    heightVariation: 0.35,
    radius: 3.2,
    seed,
  }
}

export function makeLayer(
  name: string,
  color: [number, number, number],
  thickness: number,
  dryDays: number,
  flow = 0.55,
): LacquerLayer {
  return {
    id: uid('ly'),
    name,
    thickness,
    shrink: 0.12,
    flow,
    color,
    dryDays,
  }
}

export function defaultTool(): GrindTool {
  return {
    kind: 'disk',
    name: '圆盘砂 30mm',
    radius: 30,
    pressure: 0.5,
    maxBite: 0.06,
  }
}

export function createOrder(partial: Partial<WorkOrder> = {}): WorkOrder {
  const now = Date.now()
  return {
    id: uid(),
    name: '未命名作品',
    customer: '',
    createdAt: now,
    updatedAt: now,
    note: '',
    body: defaultBody(),
    bump: defaultBump(),
    layers: [],
    tool: defaultTool(),
    thinThreshold: 0.6,
    reference: null,
    grindEvents: [],
    strokes: [],
    ...partial,
  }
}

// 预置件 1：红黑黄三色经典款茶盘
function classicPlate(): WorkOrder {
  const order = createOrder({
    id: 'preset-classic-plate',
    name: '三色经典·圆月茶盘',
    customer: '预置测试件',
    note: '朱红、黑漆、金黄三色交替，犀皮漆入门经典配色',
  })
  order.body = { ...defaultBody(), kind: 'plate', diameter: 400, rimHeight: 4, curveDepth: 3 }
  order.bump = defaultBump(1101)
  order.layers = [
    { ...makeLayer('底漆·朱红', LACQUER_COLORS.vermilion, 0.5, 3, 0.5), id: 'ly-c1' },
    { ...makeLayer('二层·黑漆', LACQUER_COLORS.black, 0.4, 4, 0.55), id: 'ly-c2' },
    { ...makeLayer('三层·金黄', LACQUER_COLORS.gold, 0.4, 5, 0.6), id: 'ly-c3' },
    { ...makeLayer('四层·黑漆', LACQUER_COLORS.black, 0.35, 4, 0.55), id: 'ly-c4' },
    { ...makeLayer('面漆·朱红', LACQUER_COLORS.vermilion, 0.45, 5, 0.5), id: 'ly-c5' },
  ]
  return order
}

// 预置件 2：八层复杂款
function complexPlate(): WorkOrder {
  const order = createOrder({
    id: 'preset-complex-plate',
    name: '八层叠韵·大茶盘',
    customer: '预置测试件',
    note: '八层髹涂复杂款，用于验证多层磨显与回放',
  })
  order.body = { ...defaultBody(), kind: 'plate', diameter: 400, rimHeight: 5, curveDepth: 4 }
  order.bump = { ...defaultBump(2202), density: 1.15, height: 1.5, radius: 2.8 }
  const seq: Array<[string, [number, number, number], number]> = [
    ['底·朱红', LACQUER_COLORS.vermilion, 0.45],
    ['二·黑', LACQUER_COLORS.black, 0.35],
    ['三·金黄', LACQUER_COLORS.gold, 0.35],
    ['四·褐', LACQUER_COLORS.brown, 0.4],
    ['五·黑', LACQUER_COLORS.black, 0.35],
    ['六·朱红', LACQUER_COLORS.vermilion, 0.4],
    ['七·绿沉', LACQUER_COLORS.green, 0.35],
    ['面·黑', LACQUER_COLORS.black, 0.45],
  ]
  order.layers = seq.map(([name, color, t], i) => ({
    ...makeLayer(name, color, t, 3 + (i % 3), 0.5 + (i % 3) * 0.08),
    id: `ly-x${i + 1}`,
  }))
  order.thinThreshold = 0.8
  return order
}

// 预置件 3：方盒
function sealBox(): WorkOrder {
  const order = createOrder({
    id: 'preset-seal-box',
    name: '金线犀皮·印盒',
    customer: '预置测试件',
    note: '矩形盒面，验证盒体参数化与线脚起沿',
  })
  order.body = { ...defaultBody(), kind: 'box', diameter: 180, width: 120, rimHeight: 3, curveDepth: 2 }
  order.bump = { ...defaultBump(3303), density: 1.0, height: 1.0, radius: 2.6 }
  order.layers = [
    { ...makeLayer('底·黑', LACQUER_COLORS.black, 0.4, 4), id: 'ly-b1' },
    { ...makeLayer('二·金黄', LACQUER_COLORS.gold, 0.35, 5), id: 'ly-b2' },
    { ...makeLayer('三·朱红', LACQUER_COLORS.vermilion, 0.4, 4), id: 'ly-b3' },
    { ...makeLayer('面·黑', LACQUER_COLORS.black, 0.4, 5), id: 'ly-b4' },
  ]
  return order
}

// 预置件 4：碗
function teaBowl(): WorkOrder {
  const order = createOrder({
    id: 'preset-tea-bowl',
    name: '深弧犀皮·茶碗',
    customer: '预置测试件',
    note: '深弧碗心，验证曲面胎体上的漆层流动',
  })
  order.body = { ...defaultBody(), kind: 'bowl', diameter: 120, rimHeight: 3, curveDepth: 18 }
  order.bump = { ...defaultBump(4404), method: 'finger', distribution: 'jitter-grid', density: 0.8, height: 0.9, radius: 3.5 }
  order.layers = [
    { ...makeLayer('底·褐', LACQUER_COLORS.chestnut, 0.45, 4, 0.65), id: 'ly-w1' },
    { ...makeLayer('二·黑', LACQUER_COLORS.black, 0.35, 4, 0.6), id: 'ly-w2' },
    { ...makeLayer('三·朱红', LACQUER_COLORS.vermilion, 0.4, 5, 0.6), id: 'ly-w3' },
    { ...makeLayer('面·金黄', LACQUER_COLORS.gold, 0.35, 6, 0.65), id: 'ly-w4' },
  ]
  return order
}

export function presetOrders(): WorkOrder[] {
  return [classicPlate(), complexPlate(), sealBox(), teaBowl()]
}
