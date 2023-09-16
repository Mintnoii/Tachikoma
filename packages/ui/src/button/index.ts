import type {App,Plugin} from "vue"
// import type ButtonType from './index.vue'
import Button from './index.vue'

// export {ButtonType}
// type SFCWithInstall<T> = T&Plugin
// const withInstall = <T>(comp:T) => {
//     (comp as SFCWithInstall<T>).install = (app:App)=>{
//         //注册组件
//         app.component((comp as any).name,comp)
//     }
//     return comp as SFCWithInstall<T>
// }
// const Button = withInstall(ButtonVue)
export default Button
