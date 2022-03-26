const vuetify = require('./plugins/vuetify').default;
import { store } from './store.js'
import App from './App.vue'
import Vue from 'vue'

// import vuetify from './plugins/vuetify.js'

console.log(vuetify)

// const { store } = require('./store.js').store;
// const { Vue } = require('vue').default;
// const { App } = require('./App.vue').default;
// const { vuetify } = require('vuetify').default;

Vue.config.productionTip = false

new Vue({
    vuetify,
    render: h => h(App),
    store
}).$mount('#app')
