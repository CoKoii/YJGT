import 'ant-design-vue/dist/reset.css'
import 'vxe-table/lib/style.css'
import './styles.css'

import Antd from 'ant-design-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import VxeUI from 'vxe-pc-ui'
import VxeUITable from 'vxe-table'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(Antd)
app.use(VxeUI)
app.use(VxeUITable)
app.mount('#app')
