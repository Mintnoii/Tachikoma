# Vue 项目模板

## 开发

1. `git clone git@git.xmov.ai:frontend/template-vue-default.git my-app`
2. `cd my-app`
3. `yarn`
4. `yarn run dev`

### 开箱即用

- 🍍 [状态管理 Pinia](https://pinia.esm.dev/)

- 🚦 [路由管理 Vue Router](https://github.com/vuejs/vue-router)

- 🎨 [原子化 UnoCSS](https://unocss.dev/integrations/vite)

- 🍱 [实用的工具包 VueUse](https://github.com/antfu/vueuse)

- 📡 [请求服务封装 services](./src/services)

- 📦 [构建打包配置](./vite.config.ts)

- 📐 [代码规范配置 EditorConifg、Prettier、ESLint](./.eslintrc.js)

- 📤 [提交规范配置 husky、Commitlint 、lint-staged](./.husky/commit-msg)

- 🚀 [部署配置 gitlab-ci.yml](./.gitlab-ci.yml)

- 📢 [飞书通知配置 scirpt/ci-notify](./script/ci-notify/config.mjs)

### Checklist

使用此模板时，请更新以下内容：

- `rm -rf .git` 删除 .git 目录，并运行 `git init` 以清理历史记录
- 更新 package.json 中的 name、description、repository、author 等字段
- 更新 README.md 中的项目描述、开发事项等内容
- 更新 public/index.html 中的 title 字段

And, enjoy :)

### 建议

**👍 推荐优先使用原子化 CSS 实现样式开发**

项目中页面与组件的样式，尽量全部用 `原子化 CSS` 实现。推荐阅读 [重新构想原子化 CSS](https://antfu.me/posts/reimagine-atomic-css-zh)

使用将多个规则组合成单个简写的快捷方式：

比如可能经常有一些组件，需要添加 w-full、h-full 这两个属性，我们可以通过配置一个 wh-full 的快捷方式，来组合这两个规则。

具体项目中已配置的快捷方式可以查看 `unocss.config.ts` 文件中的 `shortcuts`字段。

同时推荐搭配安装 UnoCss 插件，该插件非常的强大，不仅可以提供输入提示，鼠标悬停还能显示编译后的 css 样式，对于自定义的 shortcuts、rules 和 colors 都能生效。
项目中用到的原子化 css 类名，也可以通过 http://localhost:8086/\_\_unocss#/ 查看。

注意：项目安装了 `SCSS` 的预处理器，但请在原子化 CSS 不易实现或是覆盖组件库样式的场景下，再考虑使用 `SCSS` 语法。

## 部署

- 默认只打包与部署测试环境，生产环境只打包，不部署

- 如果需要部署开发环境，则取消 `.gitlab-ci.yml` 中 `开发构建` 与 `开发部署` 相关注释

- 如果需要飞书打包通知，则取消 `.gitlab-ci.yml` 中 `打包通知` 相关注释，并在 `script/ci-notify/config.mjs` 中填写飞书机器人等链接地址
