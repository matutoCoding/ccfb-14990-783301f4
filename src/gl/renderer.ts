// WebGL2 渲染器：高度场网格 + 数据纹理，支持局部 texSubImage 脏区上传

import { VERT_SRC, FRAG_SRC } from './shaders'
import { perspective, lookAt, multiply, orbitEye, invert, transformPoint, type Mat4, type Vec3 } from './mat4'
import type { HeightField } from '@/sim/height_field'
import type { LacquerLayer } from '@/sim/types'

export type ViewMode = 'lit' | 'flat' | 'heat' | 'relief'

export interface LightPreset {
  name: string
  dir: Vec3
  color: Vec3
  ambient: number
  roughness: number
}

export const LIGHT_PRESETS: LightPreset[] = [
  { name: '影棚柔光', dir: [-0.4, -0.5, 0.8], color: [1, 0.97, 0.92], ambient: 0.42, roughness: 0.22 },
  { name: '正午顶光', dir: [0.05, -0.1, 1], color: [1, 1, 1], ambient: 0.35, roughness: 0.16 },
  { name: '暖灯斜照', dir: [-0.8, -0.3, 0.45], color: [1, 0.86, 0.66], ambient: 0.3, roughness: 0.2 },
  { name: '冷调侧光', dir: [0.75, -0.45, 0.5], color: [0.8, 0.88, 1], ambient: 0.28, roughness: 0.18 },
]

interface MeshBox { x0: number; y0: number; x1: number; y1: number }

