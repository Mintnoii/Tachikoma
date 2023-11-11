import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm'],
    dts: true,
    minify: true,
    clean: true,
    sourcemap: false,
    metafile: false,
    splitting: false,
  },
])
