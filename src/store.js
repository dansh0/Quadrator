import Vue from 'vue'
import Vuex from 'vuex'
// import path from 'path'

Vue.use(Vuex)

const store = new Vuex.Store({
    state: {
        count: 0,
        imgSrc: undefined,
        windowHelpers: {
            rightPanelWidth: 400,
            leftPanelWidth: 300,
            height: 400
        },
    },
    actions: {

    },
    mutations: {
        changeImgSrc (state, imagePath) {
            state.imgSrc = imagePath;
        }
    },
    getters: {

    }
})


export { store }