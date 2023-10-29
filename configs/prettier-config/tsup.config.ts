import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/*.ts'],
    outDir: 'dist',
    minify: true,
    clean: true,
    sourcemap: false,
    metafile: false,
    splitting: false,
    legacyOutput: true,
  },
])
