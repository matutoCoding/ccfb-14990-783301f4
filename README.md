# 犀皮漆髹饰推演系统

浏览器内的犀皮漆工艺仿真：参数化胎体 → 确定性起底 → 逐层髹漆（凸顶流薄、凹处积厚）→ 交互式打磨推演 → 纹样比对 → 可打印工艺单。

- TypeScript + 手写 WebGL2 着色器，无任何第三方 3D 库
- 工艺档案全部存 IndexedDB，离线可用
- 全链路确定性：同档案两次推演结果逐位一致

## 启动

```bash
pnpm install
pnpm dev        # 开发
pnpm build      # 类型检查 + 生产构建
pnpm selftest   # 确定性 / 物理 / 性能自测（12 项）
```

## 确定性保证（核心约束）

1. 仿真内禁止 `Math.random`，所有随机经 `src/sim/prng.ts` 的 mulberry32（种子存档案）
2. 高度场按 row-major 固定顺序遍历，浮点运算顺序跨运行一致
3. 打磨不直接存结果，只存 `GrindEvent` 事件流；回放即按序重放事件
4. 自测 1 对同一档案构建两次并比对 surface / layerIndex / removed 哈希

## 仿真模型

| 环节 | 文件 | 模型 |
| --- | --- | --- |
| 胎体 | `src/sim/body.ts` | 盘/盒/碗解析高度场；OBJ 取顶点投影最近邻 + 固定轮次扩散填充 |
| 起底 | `src/sim/bump.ts` | 高斯丘叠加；泊松圆盘 / 抖动网格 / 纯随机三种分布；手指法叠加值噪声 |
| 髹漆 | `src/sim/lacquer.ts` | 拉普拉斯曲率驱动厚薄再分配（体积守恒）+ 两遍固定匀化 + 干燥收缩 |
| 打磨 | `src/sim/grind.ts` | 平面磨压到绝对高度；球面磨二次曲面吃刀；磨穿 layerIndex=-1 |
| 编排 | `src/sim/engine.ts` | 全链路构建、事件重放、热力分级、纹样统计、路径重采样 |

高度场默认格宽约 0.8mm（256–640 格钳制），400mm 盘约 26 万顶点，全链路 + 300 磨削事件实测约 110ms。

## 渲染

`src/gl/renderer.ts` + `src/gl/shaders.ts`：

- R32F 高度纹理驱动位移网格；露层索引用 R8 编码 `(idx+1)/12`
- 四种视图：推光漆面（GGX 微表面高光）、纯色稿、薄漆热力图、起伏灰度稿
- 四套灯光预设；交互打磨只 `texSubImage2D` 局部/全量数据纹理，不重建网格

## 数据

`src/data/db.ts` 单库单表（`xipi-lacquer-studio / work_orders`），首次启动灌入 4 个预置件：
三色经典茶盘（5 层）、八层复杂款、方盒、手指捺点茶碗。

## 目录

```
src/
  sim/    纯函数仿真内核（不依赖 DOM，可在 Node 自测）
  gl/     WebGL2 渲染器与 mat4
  data/   IndexedDB 仓储与预置件
  store/  Vue 全局状态
  pages/  六个页面
  components/
scripts/  esbuild 打包的 Node 自测
```
