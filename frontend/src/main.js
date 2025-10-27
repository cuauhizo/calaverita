import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import VueGtag from 'vue-gtag-next'

const app = createApp(App)

app.use(router)
app.use(VueGtag, {
  property: {
    id: 'G-2YMYGPM4K3',
  },
})
app.mount('#app')
