import { defineConfig } from "vite";
import Vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

// https://vitejs.dev/config/
const rollupOptions = {
  external: ["vue", "vue-router"],
  output: {
    globals: {
      vue: "Vue",
    },
  },
};
export default defineConfig({

  plugins: [Vue(),vueJsx()],
   // 添加库模式配置
  build: {
    rollupOptions,
    minify:false,
    lib: {
      entry: "./src/index.ts",
      name: "ToolkitComps",
      fileName: "toolkit-comps",
      // 导出模块格式
      formats: ["es", "umd","iife"],
    },
  },
});
