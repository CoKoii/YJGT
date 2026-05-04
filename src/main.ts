import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import VxeUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'

const app = createApp(App)

app.use(createPinia())
app.use(Antd)
app.use(VxeUI)
app.use(VXETable)

app.mount('#app')
