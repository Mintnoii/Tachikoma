import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import TachikomaComps from "@tachikomas/components"
const app = createApp(App);
app.use(TachikomaComps);
app.mount("#app");
