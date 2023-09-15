import type { App } from 'vue'
// import * as components from './components'
// export * from './components'
// import {Button} from './components'
import 'uno.css'
import Button from './button'

const install = (app: App) => {
  // for (let n in components) {
  //   app.use((components as any)[n])
  // }
    app.component('TestButton', Button);
}

export default install