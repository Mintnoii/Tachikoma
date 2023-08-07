# Tachikomas

A monorepo using:

- Vite / ESBuild
- NPM 7 Workspaces
- Typescript and Typescript Project References
- Vue component library


参考 Vue3 打包流程
- npm run build
- node scripts/build.js
- run
- fs.readdirSync('packages')
- runParallel
- build
- execa
- rollup -c
- return rollup config
- end


## Shared

### frp 函数响应式编程工具函数
- createSingleton 创建单例方法

### url url相关工具函数
- getBaseURL 获取基础 url