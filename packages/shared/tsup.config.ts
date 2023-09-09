import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // entry: ['index.ts','types/index.ts',],
    entry: {
      'utils': 'utils/index.ts'
    },
    format: ['cjs', 'esm'],
    outDir: 'dist',
    dts: true, // 添加 .d.ts 文件
    clean: true, // 是否先清除打包的目录，例如 dist
    splitting: false, // 没有拆包的需求，关闭拆包能力
  },
])
