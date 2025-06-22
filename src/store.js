import Vue from 'vue'
import Vuex from 'vuex'
import { Quadrat } from './dataModel/quadrat.js'
import { InputState } from './InputState.js'
import _ from 'lodash'

Vue.use(Vuex)

const defaultState = {
    count: 0,
    imgSrc: undefined,
    imgPathList: [],
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
        RESTORE_SESSION(state, sessionState) {
            // Restore the state from the saved session
            state.imgPathList = sessionState.imgPathList;
            state.runningData = sessionState.runningData;

            // Find the correct data to make active
            const currentImgIndex = state.imgPathList.indexOf(sessionState.currentImgSrc);
            if (currentImgIndex !== -1 && state.runningData[currentImgIndex]) {
                const activeData = state.runningData[currentImgIndex];
                state.quadratData = activeData.quadratData;
                state.inputStatus = activeData.inputStatus;
                state.imgSrc = sessionState.currentImgSrc;
            } else if (currentImgIndex !== -1) {
                // Handle the edge case where the app was closed right after loading a new image,
                // before its data was pushed to runningData.
                state.imgSrc = sessionState.currentImgSrc;
                // Create a new, valid Quadrat object for the restored image.
                let numOfSamples = state.quadratSettings.numOfSampleRows * state.quadratSettings.numOfSampleCols;
                state.quadratData = new Quadrat(numOfSamples, state.imgSrc);
                state.inputStatus = new InputState();
            }
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