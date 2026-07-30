import Vue from 'vue'
import App from './App.vue'
import router from './router'

Vue.config.productionTip = false

const app = new Vue({
  el: '#app',
  router,
  /*MV3 CSP 禁止 unsafe-eval, 改用 runtime-only 构建 + render 函数*/
  render: h => h(App)
})
if (DEBUG) window.app = app
