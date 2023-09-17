import type { App  } from 'vue'
import 'uno.css'
import Button from './button'

// 单独导出组件
export { Button}

// 定义 install 函数的类型
const install = (app: App) => {
  app.component(Button.name, Button)
}

export default install
  // for (let n in components) {
  //   app.use((components as any)[n])
  // }