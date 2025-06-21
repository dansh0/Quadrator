import Vue from 'vue'
import Vuex from 'vuex'
import { Quadrat } from './dataModel/quadrat.js'
import { InputState } from './InputState.js'
import _ from 'lodash'

Vue.use(Vuex)

const defaultState = {
    count: 0,
    imgSrc: undefined,
    imgPathList: [], //["C://Users//dshor//Documents//Github//Quadrator-Electron//src//assets//B3_1Y_T1.jpg"],
    imgElem: document.createElement('img'),
    windowHelpers: {
        rightPanelWidth: 400,
        leftPanelWidth: 300,
        height: 400
    },
    buttons: [],
    hotKeys: [
        "q",
        "w",
        "e",
        "r",
        "a",
        "s",
        "d",
        "f",
        "z",
        "x",
        "c",
        "v",
        "u",
        "i",
        "o",
        "p",
        "j",
        "k",
        "l",
        ";",
        "m",
        ",",
        ".",
        "/"
    ],
    quadratSettings: {
        'numOfSampleRows': 5,
        'numOfSampleCols': 5,
        'restrictToQuad': false,
    },
    inputStatus: {},
    quadratData: {},
    runningData: [] // list of quadrats and input data
}

const store = new Vuex.Store({
    state: _.cloneDeep(defaultState),
    actions: {
    },
    mutations: {
        NEW_QUADRAT (state) {
            let numOfSamples = state.quadratSettings.numOfSampleRows * state.quadratSettings.numOfSampleCols
            let quadrat = new Quadrat(numOfSamples, state.imgSrc);
            state.inputStatus = new InputState();
            state.quadratData = quadrat;
        },
        UPDATE_RUNNING_DATA (state) {
            let currentImgIndex = state.imgPathList.indexOf(state.quadratData.imgSrc);

            let currentData = {
                inputStatus: state.inputStatus,
                quadratData: state.quadratData
            }

            // save to running list
            if (state.runningData.length == currentImgIndex) {
                // make new entry
                state.runningData.push(currentData);
            } else {
                // update existing entry
                state.runningData[currentImgIndex] = currentData;
            }
        },
        SWAP_QUADRAT (state, swapData) {
            // swap the editable and viewable quadrat with another from running data
            state.quadratData = swapData.quadratData;
            state.inputStatus = swapData.inputStatus;

        },
        CHANGE_IMG_SRC (state, imagePath) {
            state.imgSrc = imagePath;
        },
        // RESET_ALL(state) {
        //     // TODO: pull out all preferences from default state into preference file to avoid overwriting
        //     let defaultClone = _.cloneDeep(defaultState)
        //     Object.keys(state).forEach(attrName => {
        //         state[attrName] = defaultClone[attrName];
        //     });
        // }
    },
    getters: {

    }
})


export { store }