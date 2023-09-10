import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // 如果是数组的形式，且只有一个，则打出来的是 dist/index.xx 的文件
    // entry: ['utils/index.ts'],
    // 这样是直接打包到 dist 目录下 dist/utils.xx
    // entry: {
    //   'utils': 'utils/index.ts'
    // },
    // 这样是打包到对应的 dist 子目录下 dist/utils/utils.xx
    entry: {
      'utils/utils': 'utils/index.ts'
    },
    outDir: "dist",
    format: ['cjs', 'esm', 'iife'],
    dts: true, // 添加 .d.ts 文件
    minify: true, // 压缩
    clean: true, // 是否先清除打包的目录，例如 dist
    sourcemap: false, // 添加 sourcemap 文件
    metafile: false, // 添加 meta 文件
    splitting: false, // 没有拆包的需求，关闭拆包能力
  },
])
