import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import VxeUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'
import { createPinia } from 'pinia'
import App from './App.vue'
import { usePortfolioStore } from './stores/portfolio'
import './styles.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(Antd)
app.use(VxeUI)
app.use(VXETable)

const store = usePortfolioStore(pinia)

void store.hydrate().finally(() => {
  app.mount('#app')
})
