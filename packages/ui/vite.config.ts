import { defineConfig } from "vite"
import Vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import dts from 'vite-plugin-dts'
import DefineOptions from "unplugin-vue-define-options/vite"
import UnoCSS from 'unocss/vite'

export default defineConfig({
  resolve: {
    dedupe: ['vue','defu',],
  },
  plugins: [
    Vue(),
    vueJsx(),
    dts({
      include: ['./src'],
      // outDir: "./dist",
      insertTypesEntry: false, // 插入TS 入口
      copyDtsFiles: true, // 是否将源码里的 .d.ts 文件复制到 outputDir
    }),
    DefineOptions(),
    UnoCSS({
      include: [/.*\/ui\.js(.*)?$/, './**/*.vue', './**/*.md'],
    }),
  ],
   // 添加库模式配置
  build: {
    lib: {
      entry: "./src/index.ts",
      name: "ui",
    },
    emptyOutDir: false,
    rollupOptions: {
      input: ["./src/index.ts"],
      external: ['vue','unocss'],
      output: {
        globals: {
          vue: 'Vue',
          'defu': 'Defu',
        },
      },
    },
    minify: false, //压缩
    // sourcemap: true, // 输出单独 source文件
    // reportCompressedSize: true,
    cssCodeSplit: true, // 在编译的时候是否要独立输出 css
  },
});
