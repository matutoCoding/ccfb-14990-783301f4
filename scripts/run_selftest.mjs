// 自测运行器：用 esbuild 把 TS 测试打包成临时 ESM 再执行，绕过 node 的别名限制
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { rmSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outfile = resolve(here, '.selftest.bundle.mjs')

try {
  await build({
    entryPoints: [resolve(here, 'selftest.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile,
    alias: { '@': resolve(root, 'src') },
    logLevel: 'warning',
  })
  await import(pathToFileURL(outfile).href)
} finally {
  rmSync(outfile, { force: true })
}
