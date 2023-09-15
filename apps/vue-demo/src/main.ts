import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import TachikomaComps from "@tachikomas/ui"
import 'virtual:uno.css'
import "@tachikomas/ui/dist/style.css"

const app = createApp(App);
app.use(TachikomaComps);
app.mount("#app");
