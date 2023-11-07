import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/*.ts'],
    outDir: 'dist',
    minify: true,
    clean: true,
    shims: true,
    sourcemap: false,
    metafile: false,
    legacyOutput: true,
    // 因为源码中有默认导出，如果不开启这两条，则外部使用时则需要在导入后加上 .default
    cjsInterop: true,
    splitting: true,
  },
])
