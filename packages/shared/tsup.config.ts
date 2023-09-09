import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // entry: ['index.ts'],
    entry: ['utils/index.ts', 'types/index.ts','frp/index.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    target: "esnext", // 指定编译的目标版本
    dts: true, // 添加 .d.ts 文件
    clean: true, // 是否先清除打包的目录，例如 dist
    splitting: false, // 没有拆包的需求，关闭拆包能力
    minify: true, // 压缩
    sourcemap: true, // 添加 sourcemap 文件
    // metafile: true, // 添加 meta 文件
  },
])
