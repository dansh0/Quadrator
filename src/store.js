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
    buttons: [
        {'code':  "Anem", 'species': "Anthopleura_sp", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1790"},
        {'code':  "Barn", 'species': "Cirripedia_spp", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1791"},
        {'code':  "Asc", 'species': "Polycarpa sp.", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1792"},
        {'code':  "Spon", 'species': "Haliclona sp.", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1793"},
        {'code':  "Oys", 'species': "Saccostrea scyphophilla", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1794"},
        {'code':  "Colo", 'species': "Other colonial", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1795"},
        {'code':  "Tube", 'species': "Tubeworm", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1796"},
        {'code':  "Eggs", 'species': "Snail eggs", 'group1': "Animal", 'group2': "Intertidal sessile", 'color': "#9c27b0", 'colorSelected': "#7c1797"},
        {'code':  "Cyan", 'species': "Cyanobacteria", 'group1': "Film", 'group2': "Algae", 'color': "#00bcd4", 'colorSelected': "#00acc4"},
        {'code':  "Sarg", 'species': "Sargassum spp. ", 'group1': "Brown", 'group2': "Algae", 'color': "#795548", 'colorSelected': "#694538"},
        {'code':  "Pad", 'species': "Padina", 'group1': "Brown", 'group2': "Algae", 'color': "#795548", 'colorSelected': "#694538"},
        {'code':  "Lob", 'species': "Lobophora variegata", 'group1': "Brown", 'group2': "Algae", 'color': "#795548", 'colorSelected': "#694538"},
        {'code':  "Neo", 'species': "Neomeris sp.", 'group1': "Green", 'group2': "Algae", 'color': "#00c853", 'colorSelected': "#00a833"},
        {'code':  "Bry", 'species': "Bryopsis sp.", 'group1': "Green", 'group2': "Algae", 'color': "#00c853", 'colorSelected': "#00a833"},
        {'code':  "Chae", 'species': "Chaetomorpha antennina", 'group1': "Green", 'group2': "Algae", 'color': "#00c853", 'colorSelected': "#00a833"},
        {'code':  "Caul", 'species': "Caulerpa verticillata", 'group1': "Green", 'group2': "Algae", 'color': "#00c853", 'colorSelected': "#00a833"},
        {'code':  "Hyp", 'species': "Hypnea caespitosa/pannosa", 'group1': "Red", 'group2': "Algae", 'color': "#f44336", 'colorSelected': "#c43326"},
        {'code':  "Pey", 'species': "Peysonnelia rubra", 'group1': "Encrusting", 'group2': "Algae", 'color': "#2196f3", 'colorSelected': "#1576dd"},
        {'code':  "Ralf", 'species': "Ralfsiales/Neoralfsiacae", 'group1': "Encrusting", 'group2': "Algae", 'color': "#2196f3", 'colorSelected': "#1576dd"},
        {'code':  "Cor", 'species': "Corralina", 'group1': "Encrusting", 'group2': "Algae", 'color': "#2196f3", 'colorSelected': "#1576dd"},
        {'code':  "Hydr", 'species': "Hydrolithon farinosum", 'group1': "Encrusting", 'group2': "Algae", 'color': "#2196f3", 'colorSelected': "#1576dd"},
        {'code':  "EAM", 'species': "EAM", 'group1': "Turf", 'group2': "Algae", 'color': "#ffeb3b", 'colorSelected': "#ddcb2b"},
        {'code':  "?", 'species': "Unknown", 'group1': "Other", 'group2': "Other", 'color': "#9e9e9e", 'colorSelected': "#7e7e7e"},
        {'code':  "Sed", 'species': "Sediment", 'group1': "Other", 'group2': "Other", 'color': "#9e9e9e", 'colorSelected': "#7e7e7e"},
        {'code':  "Bare", 'species': "Bare space", 'group1': "Other", 'group2': "Other", 'color': "#9e9e9e", 'colorSelected': "#7e7e7e"},
    ],
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
        RESET_ALL(state) {
            // TODO: pull out all preferences from default state into preference file to avoid overwriting
            let defaultClone = _.cloneDeep(defaultState)
            Object.keys(state).forEach(attrName => {
                state[attrName] = defaultClone[attrName];
            });
        }
    },
    getters: {

    }
})


export { store }