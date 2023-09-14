import { defineConfig } from "vite";
import Vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import dts from 'vite-plugin-dts'
import DefineOptions from "unplugin-vue-define-options/vite"

export default defineConfig({

  plugins: [Vue(),vueJsx(),
    dts({
      entryRoot: "./src",
      outDir: ["../comps/es/src", "../comps/lib/src"],
      //指定使用的 tsconfig.json为我们整个项目根目录下,如果不配置,你也可以在components下新建tsconfig.json
      tsconfigPath: "./tsconfig.json",
    }),
    DefineOptions(),
  ],
   // 添加库模式配置
  build: {
    //压缩
    minify: false,
    rollupOptions: {
      //忽略打包 vue 样式文件
      external: ['vue', /\.less/,  /\.scss/],
      input: ["./src/index.ts"],
      output: [
          {
          //打包格式
          format: "es",
          //打包后文件名
          entryFileNames: "[name].mjs",
          //让打包目录和我们目录对应
          preserveModules: true,
          exports: "named",
          //配置打包根目录
          dir: "../comps/es",
        },
        {
          //打包格式
          format: "cjs",
          //打包后文件名
          entryFileNames: "[name].js",
          //让打包目录和我们目录对应
          preserveModules: true,
          exports: "named",
          //配置打包根目录
          dir: "../comps/lib",
        },
      ]
    },
    lib: {
      entry: "./src/index.ts",
      name: "comps",
    },
  },
});