export class LacquerRenderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private u: Record<string, WebGLUniformLocation | null> = {}
  private heightTex: WebGLTexture
  private indexTex: WebGLTexture
  private heatTex: WebGLTexture
  private maskTex: WebGLTexture
  private vao: WebGLVertexArrayObject
  private vertexBuffer: WebGLBuffer | null = null
  private indexBuffer: WebGLBuffer
  private indexCount = 0
  private nx = 0
  private ny = 0
  private cell = 1
  private indexBytes: Uint8Array
  private heatBytes: Uint8Array
  private maskBytes: Uint8Array
  private layerColors: Vec3[] = []
  viewMode: ViewMode = 'lit'
  light: LightPreset = LIGHT_PRESETS[0]
  yaw = 0.6
  pitch = 0.95
  zScale = 12
  private center: Vec3 = [0, 0, 0]
  private dist = 600
  private viewProj: Mat4 = new Float32Array(16)

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: false })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.gl = gl
    this.program = this.createProgram(VERT_SRC, FRAG_SRC)
    gl.useProgram(this.program)
    this.cacheUniforms()
    this.heightTex = this.makeTex(gl.R32F, gl.RED, gl.FLOAT)
    this.indexTex = this.makeTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE)
    this.heatTex = this.makeTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE)
    this.maskTex = this.makeTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE)
    this.vao = gl.createVertexArray()!
    this.indexBuffer = gl.createBuffer()!
    this.indexBytes = new Uint8Array(0)
    this.heatBytes = new Uint8Array(0)
    this.maskBytes = new Uint8Array(0)
    gl.clearColor(0.07, 0.075, 0.09, 1)
    gl.enable(gl.DEPTH_TEST)
  }

  // 尺寸/胎形变化时重建网格与纹理
  allocate(field: HeightField, layers: LacquerLayer[]): void {
    const gl = this.gl
    this.nx = field.nx
    this.ny = field.ny
    this.cell = field.cell
    this.layerColors = layers.map((l) => [...l.color] as Vec3)
    const n = field.nx * field.ny

    // 网格顶点：每格四角
    const verts = new Float32Array(n * 2)
    let p = 0
    for (let y = 0; y < field.ny; y++) {
      for (let x = 0; x < field.nx; x++) {
        verts[p++] = x
        verts[p++] = y
      }
    }
    const vbo = gl.createBuffer()!
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer)
    this.vertexBuffer = vbo
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // 每格两个三角形
    const indices = new Uint32Array((field.nx - 1) * (field.ny - 1) * 6)
    let q = 0
    for (let y = 0; y < field.ny - 1; y++) {
      for (let x = 0; x < field.nx - 1; x++) {
        const a = y * field.nx + x
        const b = a + 1
        const c = a + field.nx
        const d = c + 1
        indices[q++] = a; indices[q++] = c; indices[q++] = b
        indices[q++] = b; indices[q++] = c; indices[q++] = d
      }
    }
    this.indexCount = indices.length
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    this.indexBytes = new Uint8Array(n)
    this.heatBytes = new Uint8Array(n)
    this.maskBytes = new Uint8Array(n)
    for (let i = 0; i < n; i++) this.maskBytes[i] = field.mask[i] * 255

    gl.bindTexture(gl.TEXTURE_2D, this.heightTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, field.nx, field.ny, 0, gl.RED, gl.FLOAT, field.surface)
    gl.bindTexture(gl.TEXTURE_2D, this.indexTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.nx, field.ny, 0, gl.RED, gl.UNSIGNED_BYTE, this.indexBytes)
    gl.bindTexture(gl.TEXTURE_2D, this.heatTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.nx, field.ny, 0, gl.RED, gl.UNSIGNED_BYTE, this.heatBytes)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.nx, field.ny, 0, gl.RED, gl.UNSIGNED_BYTE, this.maskBytes)

    const span = Math.max(field.nx, field.ny) * field.cell
    this.dist = span * 1.05
    this.center = [0, 0, 0]
  }

  // 全量刷新高度（重放/改参数后）
  uploadHeight(field: HeightField): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.nx, field.ny, gl.RED, gl.FLOAT, field.surface)
  }

  // 局部刷新（交互打磨只传脏盒，省带宽）
  uploadHeightBox(field: HeightField, box: MeshBox): void {
    const gl = this.gl
    const w = box.x1 - box.x0 + 1
    const h = box.y1 - box.y0 + 1
    const sub = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const src = (box.y0 + y) * field.nx + box.x0
      sub.set(field.surface.subarray(src, src + w), y * w)
    }
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, box.x0, box.y0, w, h, gl.RED, gl.FLOAT, sub)
  }

  uploadLayers(layerIndex: Int16Array, box?: MeshBox): void {
    const gl = this.gl
    for (let i = 0; i < layerIndex.length; i++) {
      // 编码 (idx+1)/12*255，磨穿 -1 => 0
      this.indexBytes[i] = Math.round(((layerIndex[i] + 1) / 12) * 255)
    }
    gl.bindTexture(gl.TEXTURE_2D, this.indexTex)
    if (!box) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.nx, this.ny, gl.RED, gl.UNSIGNED_BYTE, this.indexBytes)
    } else {
      const w = box.x1 - box.x0 + 1
      const h = box.y1 - box.y0 + 1
      const sub = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) {
        const src = (box.y0 + y) * this.nx + box.x0
        sub.set(this.indexBytes.subarray(src, src + w), y * w)
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, box.x0, box.y0, w, h, gl.RED, gl.UNSIGNED_BYTE, sub)
    }
  }

  uploadHeat(levels: Uint8Array): void {
    const gl = this.gl
    this.heatBytes.set(levels)
    gl.bindTexture(gl.TEXTURE_2D, this.heatTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.nx, this.ny, gl.RED, gl.UNSIGNED_BYTE, this.heatBytes)
  }

  render(): void {
    const gl = this.gl
    this.resize()
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const aspect = gl.canvas.width / Math.max(1, gl.canvas.height)
    const proj = perspective((45 * Math.PI) / 180, aspect, 1, 5000)
    const eye = orbitEye(this.yaw, this.pitch, this.dist, this.center)
    const view = lookAt(eye, this.center, [0, 1, 0])
    this.viewProj = multiply(proj, view)

    gl.useProgram(this.program)
    gl.uniformMatrix4fv(this.u.uViewProj, false, this.viewProj)
    gl.uniform2f(this.u.uTexel, 1 / this.nx, 1 / this.ny)
    gl.uniform1f(this.u.uCell, this.cell)
    gl.uniform2f(this.u.uOrigin, (-this.nx * this.cell) / 2, (-this.ny * this.cell) / 2)
    gl.uniform1f(this.u.uZScale, this.zScale)
    gl.uniform1i(this.u.uMode, this.modeCode())
    gl.uniform3f(this.u.uCameraPos, eye[0], eye[1], eye[2])
    gl.uniform3f(this.u.uLightDir, this.light.dir[0], this.light.dir[1], this.light.dir[2])
    gl.uniform3f(this.u.uLightColor, this.light.color[0], this.light.color[1], this.light.color[2])
    gl.uniform1f(this.u.uAmbient, this.light.ambient)
    gl.uniform1f(this.u.uRoughness, this.light.roughness)
    gl.uniform1i(this.u.uLayerCount, Math.min(12, this.layerColors.length))
    for (let i = 0; i < 12; i++) {
      const c = this.layerColors[i] ?? [128, 128, 128]
      gl.uniform3f(this.u[`uLayerColors[${i}]`], c[0], c[1], c[2])
    }
    this.bindTex(this.heightTex, 0, this.u.uHeight)
    this.bindTex(this.indexTex, 1, this.u.uIndex)
    this.bindTex(this.heatTex, 2, this.u.uHeat)
    this.bindTex(this.maskTex, 3, this.u.uMask)

    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0)
  }

  // 屏幕像素 -> 工作面世界坐标（在 z=0 参考平面反投影）
  screenToWorld(clientX: number, clientY: number, rect: DOMRect): Vec3 {
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2
    const inv = invert(this.viewProj)
    const near = transformPoint(inv, [ndcX, ndcY, -1])
    const far = transformPoint(inv, [ndcX, ndcY, 1])
    const t = -near[2] / (far[2] - near[2])
    return [near[0] + (far[0] - near[0]) * t, near[1] + (far[1] - near[1]) * t, 0]
  }

  orbit(dx: number, dy: number): void {
    this.yaw += dx * 0.008
    this.pitch = Math.min(1.45, Math.max(0.12, this.pitch + dy * 0.008))
  }

  zoom(factor: number): void {
    this.dist = Math.max(80, Math.min(2000, this.dist * factor))
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteProgram(this.program)
    gl.deleteTexture(this.heightTex)
    gl.deleteTexture(this.indexTex)
    gl.deleteTexture(this.heatTex)
    gl.deleteTexture(this.maskTex)
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer)
    gl.deleteBuffer(this.indexBuffer)
    gl.deleteVertexArray(this.vao)
  }

  private modeCode(): number {
    return this.viewMode === 'lit' ? 0 : this.viewMode === 'flat' ? 1 : this.viewMode === 'heat' ? 2 : 3
  }

  private resize(): void {
    const gl = this.gl
    const canvas = gl.canvas as HTMLCanvasElement
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.floor(canvas.clientWidth * dpr)
    const h = Math.floor(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
  }

  private bindTex(tex: WebGLTexture, unit: number, loc: WebGLUniformLocation | null): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(loc, unit)
  }

  private makeTex(internal: number, format: number, type: number): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 1, 1, 0, format, type, null)
    return tex
  }

  private cacheUniforms(): void {
    const gl = this.gl
    const names = [
      'uViewProj', 'uTexel', 'uCell', 'uOrigin', 'uZScale', 'uMode',
      'uCameraPos', 'uLightDir', 'uLightColor', 'uAmbient', 'uRoughness',
      'uHeight', 'uIndex', 'uHeat', 'uMask', 'uLayerCount',
    ]
    for (const name of names) this.u[name] = gl.getUniformLocation(this.program, name)
    for (let i = 0; i < 12; i++) {
      this.u[`uLayerColors[${i}]`] = gl.getUniformLocation(this.program, `uLayerColors[${i}]`)
    }
  }

  private createProgram(vsrc: string, fsrc: string): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`着色器编译失败: ${gl.getShaderInfoLog(sh)}`)
      }
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsrc))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(prog)}`)
    }
    return prog
  }
}
