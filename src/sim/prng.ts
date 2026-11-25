// 确定性伪随机：所有随机过程必须经此模块，禁止 Math.random 进入仿真链路

export class Rng {
  private state: number

  constructor(seed: number) {
    // 避免 0 状态卡死
    this.state = seed >>> 0 || 0x9e3779b9
  }

  // uint32
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let z = this.state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return (z ^ (z >>> 14)) >>> 0
  }

  // [0, 1)
  unit(): number {
    return this.next() / 4294967296
  }

  // [min, max)
  range(min: number, max: number): number {
    return min + this.unit() * (max - min)
  }

  // 固定遍历顺序的无重复洗牌
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1)
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
    return arr
  }
}

// 字符串种子稳定哈希到 uint32（OBJ 等场景用）
export function hashString(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// 二维网格值噪声，确定性，用于给凸点高度加自然抖动
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)

  const hash = (ix: number, iy: number): number => {
    let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) >>> 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }

  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
