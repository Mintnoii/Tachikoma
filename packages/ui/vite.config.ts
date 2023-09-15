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
      entryRoot: './src',
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
    cssCodeSplit: true,
  },
});
