// GLSL ES 3.00 着色器源码。高度场纹理驱动，所有画稿在片元着色器完成

export const VERT_SRC = `#version 300 es
precision highp float;
layout(location=0) in vec2 aGrid;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform float uCell;
uniform vec2 uOrigin;
uniform mat4 uViewProj;
uniform float uZScale;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vec2 uv = (aGrid + 0.5) * uTexel;
  float h = texture(uHeight, uv).r;
  vec3 pos = vec3(uOrigin + aGrid * uCell, h * uZScale);
  vWorld = pos;
  vUv = uv;
  gl_Position = uViewProj * vec4(pos, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec2 vUv;
uniform sampler2D uHeight;
uniform sampler2D uIndex;
uniform sampler2D uHeat;
uniform sampler2D uMask;
uniform vec3 uLayerColors[12];
uniform int uLayerCount;
uniform int uMode;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uAmbient;
uniform float uRoughness;
uniform vec2 uTexel;
uniform float uZScale;
out vec4 outColor;

vec3 layerColor(int idx) {
  if (idx < 0) return vec3(0.78, 0.16, 0.14);
  for (int i = 0; i < 12; i++) {
    if (i == idx && i < uLayerCount) return uLayerColors[i] / 255.0;
  }
  return vec3(0.5);
}

vec3 calcNormal(vec2 uv) {
  float hl = texture(uHeight, uv - vec2(uTexel.x, 0.0)).r;
  float hr = texture(uHeight, uv + vec2(uTexel.x, 0.0)).r;
  float hd = texture(uHeight, uv - vec2(0.0, uTexel.y)).r;
  float hu = texture(uHeight, uv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3((hl - hr) * uZScale, (hd - hu) * uZScale, 2.0 * 1.0));
  return n;
}

// GGX/Trowbridge-Reitz 微表面高光，推光漆面低粗糙度 => 锐利高光带层次
float distributionGGX(float ndh, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(0.0001, 3.14159265 * d * d);
}

void main() {
  if (texture(uMask, vUv).r < 0.5) discard;
  // 索引纹理编码：(idx+1)/12，-1 磨穿 => 0
  int idx = int(round(texture(uIndex, vUv).r * 12.0)) - 1;
  vec3 base = layerColor(idx);
  vec3 n = calcNormal(vUv);
  vec3 v = normalize(uCameraPos - vWorld);
  vec3 l = normalize(uLightDir);
  vec3 h = normalize(v + l);
  float ndh = max(dot(n, h), 0.0);
  float ndl = max(dot(n, l), 0.0);
  float ndv = max(dot(n, v), 0.0);
  float spec = distributionGGX(ndh, uRoughness) * ndl / max(0.1, 4.0 * ndv);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 lit = base * (uAmbient + uLightColor * ndl) + uLightColor * spec * (0.2 + fres);

  if (uMode == 1) {
    // 纯色稿：不打光，直接显示露层颜色
    outColor = vec4(base, 1.0);
    return;
  }
  if (uMode == 2) {
    // 热力图：正常 / 偏薄 / 危险 / 磨穿
    float level = texture(uHeat, vUv).r;
    vec3 heat = vec3(0.0);
    if (level > 2.5) heat = vec3(0.85, 0.12, 0.12);
    else if (level > 1.5) heat = vec3(0.95, 0.45, 0.1);
    else if (level > 0.5) heat = vec3(0.98, 0.8, 0.25);
    if (level > 0.5) outColor = vec4(mix(lit, heat, 0.72), 1.0);
    else outColor = vec4(lit, 1.0);
    return;
  }
  if (uMode == 3) {
    // 起伏灰度稿：按高度归一显示，便于检查起底
    float h = texture(uHeight, vUv).r;
    outColor = vec4(vec3(clamp(h * 0.5 + 0.5, 0.0, 1.0)), 1.0);
    return;
  }
  outColor = vec4(lit, 1.0);
}`
