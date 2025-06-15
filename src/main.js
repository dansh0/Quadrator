const vuetify = require('./plugins/vuetify').default;
import { store } from './store.js'
import App from './App.vue'
import Vue from 'vue'
import {version} from '../package.json';
const { ipcRenderer } = require('electron');
const path = require('path')
const fs = require('fs')
const csv = require('csv-parser')

// import vuetify from './plugins/vuetify.js'

console.log("Version:", version)
console.log(vuetify)
console.log(store)

// import csv of button options
const results = [];
// ipcRenderer.invoke('askUserDir')
//     .then((userDir) => {
//         console.log(userDir)
//         const csvFile = path.join(userDir, 'buttons.csv');
//         console.log(csvFile)
//         fs.createReadStream(csvFile)
//           .pipe(csv())
//           .on('data', (data) => store.state.buttons.push(data))
//           // .on('end', () => {
//           //   console.log(store.state.buttons);
//           // });
//     })
//     .catch((error) => {
//         console.error(error);
//     });


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
