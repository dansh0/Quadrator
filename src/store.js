import Vue from 'vue'
import Vuex from 'vuex'
import { Quadrat } from './dataModel/quadrat.js'

Vue.use(Vuex)

const store = new Vuex.Store({
    state: {
        count: 0,
        imgSrc: undefined,
        imgElem: document.createElement('img'),
        windowHelpers: {
            rightPanelWidth: 400,
            leftPanelWidth: 300,
            height: 400
        },
        buttons: [
            {'code': "F_Gr", 'species': "Filamentous green", 'group': "Filamentous algae"},
            {'code': "F_Br", 'species': "Filamentous brown", 'group': "Filamentous algae"},
            {'code': "M_Gr", 'species': "Larger greens", 'group': "Macroalgae"},
            {'code': "M_Other", 'species': "Other macroalgae", 'group': "Macroalgae"},
            {'code': "M_Pad", 'species': "Padina", 'group': "Macroalgae"},
            {'code': "M_Sar", 'species': "Sargassum", 'group': "Macroalgae"},
            {'code': "M_Lob", 'species': "Lobophora", 'group': "Macroalgae"},
            {'code': "M_Gr_Pl", 'species': "Green plant", 'group': "Macroalgae"},
            {'code': "T_Gr", 'species': "Ephemeral green turf", 'group': "Turfs"},
            {'code': "T_EAM", 'species': "Sediment turf", 'group': "Turfs"},
            {'code': "T_Red", 'species': "Red turf", 'group': "Turfs"},
            {'code': "Cor_Enc", 'species': "Encrusting pink-white", 'group': "Corraline"},
            {'code': "Cor_Lar", 'species': "Large corallines", 'group': "Corraline"},
            {'code': "Enc_Red", 'species': "Encrusting red", 'group': "Encrusting"},
            {'code': "Enc_Br", 'species': "Encrusting brown", 'group': "Encrusting"},
            {'code': "Enc_Bl", 'species': "Encrusting black", 'group': "Encrusting"},
            {'code': "Bio", 'species': "Biofilm", 'group': "Biofilm-cyano"},
            {'code': "Cyan", 'species': "Cyanobacteria", 'group': "Biofilm-cyano"},
            {'code': "Sedi", 'species': "Sediment", 'group': "Sediment"},
            {'code': "Colo", 'species': "Colonial animals", 'group': "Animals-others"},
            {'code': "Mob", 'species': "Mobile animals", 'group': "Animals-others"},
            {'code': "Barn", 'species': "Barnacle", 'group': "Animals-others"},
            {'code': "Muss", 'species': "Mussel", 'group': "Animals-others"},
            {'code': "Oys", 'species': "Oyster", 'group': "Animals-others"},
            {'code': "Tube", 'species': "Tube worm", 'group': "Animals-others"},
            {'code': "Ner", 'species': "Nerite", 'group': "Animals-others"},
            {'code': "Eggs", 'species': "Snail eggs", 'group': "Animals-others"},
            {'code': "B_Sp", 'species': "Bare space", 'group': "Empty"}
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
            'nEdge': 4,
        },
        inputStatus: {
            'sampleNumber': 0,
            'nodes': [],
            'edgesNodes': [],
            'loadedIteration': 0,
        },
        quadratData: {},
        runningData: [] // list of quadrats
    },
    actions: {
    },
    mutations: {
        newQuadrat (state) {
            let numOfSamples = state.quadratSettings.numOfSampleRows * state.quadratSettings.numOfSampleCols
            let quadrat = new Quadrat(numOfSamples, state.imgSrc)
            state.quadratData = quadrat;
        },
        changeImgSrc (state, imagePath) {
            state.imgSrc = imagePath;
        }
    },
    getters: {

    }
})


export { store }