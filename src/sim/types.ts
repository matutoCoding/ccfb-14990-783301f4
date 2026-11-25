// 仿真领域类型定义。长度单位统一毫米(mm)，颜色为 0-255 RGB

export type BodyKind = 'plate' | 'box' | 'bowl' | 'obj'
export type BumpMethod = 'seed-hemp' | 'finger'
export type BumpDistribution = 'poisson' | 'jitter-grid' | 'random'
export type ToolKind = 'platen' | 'disk' | 'hand'

export interface BodyParams {
  kind: BodyKind
  // 盘/碗：口径；盒：长边
  diameter: number
  // 盒专用短边，盘碗忽略
  width: number
  // 器高（侧壁，主要用于工艺单与侧沿渲染）
  height: number
  wallThickness: number
  // 盘沿高度
  rimHeight: number
  // 盘面/碗心相对沿口的凹陷深度
  curveDepth: number
  // 导入的 OBJ 文本（仅 kind=obj 使用）
  objText: string
  objScale: number
}

export interface BumpParams {
  method: BumpMethod
  distribution: BumpDistribution
  // 凸点密度：个 / 平方厘米
  density: number
  // 凸点平均高度 mm
  height: number
  // 高度随机浮动比例 0-1
  heightVariation: number
  // 凸点底径 mm
  radius: number
  // 种子，同种子同结果
  seed: number
}

export interface LacquerLayer {
  id: string
  name: string
  // 名义湿漆厚度 mm
  thickness: number
  // 干燥收缩率 0-1
  shrink: number
  // 流动系数 0-1，控制凸顶流薄凹处积厚的强度
  flow: number
  color: [number, number, number]
  // 阴干天数
  dryDays: number
}

export interface GrindTool {
  kind: ToolKind
  name: string
  // 接触半径 mm（platen 忽略，按胎体全域）
  radius: number
  // 下压力度 0-1，换算单次吃刀量
  pressure: number
  // 力度满格时的单次吃刀量 mm
  maxBite: number
}

// 一次确定性的磨削动作（路径重采样后的最小单位）
export interface GrindEvent {
  tool: ToolKind
  // 平面磨：绝对磨面高度；球面磨忽略
  z: number
  // 域中心为原点的平面坐标 mm
  x: number
  y: number
  radius: number
  // 球面磨单次吃刀量 mm
  bite: number
  flat: boolean
}

// 一笔（一次按压拖拽周期），用于回放定位
export interface StrokeRecord {
  id: string
  // 第几笔，从 0 开始
  index: number
  tool: ToolKind
  // 该笔包含的事件区间 [eventStart, eventEnd)
  eventStart: number
  eventEnd: number
  // 打磨进行到的相对时间（秒），仅展示用
  atSeconds: number
  note: string
}

export interface ReferenceImage {
  name: string
  // 缩放到 256px 的 PNG dataURL，存 IndexedDB
  dataUrl: string
}

export interface WorkOrder {
  id: string
  name: string
  customer: string
  createdAt: number
  updatedAt: number
  note: string
  body: BodyParams
  bump: BumpParams
  layers: LacquerLayer[]
  tool: GrindTool
  // 磨穿预警之外的薄胎阈值 mm
  thinThreshold: number
  reference: ReferenceImage | null
  // 打磨事件流（确定性的唯一来源）
  grindEvents: GrindEvent[]
  strokes: StrokeRecord[]
}

export interface LayerSample {
  layerIndex: number
  // 该格露出的漆层序号，磨穿为 -1
  areaRatio: number
}

export interface PatternStats {
  // 量化色桶 -> 面积占比，按占比降序
  colorArea: { color: [number, number, number]; ratio: number }[]
  // 纹路密度：单位平方厘米内的色界边长
  boundaryDensity: number
  // 磨穿面积占比
  breachRatio: number
  // 薄漆预警面积占比
  thinRatio: number
  sampledCells: number
}
